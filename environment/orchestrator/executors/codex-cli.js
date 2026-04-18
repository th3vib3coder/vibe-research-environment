import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// WP-160 Phase 6 Wave 2 — Codex CLI executor.
//
// Mirrors `local-subprocess.js` structure but fixes the command shape to
// `VRE_CODEX_CLI exec --json -` (Codex single-prompt subcommand reading the
// WP-151 input envelope on stdin, emitting the WP-151 output envelope on
// stdout). Does NOT extend `invokeLocalSubprocess` — per the spec we mirror
// rather than compose, to isolate provider-cli failure taxonomy from the
// generic local-subprocess kind.

export const DEFAULT_TIMEOUT_MS = 180_000;
export const SIGKILL_GRACE_MS = 5_000;
export const MAX_STDERR_BYTES = 16 * 1024;

export const INPUT_SCHEMA_VERSION = 'vibe-orch.provider-cli.input.v1';
export const OUTPUT_SCHEMA_VERSION = 'vibe-orch.provider-cli.output.v1';
export const PROVIDER_REF = 'openai/codex';
export const EVIDENCE_MODE = 'real-cli-binding-codex';

const DEFAULT_ARGS = Object.freeze(['exec', '--json', '-']);

// Keep the baseline whitelist identical to local-subprocess, then add the
// Codex-specific keys per WP-160 §Sanitized env passthrough.
const BASE_ENV_WHITELIST = Object.freeze([
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
]);

const PROVIDER_ENV_WHITELIST = Object.freeze([
  'VRE_CODEX_CLI',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', // Codex sometimes proxies Anthropic traffic (WP-160).
  'CODEX_API_KEY',
  'CODEX_HOME',
  'CODEX_CONFIG',
  'XDG_CONFIG_HOME',
]);

export class CodexCliExecutorError extends Error {
  constructor(message, { code, stderr, exitCode, timeoutPhase } = {}) {
    super(message);
    this.name = 'CodexCliExecutorError';
    this.integrationKind = 'provider-cli';
    this.providerRef = PROVIDER_REF;
    this.evidenceMode = EVIDENCE_MODE;
    if (code) this.code = code;
    if (stderr) this.stderr = stderr;
    if (typeof exitCode === 'number') this.exitCode = exitCode;
    if (timeoutPhase) this.timeoutPhase = timeoutPhase;
  }
}

function sanitizeEnv(extraPassthrough = [], overrideEnv = null) {
  const src = overrideEnv ?? process.env;
  const allow = new Set([
    ...BASE_ENV_WHITELIST,
    ...PROVIDER_ENV_WHITELIST,
    ...extraPassthrough,
  ]);
  const env = Object.create(null);
  for (const key of allow) {
    if (src[key] !== undefined) {
      env[key] = src[key];
    }
  }
  return env;
}

function truncateStderr(buffers) {
  const joined = Buffer.concat(buffers);
  if (joined.length <= MAX_STDERR_BYTES) {
    return joined.toString('utf8');
  }
  return (
    joined.slice(0, MAX_STDERR_BYTES).toString('utf8') +
    `\n...[truncated ${joined.length - MAX_STDERR_BYTES} bytes]`
  );
}

function resolveCommand(overrideEnv = null) {
  const src = overrideEnv ?? process.env;
  const command = src.VRE_CODEX_CLI;
  if (typeof command !== 'string' || command.trim() === '') {
    throw new CodexCliExecutorError(
      'codex-cli: VRE_CODEX_CLI is not set. Export it to an absolute path or bare binary name before invoking the Codex provider binding.',
      { code: 'dependency-unavailable' },
    );
  }
  // Reject shell command strings per WP-160 "Provider Binding Decisions
  // Frozen For Wave 4": pipes, redirects, semicolons, ampersands, or
  // embedded args (`command --flag`) are NOT the binary field — those
  // belong in factory config. Bare spaces are allowed so that Windows
  // paths like `C:\Program Files\nodejs\node.exe` remain valid; we reject
  // arguments by detecting a flag token after whitespace.
  if (/[|<>;&]/u.test(command)) {
    throw new CodexCliExecutorError(
      `codex-cli: VRE_CODEX_CLI must not contain shell metacharacters (|, <, >, ;, &): "${command}".`,
      { code: 'contract-mismatch' },
    );
  }
  if (/\s+-/u.test(command)) {
    throw new CodexCliExecutorError(
      `codex-cli: VRE_CODEX_CLI must be a bare binary name or absolute path, not a shell command string with embedded args: "${command}".`,
      { code: 'contract-mismatch' },
    );
  }
  return command;
}

