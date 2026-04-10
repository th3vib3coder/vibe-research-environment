import { now } from '../control/_io.js';
import {
  ORCHESTRATOR_FILES,
} from './_paths.js';
import {
  ensureOrchestratorDir,
  ensureOrchestratorJsonlFile,
  readOrchestratorJson,
  writeOrchestratorJson,
} from './_io.js';

const ROUTER_SCHEMA = 'router-session.schema.json';
const LANE_POLICY_SCHEMA = 'lane-policy.schema.json';
const CONTINUITY_PROFILE_SCHEMA = 'continuity-profile.schema.json';

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function buildDisabledLaneDefaults({ reviewOnly }) {
  return {
    enabled: false,
    providerRef: null,
    integrationKind: 'local-logic',
    authMode: 'local-only',
    billingMode: 'none',
    apiFallbackAllowed: false,
    supervisionCapability: 'output-only',
    interactive: false,
    backgroundSafe: false,
    parallelAllowed: false,
    reviewOnly,
    model: null,
    thinkingDepth: 'medium',
    autonomyLevel: 'advisory',
    retryPolicy: {
      maxAttempts: 0,
      backoffStrategy: 'manual',
      cooldownMinutes: null,
    },
    costCeiling: {
      maxPromptTokens: null,
      maxOutputTokens: null,
      maxUsd: null,
    },
    escalationThreshold: 'high',
    notes: 'Bootstrap default; explicit lane binding required before execution.',
  };
}

export function buildDefaultRouterSession(overrides = {}) {
  return {
    schemaVersion: 'vibe-orch.router-session.v1',
    sessionId: null,
    currentMode: 'intake',
    objective: null,
    activeThreadId: null,
    currentTarget: null,
    queueFocusTaskId: null,
    escalationState: {
      status: 'none',
      pendingEscalationId: null,
      summary: null,
    },
    updatedAt: now(),
    ...cloneValue(overrides),
  };
}

export function buildDefaultContinuityProfile(overrides = {}) {
  return {
    schemaVersion: 'vibe-orch.continuity-profile.v1',
    operator: {
      defaultAutonomyPreference: 'advisory',
      reportVerbosity: 'standard',
      reviewStrictness: 'medium',
      quietHoursLocal: [],
    },
    project: {
      primaryAudience: 'self',
      defaultReportKinds: [],
    },
    runtime: {
      preferredLaneRoles: [],
      defaultAllowApiFallback: false,
    },
    updatedAt: now(),
    ...cloneValue(overrides),
  };
}

export function buildDefaultLanePolicies(overrides = {}) {
  return {
    schemaVersion: 'vibe-orch.lane-policy.v1',
    lanes: {
      execution: buildDisabledLaneDefaults({ reviewOnly: false }),
      review: buildDisabledLaneDefaults({ reviewOnly: true }),
    },
    ...cloneValue(overrides),
  };
}

export async function readRouterSession(projectPath) {
  return readOrchestratorJson(projectPath, ORCHESTRATOR_FILES.routerSession, {
    schemaFile: ROUTER_SCHEMA,
    label: 'router session',
  });
}

export async function writeRouterSession(projectPath, data) {
  return writeOrchestratorJson(projectPath, ORCHESTRATOR_FILES.routerSession, data, {
    schemaFile: ROUTER_SCHEMA,
    label: 'router session',
  });
}

export async function bootstrapRouterSession(projectPath, overrides = {}) {
  const current = await readRouterSession(projectPath);
  if (current) {
    return current;
  }

  return writeRouterSession(projectPath, buildDefaultRouterSession(overrides));
}

export async function readContinuityProfile(projectPath) {
  return readOrchestratorJson(projectPath, ORCHESTRATOR_FILES.continuityProfile, {
    schemaFile: CONTINUITY_PROFILE_SCHEMA,
    label: 'continuity profile',
  });
}

export async function writeContinuityProfile(projectPath, data) {
  return writeOrchestratorJson(projectPath, ORCHESTRATOR_FILES.continuityProfile, data, {
    schemaFile: CONTINUITY_PROFILE_SCHEMA,
    label: 'continuity profile',
  });
}

export async function bootstrapContinuityProfile(projectPath, overrides = {}) {
  const current = await readContinuityProfile(projectPath);
  if (current) {
    return current;
  }

  return writeContinuityProfile(projectPath, buildDefaultContinuityProfile(overrides));
}

export async function readLanePolicies(projectPath) {
  return readOrchestratorJson(projectPath, ORCHESTRATOR_FILES.lanePolicies, {
    schemaFile: LANE_POLICY_SCHEMA,
    label: 'lane policy',
  });
}

export async function writeLanePolicies(projectPath, data) {
  return writeOrchestratorJson(projectPath, ORCHESTRATOR_FILES.lanePolicies, data, {
    schemaFile: LANE_POLICY_SCHEMA,
    label: 'lane policy',
  });
}

export async function bootstrapLanePolicies(projectPath, overrides = {}) {
  const current = await readLanePolicies(projectPath);
  if (current) {
    return current;
  }

  return writeLanePolicies(projectPath, buildDefaultLanePolicies(overrides));
}

export async function bootstrapOrchestratorLedgers(projectPath) {
  await ensureOrchestratorDir(projectPath);

  const files = [
    ORCHESTRATOR_FILES.runQueue,
    ORCHESTRATOR_FILES.laneRuns,
    ORCHESTRATOR_FILES.recoveryLog,
    ORCHESTRATOR_FILES.escalations,
    ORCHESTRATOR_FILES.externalReviewLog,
    ORCHESTRATOR_FILES.continuityProfileHistory,
  ];

  await Promise.all(files.map((fileName) => ensureOrchestratorJsonlFile(projectPath, fileName)));

  return files;
}

export async function bootstrapOrchestratorState(projectPath, options = {}) {
  const continuityProfile = await bootstrapContinuityProfile(
    projectPath,
    options.continuityProfile,
  );
  const lanePolicies = await bootstrapLanePolicies(projectPath, options.lanePolicies);
  const routerSession = await bootstrapRouterSession(projectPath, options.routerSession);
  await bootstrapOrchestratorLedgers(projectPath);

  return {
    continuityProfile,
    lanePolicies,
    routerSession,
  };
}
