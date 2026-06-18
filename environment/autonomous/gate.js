import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Phase13L0HaltError,
  writeL0HaltRequestFromOptions
} from './l0/halt.js';

export const AUTONOMY_TIER_ENV = 'VRE_AUTONOMY_TIER';
export const ENTRYPOINTS_PATH = 'environment/autonomous/ENTRYPOINTS.json';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINTS_FILE = path.join(MODULE_DIR, 'ENTRYPOINTS.json');
const ENABLED_TIERS = new Set(['phase13', 'autonomous']);

export class Phase13AutonomyError extends Error {
  constructor(code, message, { command, exitCode = 2, extra = {} } = {}) {
    super(message);
    this.name = 'Phase13AutonomyError';
    this.code = code;
    this.command = command ?? null;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

export function readAutonomyTier(env = process.env) {
  const raw = env[AUTONOMY_TIER_ENV];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return 'base';
  }
  return raw.trim();
}

export function isAutonomyEnabled(env = process.env) {
  return ENABLED_TIERS.has(readAutonomyTier(env));
}

function validateEntrypointShape(entrypoint) {
  if (typeof entrypoint?.command !== 'string' || !entrypoint.command.startsWith('autonomous ')) {
    throw new Error('E_PHASE13_ENTRYPOINT_INVALID command');
  }
  if (typeof entrypoint.action !== 'string' || entrypoint.action.trim() === '') {
    throw new Error(`E_PHASE13_ENTRYPOINT_INVALID action for ${entrypoint.command}`);
  }
  if (entrypoint.runtimeOpened !== false) {
    throw new Error(`E_PHASE13_ENTRYPOINT_RUNTIME_OPENED ${entrypoint.command}`);
  }
}

export async function loadAutonomousEntrypoints() {
  const parsed = JSON.parse(await readFile(ENTRYPOINTS_FILE, 'utf8'));
  if (parsed.schemaVersion !== 'phase13.autonomous-entrypoints.v1') {
    throw new Error('E_PHASE13_ENTRYPOINTS_SCHEMA_VERSION');
  }
  if (!Array.isArray(parsed.entrypoints) || parsed.entrypoints.length === 0) {
    throw new Error('E_PHASE13_ENTRYPOINTS_EMPTY');
  }
  for (const entrypoint of parsed.entrypoints) {
    validateEntrypointShape(entrypoint);
  }
  return Object.freeze(parsed.entrypoints.map((entrypoint) => Object.freeze({ ...entrypoint })));
}

export async function listAutonomousEntrypoints() {
  return loadAutonomousEntrypoints();
}

export async function findAutonomousEntrypoint(action) {
  return (await loadAutonomousEntrypoints())
    .find((entrypoint) => entrypoint.action === action) ?? null;
}

export function assertAutonomyEnabled({ command, env = process.env } = {}) {
  const autonomyTier = readAutonomyTier(env);
  if (!ENABLED_TIERS.has(autonomyTier)) {
    throw new Phase13AutonomyError(
      'E_AUTONOMY_DISABLED',
      'Phase 13 autonomous entrypoints are disabled by default.',
      {
        command,
        exitCode: 2,
        extra: {
          autonomyTier,
          expectedEnv: AUTONOMY_TIER_ENV,
          enabledValues: [...ENABLED_TIERS].sort()
        }
      }
    );
  }
}

export async function runAutonomousEntrypoint({
  action,
  env = process.env,
  repoRoot = null,
  options = {}
} = {}) {
  const entrypoint = await findAutonomousEntrypoint(action);
  if (!entrypoint) {
    throw new Phase13AutonomyError(
      'E_PHASE13_AUTONOMOUS_UNKNOWN_ACTION',
      `Unknown Phase 13 autonomous action: ${action}`,
      { command: `autonomous ${action ?? ''}`.trim(), exitCode: 2 }
    );
  }

  assertAutonomyEnabled({ command: entrypoint.command, env });

  if (action === 'halt') {
    if (typeof repoRoot !== 'string' || repoRoot.trim() === '') {
      throw new Phase13AutonomyError(
        'E_PHASE13_AUTONOMOUS_REPO_REQUIRED',
        'autonomous halt requires a VRE repository root.',
        { command: entrypoint.command, exitCode: 3 }
      );
    }
    try {
      return await writeL0HaltRequestFromOptions(repoRoot, options);
    } catch (error) {
      if (error instanceof Phase13L0HaltError) {
        throw new Phase13AutonomyError(
          error.code,
          error.message,
          {
            command: entrypoint.command,
            exitCode: error.exitCode,
            extra: error.extra
          }
        );
      }
      throw error;
    }
  }

  return {
    ok: false,
    code: 'E_PHASE13_AUTONOMY_NOT_IMPLEMENTED',
    phase13: true,
    command: entrypoint.command,
    autonomyTier: readAutonomyTier(env),
    runtimeOpened: false,
    message: 'Phase 13 Wave 0 opens only the default-off gate, not autonomous runtime execution.'
  };
}