function serializeInputEnvelope(payload) {
  // WP-151 envelope on stdin. Payload comes straight from review-lane.js:
  //   { task, comparedArtifactRefs, continuity }
  // We enclose it inside the versioned envelope so downstream CLIs never
  // see bare orchestrator data.
  const envelope = {
    schemaVersion: INPUT_SCHEMA_VERSION,
    task: payload?.task ?? null,
    payload: payload ?? {},
  };
  return JSON.stringify(envelope) + '\n';
}

function validateOutputEnvelope(parsed) {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CodexCliExecutorError(
      'codex-cli stdout must be a JSON object with a schemaVersion field.',
      { code: 'contract-mismatch' },
    );
  }
  if (parsed.schemaVersion !== OUTPUT_SCHEMA_VERSION) {
    throw new CodexCliExecutorError(
      `codex-cli output schemaVersion "${parsed.schemaVersion ?? 'missing'}" does not match "${OUTPUT_SCHEMA_VERSION}".`,
      { code: 'contract-mismatch' },
    );
  }
  return parsed;
}

export async function invokeCodexCli({
  stdinPayload = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  args = DEFAULT_ARGS,
  signal = null,
} = {}) {
  const command = resolveCommand(overrideEnv);
  const spawnArgs = Array.isArray(args) ? args : DEFAULT_ARGS;
  const env = sanitizeEnv(envPassthrough, overrideEnv);

  // Windows-only `.cmd`/`.bat` accommodation (mirrors claude-cli.js).
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: useShell,
      });
    } catch (error) {
      reject(new CodexCliExecutorError(
        `codex-cli spawn failed: ${error.message}`,
        { code: error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure' },
      ));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let timeoutPhase = null;
    let timedOut = false;
    let killTimer = null;
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    };

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const sigtermTimer = setTimeout(() => {
      timedOut = true;
      timeoutPhase = 'sigterm';
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      killTimer = setTimeout(() => {
        timeoutPhase = 'sigkill';
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, SIGKILL_GRACE_MS);
    }, timeoutMs);

    const clearTimers = () => {
      clearTimeout(sigtermTimer);
      if (killTimer) clearTimeout(killTimer);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    child.on('error', (error) => {
      clearTimers();
      const code = error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure';
      reject(new CodexCliExecutorError(
        `codex-cli error: ${error.message}`,
        { code, stderr: truncateStderr(stderrChunks) },
      ));
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (exitCode, closeSignal) => {
      clearTimers();

      const stderrText = truncateStderr(stderrChunks);

      if (aborted) {
        reject(new CodexCliExecutorError(
          'codex-cli aborted by parent signal.',
          { code: 'tool-failure', stderr: stderrText },
        ));
        return;
      }

      if (timedOut) {
        reject(new CodexCliExecutorError(
          `codex-cli timed out after ${timeoutMs}ms (${timeoutPhase}).`,
          { code: 'tool-failure', stderr: stderrText, timeoutPhase },
        ));
        return;
      }

      if (typeof exitCode === 'number' && exitCode !== 0) {
        reject(new CodexCliExecutorError(
          `codex-cli exited with code ${exitCode}.`,
          { code: 'tool-failure', stderr: stderrText, exitCode },
        ));
        return;
      }

      if (closeSignal) {
        reject(new CodexCliExecutorError(
          `codex-cli terminated by signal ${closeSignal}.`,
          { code: 'tool-failure', stderr: stderrText },
        ));
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        reject(new CodexCliExecutorError(
          `codex-cli stdout is not valid JSON: ${error.message}`,
          { code: 'contract-mismatch', stderr: stderrText },
        ));
        return;
      }

      try {
        resolve(validateOutputEnvelope(parsed));
      } catch (error) {
        error.stderr = stderrText;
        reject(error);
      }
    });

    try {
      child.stdin.end(serializeInputEnvelope(stdinPayload));
    } catch (error) {
      clearTimers();
      reject(new CodexCliExecutorError(
        `codex-cli stdin write failed: ${error.message}`,
        { code: 'tool-failure' },
      ));
    }
  });
}

export function buildCodexCliExecutor({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  args = DEFAULT_ARGS,
} = {}) {
  return async function codexCliExecutor(payload = {}, _binding) {
    return invokeCodexCli({
      stdinPayload: payload,
      timeoutMs,
      envPassthrough,
      overrideEnv,
      args,
    });
  };
}

// ----------------------------------------------------------------------------
// Phase 6.1 FU-6-002 — real Codex CLI envelope adapter.
//
// The Wave 2 invokeCodexCli above assumed the Codex CLI reads a v1 JSON
// envelope on stdin and emits a single v1 JSON envelope on stdout. Real
// codex emits a JSONL event STREAM on stdout and writes the final assistant
// message to a separate file via --output-last-message.
//
// invokeRealCodexCli bridges the gap: it embeds the v1 input envelope into a
// prompt, spawns codex with the --output-last-message tmpfile flag, and then
// reads the tmpfile. Legacy invokeCodexCli stays intact for Wave 2 fake-CLI
// regression tests.
// ----------------------------------------------------------------------------

const REAL_CODEX_RAW_TRUNCATE_BYTES = 4 * 1024;

function resolveProjectRootFromPayload(stdinPayload) {
  const raw = stdinPayload?.projectPath;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CodexCliExecutorError(
      'codex-cli real binding requires stdinPayload.projectPath so artifact refs resolve from the intended project root.',
      { code: 'contract-mismatch' },
    );
  }
  return path.resolve(raw);
}

