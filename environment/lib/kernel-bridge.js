/**
 * WP-155 — Kernel bridge helper module.
 *
 * Implements the Phase 6 Wave 0 WP-150 kernel-bridge integration contract as
 * the ONLY place in VRE allowed to spawn the sibling kernel's
 * `plugin/scripts/core-reader-cli.js`. Produces a typed-duck reader whose
 * shape matches what middleware.deriveSignals, orchestrator lanes and the
 * `bin/vre` dispatcher already consume.
 *
 * Spawn ergonomics mirror environment/evals/measure-context-baseline.js
 * (stdin-JSON, stdout-JSON, stderr capture, typed error on non-zero exit).
 * Timeout + SIGTERM/SIGKILL pattern mirrors
 * environment/orchestrator/executors/local-subprocess.js.
 *
 * @see blueprints/definitive-spec/implementation-plan/phase6-01-wave-0-contracts-and-scope.md WP-150
 * @see blueprints/definitive-spec/implementation-plan/phase6-02-wave-1-kernel-bridge-integration.md WP-155
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_TIMEOUT_MS = 10_000; // WP-150 default
export const SIGKILL_GRACE_MS = 2_000;
export const MAX_STDERR_BYTES = 4 * 1024;

// Copied from environment/orchestrator/executors/local-subprocess.js:7-20 per
// WP-155 rule (prefer copy to avoid deep refactor scope). If this list ever
// grows in local-subprocess.js, this copy must be updated in tandem.
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

// The nine projections frozen in WP-150's typed-duck contract.
const PROJECTION_NAMES = Object.freeze([
  'listClaimHeads',
  'listUnresolvedClaims',
  'listCitationChecks',
  'getProjectOverview',
  'listLiteratureSearches',
  'listObserverAlerts',
  'listGateChecks',
  'getStateSnapshot',
]);

export class KernelBridgeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'KernelBridgeError';
    if (options.projection) this.projection = options.projection;
    if (options.stderr) this.stderr = options.stderr;
    if (typeof options.exitCode === 'number') this.exitCode = options.exitCode;
  }
}

export class KernelBridgeUnavailableError extends KernelBridgeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'KernelBridgeUnavailableError';
  }
}

export class KernelBridgeContractMismatchError extends KernelBridgeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'KernelBridgeContractMismatchError';
  }
}

export class KernelBridgeTimeoutError extends KernelBridgeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'KernelBridgeTimeoutError';
    if (options.timeoutPhase) this.timeoutPhase = options.timeoutPhase;
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
  return (
    joined.slice(0, MAX_STDERR_BYTES).toString('utf8') +
    `\n...[truncated ${joined.length - MAX_STDERR_BYTES} bytes]`
  );
}

/**
 * Spawn the kernel CLI for a single projection call.
 *
 * @param {object} args
 * @param {string} args.cliPath  Absolute path to core-reader-cli.js
 * @param {string} args.kernelRoot  Sibling root used as spawn cwd
 * @param {string} args.projection  Projection name (also passed as argv[1])
 * @param {object} args.stdinPayload  JSON payload written to child stdin
 * @param {number} args.timeoutMs  Per-projection timeout in ms
 * @param {string[]} args.envPassthrough  Extra env keys to forward
 * @returns {Promise<object>} The envelope's `data` field on success
 */
function invokeCoreReaderCli({
  cliPath,
  kernelRoot,
  projection,
  stdinPayload,
  timeoutMs,
  envPassthrough,
}) {
  return new Promise((resolve, reject) => {
    const env = sanitizeEnv(envPassthrough);
    let child;
    try {
      child = spawn(process.execPath, [cliPath, projection], {
        cwd: kernelRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: false,
      });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        reject(
          new KernelBridgeUnavailableError(
            `kernel-bridge: core-reader-cli not spawnable: ${error.message}`,
            { projection, cause: error },
          ),
        );
        return;
      }
      reject(
        new KernelBridgeError(
          `kernel-bridge: spawn failed: ${error.message}`,
          { projection, cause: error },
        ),
      );
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let timeoutPhase = null;
    let timedOut = false;
    let killTimer = null;

    const clearKillTimer = () => {
      if (killTimer) clearTimeout(killTimer);
    };

    const sigtermTimer = setTimeout(() => {
      timedOut = true;
      timeoutPhase = 'sigterm';
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore — child may already be dead
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
      clearKillTimer();
      if (error && error.code === 'ENOENT') {
        reject(
          new KernelBridgeUnavailableError(
            `kernel-bridge: core-reader-cli not found: ${error.message}`,
            { projection, cause: error, stderr: truncateStderr(stderrChunks) },
          ),
        );
        return;
      }
      reject(
        new KernelBridgeError(
          `kernel-bridge: child error: ${error.message}`,
          { projection, cause: error, stderr: truncateStderr(stderrChunks) },
        ),
      );
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (exitCode, signal) => {
      clearTimeout(sigtermTimer);
      clearKillTimer();

      const stderrText = truncateStderr(stderrChunks);

      if (timedOut) {
        reject(
          new KernelBridgeTimeoutError(
            `kernel-bridge: projection "${projection}" timed out after ${timeoutMs}ms (${timeoutPhase}).`,
            { projection, stderr: stderrText, timeoutPhase },
          ),
        );
        return;
      }

      if (typeof exitCode === 'number' && exitCode !== 0) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: projection "${projection}" exited with code ${exitCode}.`,
            { projection, stderr: stderrText, exitCode },
          ),
        );
        return;
      }

      if (signal) {
        reject(
          new KernelBridgeError(
            `kernel-bridge: projection "${projection}" terminated by signal ${signal}.`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
      let envelope;
      try {
        envelope = JSON.parse(raw);
      } catch (error) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: projection "${projection}" stdout is not valid JSON: ${error.message}`,
            { projection, stderr: stderrText, cause: error },
          ),
        );
        return;
      }

      if (envelope == null || typeof envelope !== 'object' || Array.isArray(envelope)) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: projection "${projection}" stdout must be a JSON object envelope.`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      if (envelope.ok === false) {
        reject(
          new KernelBridgeError(
            `kernel-bridge: projection "${projection}" reported kernel error: ${envelope.error ?? '<no error message>'}.`,
            {
              projection,
              stderr: stderrText,
              cause: new Error(String(envelope.error ?? 'unknown kernel error')),
            },
          ),
        );
        return;
      }

      if (envelope.ok !== true) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: projection "${projection}" envelope missing ok:true flag.`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      if (envelope.projection !== projection) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: envelope projection "${envelope.projection}" does not match requested "${projection}".`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      if (typeof envelope.projectPath !== 'string' || envelope.projectPath.length === 0) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: envelope for "${projection}" missing projectPath.`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      if (envelope.data === undefined) {
        reject(
          new KernelBridgeContractMismatchError(
            `kernel-bridge: envelope for "${projection}" missing data field.`,
            { projection, stderr: stderrText },
          ),
        );
        return;
      }

      resolve(envelope.data);
    });

    try {
      child.stdin.end(JSON.stringify(stdinPayload ?? {}) + '\n');
    } catch (error) {
      clearTimeout(sigtermTimer);
      clearKillTimer();
      reject(
        new KernelBridgeError(
          `kernel-bridge: stdin write failed: ${error.message}`,
          { projection, cause: error },
        ),
      );
    }
  });
}

