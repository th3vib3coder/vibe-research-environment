/**
 * Canonical session snapshot — session.json
 * The ONLY authoritative outer-project answer to "Where am I?"
 * This is NOT kernel session state — it's a derived operator view.
 */

import path from 'node:path';
import {
  controlDir, ensureControlDir, readJson, atomicWriteJson,
  loadValidator, assertValid, now
} from './_io.js';

const SCHEMA = 'session-snapshot.schema.json';
const FILE   = 'session.json';

function filePath(projectPath) {
  return path.join(controlDir(projectPath), FILE);
}

export async function getSessionSnapshot(projectPath) {
  try {
    return await readJson(filePath(projectPath));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function publishSessionSnapshot(projectPath, snapshot) {
  await ensureControlDir(projectPath);

  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, snapshot, 'session snapshot');
  await atomicWriteJson(filePath(projectPath), snapshot);
  return snapshot;
}

export async function rebuildSessionSnapshot(projectPath, inputs = {}) {
  const {
    flowState = {},
    capabilities = {},
    budget = {},
    signals = {},
    kernel = {},
    lastCommand = null,
    lastAttemptId = null
  } = inputs;

  const snapshot = {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: flowState.activeFlow ?? null,
    currentStage: flowState.currentStage ?? null,
    nextActions: flowState.nextActions ?? [],
    blockers: flowState.blockers ?? [],
    kernel: {
      dbAvailable: kernel.dbAvailable ?? false,
      degradedReason: kernel.degradedReason ?? null
    },
    capabilities: {
      claimHeads: capabilities.claimHeads ?? false,
      citationChecks: capabilities.citationChecks ?? false,
      governanceProfileAtCreation: capabilities.governanceProfileAtCreation ?? false,
      claimSearch: capabilities.claimSearch ?? false
    },
    budget: {
      state: budget.state ?? 'unknown',
      toolCalls: budget.toolCalls ?? 0,
      estimatedCostUsd: budget.estimatedCostUsd ?? 0,
      countingMode: budget.countingMode ?? 'unknown'
    },
    signals: {
      staleMemory: signals.staleMemory ?? false,
      unresolvedClaims: signals.unresolvedClaims ?? 0,
      blockedExperiments: signals.blockedExperiments ?? 0,
      exportAlerts: signals.exportAlerts ?? 0
    },
    lastCommand,
    lastAttemptId,
    updatedAt: now()
  };

  return publishSessionSnapshot(projectPath, snapshot);
}