function buildCodexReviewPrompt(envelope, projectRoot) {
  const envelopeJson = JSON.stringify(envelope, null, 2);
  return [
    'You are the review executor for a VRE session-digest-review task.',
    '',
    'Below is the input envelope the orchestrator handed you. Inspect the',
    'artifacts referenced in `payload.comparedArtifactRefs` and produce an',
    'adversarial review verdict.',
    '',
    `Project root (absolute): ${projectRoot}`,
    'All relative artifact paths MUST be resolved from that project root.',
    '',
    '```json',
    envelopeJson,
    '```',
    '',
    'Return ONLY a JSON object matching this exact shape (no markdown fences,',
    'no preamble, no trailing text):',
    '',
    '{',
    `  "schemaVersion": "${OUTPUT_SCHEMA_VERSION}",`,
    '  "verdict": "affirmed" | "challenged" | "inconclusive",',
    '  "materialMismatch": true | false,',
    '  "summary": "<one-sentence verdict rationale>",',
    '  "followUpAction": "none" | "reroute" | "escalate" | "revise" | "accept-with-warning",',
    '  "evidenceRefs": ["<path or lane-run id>", ...]',
    '}',
    '',
    'Rules:',
    '- `verdict`: "affirmed" if the artifacts substantiate the execution claim,',
    '  "challenged" if they contradict it, "inconclusive" if evidence is partial.',
    '- `materialMismatch`: true only if you found a concrete discrepancy.',
    '- `summary`: plain text, single sentence, no newlines.',
    '- `followUpAction`: "none" only when verdict is "affirmed".',
    '- `evidenceRefs`: list of refs from the input envelope you actually used.',
    '',
    'No explanatory prose before or after the JSON.',
  ].join('\n');
}

async function withTmpDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-codex-cli-'));
  try {
    return await fn(dir);
  } finally {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; do not mask the caller's error
    }
  }
}

function truncateRaw(raw) {
  if (raw.length <= REAL_CODEX_RAW_TRUNCATE_BYTES) return raw;
  return (
    raw.slice(0, REAL_CODEX_RAW_TRUNCATE_BYTES) +
    `\n...[truncated ${raw.length - REAL_CODEX_RAW_TRUNCATE_BYTES} chars]`
  );
}

function stripCodeFences(text) {
  // Some models wrap JSON in ```json ... ``` despite being told not to.
  // Strip the outermost fence if present.
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/mu.exec(text);
  if (fenced) return fenced[1];
  return text;
}