/**
 * Resolve a typed-duck reader that talks to the sibling kernel via
 * `plugin/scripts/core-reader-cli.js`.
 *
 * If `kernelRoot` is absent OR the CLI path does not exist on disk, returns
 * the degraded sentinel `{dbAvailable: false, error: <reason>}` matching
 * bin/vre:resolveDefaultReader — callers keep their Phase 5.7 fallback.
 *
 * @param {object} options
 * @param {string | null | undefined} options.kernelRoot  Sibling root (VRE_KERNEL_PATH)
 * @param {number} [options.timeoutMs=10000]  Per-projection timeout
 * @param {string[]} [options.envPassthrough=[]]  Extra env keys to forward
 * @param {string} [options.projectPath]  Optional default projectPath for calls
 * @returns {Promise<object>} reader
 */
export async function resolveKernelReader({
  kernelRoot,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
  projectPath = null,
} = {}) {
  if (!kernelRoot || typeof kernelRoot !== 'string') {
    return {
      dbAvailable: false,
      error: 'CLI default: no reader provided',
    };
  }

  const cliPath = path.resolve(kernelRoot, 'plugin', 'scripts', 'core-reader-cli.js');
  if (!existsSync(cliPath)) {
    return {
      dbAvailable: false,
      error: `core-reader CLI unavailable at ${cliPath}`,
    };
  }

  const resolvedKernelRoot = path.resolve(kernelRoot);
  const defaultProjectPath =
    typeof projectPath === 'string' && projectPath.length > 0
      ? projectPath
      : resolvedKernelRoot;

  const callProjection = (projection, options = {}) => {
    const payload = {
      projectPath: options.projectPath ?? defaultProjectPath,
      ...options,
    };
    return invokeCoreReaderCli({
      cliPath,
      kernelRoot: resolvedKernelRoot,
      projection,
      stdinPayload: payload,
      timeoutMs,
      envPassthrough,
    });
  };

  const reader = {
    dbAvailable: true,
    close() {
      // WP-155 rule: close is a no-op; bridge is stateless, each call re-spawns.
    },
  };

  for (const projection of PROJECTION_NAMES) {
    reader[projection] = (options = {}) => callProjection(projection, options);
  }

  return reader;
}

/**
 * Test-only helper exposed so WP-156/WP-157 can exercise trigger projections
 * (e.g. __bridge_test_timeout__) without the nine-projection binding loop
 * getting in the way. Not part of the WP-150 runtime contract — marked with
 * a leading underscore and excluded from the typed-duck reader.
 */
export async function __spawnProjectionForTest({
  kernelRoot,
  projection,
  stdinPayload = { projectPath: path.resolve(kernelRoot ?? '.') },
  timeoutMs = DEFAULT_TIMEOUT_MS,
  envPassthrough = [],
}) {
  if (!kernelRoot) {
    throw new KernelBridgeUnavailableError('kernel-bridge(test): kernelRoot required');
  }
  const cliPath = path.resolve(kernelRoot, 'plugin', 'scripts', 'core-reader-cli.js');
  if (!existsSync(cliPath)) {
    throw new KernelBridgeUnavailableError(`core-reader CLI unavailable at ${cliPath}`);
  }
  return invokeCoreReaderCli({
    cliPath,
    kernelRoot: path.resolve(kernelRoot),
    projection,
    stdinPayload,
    timeoutMs,
    envPassthrough,
  });
}

// Exported for tests that need to assert against the contract.
export const __testables = Object.freeze({
  PROJECTION_NAMES,
  DEFAULT_ENV_WHITELIST,
});
