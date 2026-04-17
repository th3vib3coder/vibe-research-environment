import { spawn } from 'node:child_process';

export const DEFAULT_TIMEOUT_MS = 45_000;
export const SIGKILL_GRACE_MS = 2_000;
export const MAX_STDERR_BYTES = 4 * 1024;

const DEFAULT_ENV_WHITELIST = Object.freeze([
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

const DEFAULT_SCHEMA_INPUT = 'vibe-orch.local-subprocess.input.v1';
const DEFAULT_SCHEMA_OUTPUT = 'vibe-orch.local-subprocess.output.v1';

export class LocalSubprocessError extends Error {
  constructor(message, { code, stderr, exitCode, timeoutPhase } = {}) {
    super(message);
    this.name = 'LocalSubprocessError';
    if (code) this.code = code;
    if (stderr) this.stderr = stderr;
    if (typeof exitCode === 'number') this.exitCode = exitCode;
    if (timeoutPhase) this.timeoutPhase = timeoutPhase;
  }
}

function sanitizeEnv(passthrough = [], overrideEnv = null) {
  const src = overrideEnv ?? process.env;
  const allow = new Set([...DEFAULT_ENV_WHITELIST, ...passthrough]);
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
  return joined.slice(0, MAX_STDERR_BYTES).toString('utf8') + `\n...[truncated ${joined.length - MAX_STDERR_BYTES} bytes]`;
}

export async function invokeLocalSubprocess({
  command,
  args = [],
  stdinPayload = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  overrideEnv = null,
  stdinSchema = DEFAULT_SCHEMA_INPUT,
  stdoutSchema = DEFAULT_SCHEMA_OUTPUT,
} = {}) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new LocalSubprocessError('local-subprocess: command is required', { code: 'contract-mismatch' });
  }

  const spawnArgs = Array.isArray(args) ? args : [];
  const env = sanitizeEnv(envPassthrough, overrideEnv);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: false,
      });
    } catch (error) {
      reject(new LocalSubprocessError(`local-subprocess spawn failed: ${error.message}`, {
        code: error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure',
      }));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let timeoutPhase = null;
    let timedOut = false;
    let killTimer = null;

    const clearTimers = () => {
      if (killTimer) clearTimeout(killTimer);
    };

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

    child.on('error', (error) => {
      clearTimeout(sigtermTimer);
      clearTimers();
      const code = error.code === 'ENOENT' ? 'dependency-unavailable' : 'tool-failure';
      reject(new LocalSubprocessError(`local-subprocess error: ${error.message}`, {
        code,
        stderr: truncateStderr(stderrChunks),
      }));
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (exitCode, signal) => {
      clearTimeout(sigtermTimer);
      clearTimers();

      const stderrText = truncateStderr(stderrChunks);

      if (timedOut) {
        reject(new LocalSubprocessError(
          `local-subprocess timed out after ${timeoutMs}ms (${timeoutPhase}).`,
          { code: 'tool-failure', stderr: stderrText, timeoutPhase },
        ));
        return;
      }

      if (typeof exitCode === 'number' && exitCode !== 0) {
        reject(new LocalSubprocessError(
          `local-subprocess exited with code ${exitCode}.`,
          { code: 'tool-failure', stderr: stderrText, exitCode },
        ));
        return;
      }

      if (signal) {
        reject(new LocalSubprocessError(
          `local-subprocess terminated by signal ${signal}.`,
          { code: 'tool-failure', stderr: stderrText },
        ));
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        reject(new LocalSubprocessError(
          `local-subprocess stdout is not valid JSON: ${error.message}`,
          { code: 'contract-mismatch', stderr: stderrText },
        ));
        return;
      }

      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(new LocalSubprocessError(
          'local-subprocess stdout must be a JSON object with a schemaVersion field.',
          { code: 'contract-mismatch', stderr: stderrText },
        ));
        return;
      }

      if (parsed.schemaVersion !== stdoutSchema) {
        reject(new LocalSubprocessError(
          `local-subprocess output schemaVersion "${parsed.schemaVersion ?? 'missing'}" does not match "${stdoutSchema}".`,
          { code: 'contract-mismatch', stderr: stderrText },
        ));
        return;
      }

      resolve(parsed);
    });

    try {
      const envelope = {
        schemaVersion: stdinSchema,
        ...(stdinPayload ?? {}),
      };
      child.stdin.end(JSON.stringify(envelope) + '\n');
    } catch (error) {
      clearTimeout(sigtermTimer);
      clearTimers();
      reject(new LocalSubprocessError(`local-subprocess stdin write failed: ${error.message}`, {
        code: 'tool-failure',
      }));
    }
  });
}

export function buildLocalSubprocessExecutor({
  command,
  args = [],
  envPassthrough = [],
  timeoutMs,
} = {}) {
  return async function localSubprocessExecutor(payload = {}, _binding) {
    return invokeLocalSubprocess({
      command,
      args,
      envPassthrough,
      timeoutMs,
      stdinPayload: payload,
    });
  };
}