export async function invokeRealCodexCli({
  stdinPayload = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  signal = null,
} = {}) {
  const command = resolveCommand(overrideEnv);
  const projectRoot = resolveProjectRootFromPayload(stdinPayload);
  const env = sanitizeEnv(envPassthrough, overrideEnv);
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);

  const envelope = {
    schemaVersion: INPUT_SCHEMA_VERSION,
    task: stdinPayload?.task ?? null,
    payload: stdinPayload ?? {},
  };
  const prompt = buildCodexReviewPrompt(envelope, projectRoot);

  return withTmpDir(async (dir) => {
    const lastMessagePath = path.join(dir, 'last-message.txt');
    const subprocArgs = ['exec', '--output-last-message', lastMessagePath, '--skip-git-repo-check', '-'];

    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(command, subprocArgs, {
          cwd: projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          shell: useShell,
        });
      } catch (error) {
        reject(new CodexCliExecutorError(
          `codex-cli spawn failed: ${error.message}`,
          { code: error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure' },
        ));
        return;
      }

      const stderrChunks = [];
      let timeoutPhase = null;
      let timedOut = false;
      let killTimer = null;
      let aborted = false;

      const onAbort = () => {
        aborted = true;
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
      };
      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const sigtermTimer = setTimeout(() => {
        timedOut = true;
        timeoutPhase = 'sigterm';
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        killTimer = setTimeout(() => {
          timeoutPhase = 'sigkill';
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }, SIGKILL_GRACE_MS);
      }, timeoutMs);

      const clearTimers = () => {
        clearTimeout(sigtermTimer);
        if (killTimer) clearTimeout(killTimer);
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }
      };

      child.on('error', (error) => {
        clearTimers();
        const code = error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure';
        reject(new CodexCliExecutorError(
          `codex-cli error: ${error.message}`,
          { code, stderr: truncateStderr(stderrChunks) },
        ));
      });

      // codex JSONL event stream is discarded; final message arrives via
      // lastMessagePath. stderr captured for diagnostics.
      child.stdout.on('data', () => { /* discard event stream */ });
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

      child.on('close', async (exitCode, closeSignal) => {
        clearTimers();
        const stderrText = truncateStderr(stderrChunks);

        if (aborted) {
          reject(new CodexCliExecutorError(
            'codex-cli aborted by parent signal.',
            { code: 'tool-failure', stderr: stderrText },
          ));
          return;
        }
        if (timedOut) {
          reject(new CodexCliExecutorError(
            `codex-cli timed out after ${timeoutMs}ms (${timeoutPhase}).`,
            { code: 'tool-failure', stderr: stderrText, timeoutPhase },
          ));
          return;
        }
        if (typeof exitCode === 'number' && exitCode !== 0) {
          reject(new CodexCliExecutorError(
            `codex-cli exited with code ${exitCode}.`,
            { code: 'tool-failure', stderr: stderrText, exitCode },
          ));
          return;
        }
        if (closeSignal) {
          reject(new CodexCliExecutorError(
            `codex-cli terminated by signal ${closeSignal}.`,
            { code: 'tool-failure', stderr: stderrText },
          ));
          return;
        }

        let raw;
        try {
          raw = (await readFile(lastMessagePath, 'utf8')).trim();
        } catch (error) {
          reject(new CodexCliExecutorError(
            `codex-cli did not produce a last-message file: ${error.message}`,
            { code: 'contract-mismatch', stderr: stderrText },
          ));
          return;
        }

        if (!raw) {
          reject(new CodexCliExecutorError(
            'codex-cli last-message file was empty.',
            { code: 'contract-mismatch', stderr: stderrText },
          ));
          return;
        }

        const unfenced = stripCodeFences(raw);
        let parsed;
        try {
          parsed = JSON.parse(unfenced);
        } catch (error) {
          reject(new CodexCliExecutorError(
            `codex-cli last message is not valid JSON: ${error.message}. Raw output (truncated): ${truncateRaw(raw)}`,
            { code: 'contract-mismatch', stderr: stderrText },
          ));
          return;
        }

        try {
          resolve(validateOutputEnvelope(parsed));
        } catch (error) {
          error.stderr = stderrText;
          reject(error);
        }
      });

      try {
        child.stdin.end(prompt);
      } catch (error) {
        clearTimers();
        reject(new CodexCliExecutorError(
          `codex-cli stdin write failed: ${error.message}`,
          { code: 'tool-failure' },
        ));
      }
    });
  });
}

export function buildRealCodexCliExecutor({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
} = {}) {
  return async function realCodexCliExecutor(payload = {}, _binding) {
    return invokeRealCodexCli({
      stdinPayload: payload,
      timeoutMs,
      envPassthrough,
      overrideEnv,
    });
  };
}
