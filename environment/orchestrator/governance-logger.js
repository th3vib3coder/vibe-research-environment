import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_GOVERNANCE_BRIDGE_TIMEOUT_MS = 5_000;

function bridgeError(code, message, extra = {}) {
  const error = new Error(message);
  error.name = 'GovernanceBridgeError';
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function resolveGovernancePluginCliPath({
  pluginCliPath = null,
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  if (typeof pluginCliPath === 'string' && pluginCliPath.trim() !== '') {
    return path.resolve(pluginCliPath);
  }
  if (typeof env.VIBE_SCIENCE_PLUGIN_CLI === 'string' && env.VIBE_SCIENCE_PLUGIN_CLI.trim() !== '') {
    return path.resolve(env.VIBE_SCIENCE_PLUGIN_CLI);
  }
  if (typeof env.VIBE_SCIENCE_PLUGIN_ROOT === 'string' && env.VIBE_SCIENCE_PLUGIN_ROOT.trim() !== '') {
    return path.resolve(env.VIBE_SCIENCE_PLUGIN_ROOT, 'scripts', 'governance-log.js');
  }
  return path.resolve(cwd, '..', 'vibe-science', 'plugin', 'scripts', 'governance-log.js');
}

function parsePluginStdout(stdout, cliPath) {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    throw bridgeError(
      'E_GOVERNANCE_BRIDGE_BAD_OUTPUT',
      'governance bridge plugin CLI emitted empty stdout.',
      { cliPath, stdout },
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw bridgeError(
      'E_GOVERNANCE_BRIDGE_BAD_OUTPUT',
      `governance bridge plugin CLI emitted non-JSON stdout: ${error.message}`,
      { cliPath, stdout, cause: error },
    );
  }
}

export function logGovernanceEventViaPlugin(event, options = {}) {
  const cliPath = resolveGovernancePluginCliPath({
    pluginCliPath: options.pluginCliPath,
    cwd: options.cwd ?? process.cwd(),
  });
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Number(options.timeoutMs))
    : DEFAULT_GOVERNANCE_BRIDGE_TIMEOUT_MS;
  const childEnv = options.env ?? process.env;
  const stdinPayload = JSON.stringify({
    ...event,
    pluginProjectRoot: options.pluginProjectRoot ?? null,
  });

  return new Promise((resolve, reject) => {
    if (!existsSync(cliPath)) {
      reject(
        bridgeError(
          'E_GOVERNANCE_BRIDGE_SPAWN_FAILED',
          `governance bridge plugin CLI not found: ${cliPath}`,
          { cliPath },
        ),
      );
      return;
    }

    let child;
    try {
      child = spawn(process.execPath, [cliPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      reject(
        bridgeError(
          'E_GOVERNANCE_BRIDGE_SPAWN_FAILED',
          `governance bridge spawn failed: ${error.message}`,
          { cliPath, cause: error },
        ),
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnFailure = null;

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Child may have exited between timer firing and kill.
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      spawnFailure = error;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(
          bridgeError(
            'E_GOVERNANCE_BRIDGE_TIMEOUT',
            `governance bridge plugin CLI timed out after ${timeoutMs} ms.`,
            { cliPath, timeoutMs, stdout, stderr, signal },
          ),
        );
        return;
      }

      if (spawnFailure) {
        reject(
          bridgeError(
            'E_GOVERNANCE_BRIDGE_SPAWN_FAILED',
            `governance bridge spawn failed: ${spawnFailure.message}`,
            { cliPath, cause: spawnFailure, stdout, stderr },
          ),
        );
        return;
      }

      let parsed;
      try {
        parsed = parsePluginStdout(stdout, cliPath);
      } catch (error) {
        reject(error);
        return;
      }

      if (exitCode !== 0) {
        reject(
          bridgeError(
            parsed?.ok === false && parsed.code
              ? parsed.code
              : 'E_GOVERNANCE_BRIDGE_NONZERO_EXIT',
            parsed?.message ?? `governance bridge plugin CLI exited with code ${exitCode}.`,
            { cliPath, exitCode, stdout, stderr, payload: parsed },
          ),
        );
        return;
      }

      if (parsed?.ok !== true) {
        reject(
          bridgeError(
            parsed?.code ?? 'E_GOVERNANCE_BRIDGE_BAD_OUTPUT',
            parsed?.message ?? 'governance bridge plugin CLI did not report ok:true.',
            { cliPath, exitCode, stdout, stderr, payload: parsed },
          ),
        );
        return;
      }

      resolve({
        ok: true,
        eventId: parsed.eventId,
        code: parsed.code ?? 'OK',
      });
    });

    child.stdin.end(stdinPayload);
  });
}
