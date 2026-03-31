import {
  atomicWriteJson,
  assertValid,
  controlDir,
  loadValidator,
  now,
  readJson,
  resolveInside
} from './_io.js';

const SCHEMA_FILE = 'session-snapshot.schema.json';
const SESSION_FILE = 'session.json';

function sessionPath(projectPath) {
  return resolveInside(controlDir(projectPath), SESSION_FILE);
}

function deriveSnapshotCapabilities(input = {}) {
  if (input.kernel && input.install) {
    return {
      claimHeads: Boolean(input.kernel?.projections?.claimHeads),
      citationChecks: Boolean(input.kernel?.projections?.citationChecks),
      governanceProfileAtCreation: Boolean(
        input.kernel?.advanced?.governanceProfileAtCreation
      ),
      claimSearch: Boolean(input.kernel?.advanced?.claimSearch)
    };
  }

  return {
    claimHeads: Boolean(input.claimHeads),
    citationChecks: Boolean(input.citationChecks),
    governanceProfileAtCreation: Boolean(input.governanceProfileAtCreation),
    claimSearch: Boolean(input.claimSearch)
  };
}

export async function getSessionSnapshot(projectPath) {
  try {
    return await readJson(sessionPath(projectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function publishSessionSnapshot(projectPath, snapshot) {
  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, snapshot, 'session snapshot');
  await atomicWriteJson(sessionPath(projectPath), snapshot);
  return snapshot;
}

export async function rebuildSessionSnapshot(projectPath, inputs = {}) {
  const flowState = inputs.flowState ?? {};
  const capabilities = deriveSnapshotCapabilities(inputs.capabilities);
  const budget = inputs.budget ?? {};
  const signals = inputs.signals ?? {};
  const kernel = inputs.kernel ?? {};

  const snapshot = {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: flowState.activeFlow ?? null,
    currentStage: flowState.currentStage ?? null,
    nextActions: flowState.nextActions ?? [],
    blockers: flowState.blockers ?? [],
    kernel: {
      dbAvailable: Boolean(kernel.dbAvailable),
      degradedReason: kernel.degradedReason ?? null
    },
    capabilities,
    budget: {
      state: budget.state ?? 'unknown',
      toolCalls: budget.toolCalls ?? 0,
      estimatedCostUsd: budget.estimatedCostUsd ?? 0,
      countingMode: budget.countingMode ?? 'unknown'
    },
    signals: {
      staleMemory: Boolean(signals.staleMemory),
      unresolvedClaims: signals.unresolvedClaims ?? 0,
      blockedExperiments: signals.blockedExperiments ?? 0,
      exportAlerts: signals.exportAlerts ?? 0
    },
    lastCommand: inputs.lastCommand ?? null,
    lastAttemptId: inputs.lastAttemptId ?? null,
    updatedAt: now()
  };

  return publishSessionSnapshot(projectPath, snapshot);
}

export const INTERNALS = {
  deriveSnapshotCapabilities
};
