import { spawn } from 'node:child_process';

// WP-161 Phase 6 Wave 2 — Claude CLI executor.
//
// Behavioral delta vs Codex (per WP-161):
//   - Command shape is `VRE_CLAUDE_CLI -p <envelopeJson> --output-format json`
//     (prompt-first, NOT stdin envelope).
//   - Claude emits `{ type: "result", result: "<string>", ... }` — the
//     wrapper MUST `JSON.parse(result)` and re-validate against the WP-151
//     output envelope. If `type !== "result"` OR `result` is not parseable
//     as a JSON object matching the schema → `contract-mismatch`.

export const DEFAULT_TIMEOUT_MS = 180_000;
export const SIGKILL_GRACE_MS = 5_000;
export const MAX_STDERR_BYTES = 16 * 1024;

export const INPUT_SCHEMA_VERSION = 'vibe-orch.provider-cli.input.v1';
export const OUTPUT_SCHEMA_VERSION = 'vibe-orch.provider-cli.output.v1';
export const PROVIDER_REF = 'anthropic/claude';
export const EVIDENCE_MODE = 'real-cli-binding-claude';

const DEFAULT_TRAILING_ARGS = Object.freeze(['--output-format', 'json']);

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
  'VRE_CLAUDE_CLI',
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'CLAUDE_CONFIG_DIR',
  'XDG_CONFIG_HOME',
]);

export class ClaudeCliExecutorError extends Error {
  constructor(message, { code, stderr, exitCode, timeoutPhase } = {}) {
    super(message);
    this.name = 'ClaudeCliExecutorError';
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
  const command = src.VRE_CLAUDE_CLI;
  if (typeof command !== 'string' || command.trim() === '') {
    throw new ClaudeCliExecutorError(
      'claude-cli: VRE_CLAUDE_CLI is not set. Export it to an absolute path or bare binary name before invoking the Claude provider binding.',
      { code: 'dependency-unavailable' },
    );
  }
  if (/[|<>;&]/u.test(command)) {
    throw new ClaudeCliExecutorError(
      `claude-cli: VRE_CLAUDE_CLI must not contain shell metacharacters (|, <, >, ;, &): "${command}".`,
      { code: 'contract-mismatch' },
    );
  }
  if (/\s+-/u.test(command)) {
    throw new ClaudeCliExecutorError(
      `claude-cli: VRE_CLAUDE_CLI must be a bare binary name or absolute path, not a shell command string with embedded args: "${command}".`,
      { code: 'contract-mismatch' },
    );
  }
  return command;
}

function serializeInputEnvelope(payload) {
  const envelope = {
    schemaVersion: INPUT_SCHEMA_VERSION,
    task: payload?.task ?? null,
    payload: payload ?? {},
  };
  return JSON.stringify(envelope);
}

function unwrapClaudeResult(parsed) {
  // Claude `--output-format json` wraps the assistant turn in a meta-envelope.
  // We require `{ type: "result", result: "<json-string>" }` per WP-161.
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClaudeCliExecutorError(
      'claude-cli stdout is not a JSON object; expected Claude meta-envelope with type/result fields.',
      { code: 'contract-mismatch' },
    );
  }
  if (parsed.type !== 'result') {
    throw new ClaudeCliExecutorError(
      `claude-cli meta-envelope type "${parsed.type ?? 'missing'}" is not "result"; wrapper cannot unwrap to a review verdict.`,
      { code: 'contract-mismatch' },
    );
  }
  if (typeof parsed.result !== 'string') {
    throw new ClaudeCliExecutorError(
      'claude-cli meta-envelope "result" must be a string containing a JSON-encoded review envelope.',
      { code: 'contract-mismatch' },
    );
  }

  let inner;
  try {
    inner = JSON.parse(parsed.result);
  } catch (error) {
    throw new ClaudeCliExecutorError(
      `claude-cli "result" field is not parseable JSON: ${error.message}. The review prompt must instruct Claude to emit a JSON envelope.`,
      { code: 'contract-mismatch' },
    );
  }

  if (inner == null || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new ClaudeCliExecutorError(
      'claude-cli "result" JSON must decode to an object with a schemaVersion field.',
      { code: 'contract-mismatch' },
    );
  }

  if (inner.schemaVersion !== OUTPUT_SCHEMA_VERSION) {
    throw new ClaudeCliExecutorError(
      `claude-cli output schemaVersion "${inner.schemaVersion ?? 'missing'}" does not match "${OUTPUT_SCHEMA_VERSION}".`,
      { code: 'contract-mismatch' },
    );
  }

  return inner;
}

export async function invokeClaudeCli({
  stdinPayload = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  trailingArgs = DEFAULT_TRAILING_ARGS,
  signal = null,
} = {}) {
  const command = resolveCommand(overrideEnv);
  const env = sanitizeEnv(envPassthrough, overrideEnv);
  const envelopeJson = serializeInputEnvelope(stdinPayload);
  const extraArgs = Array.isArray(trailingArgs) ? trailingArgs : DEFAULT_TRAILING_ARGS;
  const spawnArgs = ['-p', envelopeJson, ...extraArgs];

  // Windows-only: npm global installs of CLIs (e.g., `claude`) typically
  // ship as `.cmd` shims. Node's `spawn(path.cmd, args, {shell:false})`
  // fails with EINVAL on Windows because batch files are not directly
  // executable. When we detect a Windows `.cmd`/`.bat` target we flip
  // shell on — args still pass through, no user-supplied command string
  // is joined (we validated there were no shell metacharacters upstream).
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, spawnArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        shell: useShell,
      });
    } catch (error) {
      reject(new ClaudeCliExecutorError(
        `claude-cli spawn failed: ${error.message}`,
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
      reject(new ClaudeCliExecutorError(
        `claude-cli error: ${error.message}`,
        { code, stderr: truncateStderr(stderrChunks) },
      ));
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (exitCode, closeSignal) => {
      clearTimers();

      const stderrText = truncateStderr(stderrChunks);

      if (aborted) {
        reject(new ClaudeCliExecutorError(
          'claude-cli aborted by parent signal.',
          { code: 'tool-failure', stderr: stderrText },
        ));
        return;
      }

      if (timedOut) {
        reject(new ClaudeCliExecutorError(
          `claude-cli timed out after ${timeoutMs}ms (${timeoutPhase}).`,
          { code: 'tool-failure', stderr: stderrText, timeoutPhase },
        ));
        return;
      }

      if (typeof exitCode === 'number' && exitCode !== 0) {
        reject(new ClaudeCliExecutorError(
          `claude-cli exited with code ${exitCode}.`,
          { code: 'tool-failure', stderr: stderrText, exitCode },
        ));
        return;
      }

      if (closeSignal) {
        reject(new ClaudeCliExecutorError(
          `claude-cli terminated by signal ${closeSignal}.`,
          { code: 'tool-failure', stderr: stderrText },
        ));
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        reject(new ClaudeCliExecutorError(
          `claude-cli stdout is not valid JSON: ${error.message}`,
          { code: 'contract-mismatch', stderr: stderrText },
        ));
        return;
      }

      try {
        resolve(unwrapClaudeResult(parsed));
      } catch (error) {
        error.stderr = stderrText;
        reject(error);
      }
    });
  });
}

export function buildClaudeCliExecutor({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  trailingArgs = DEFAULT_TRAILING_ARGS,
} = {}) {
  return async function claudeCliExecutor(payload = {}, _binding) {
    return invokeClaudeCli({
      stdinPayload: payload,
      timeoutMs,
      envPassthrough,
      overrideEnv,
      trailingArgs,
    });
  };
}
