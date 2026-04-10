import {
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';

export const ORCHESTRATOR_FILES = Object.freeze({
  routerSession: 'router-session.json',
  continuityProfile: 'continuity-profile.json',
  continuityProfileHistory: 'continuity-profile-history.jsonl',
  lanePolicies: 'lane-policies.json',
  runQueue: 'run-queue.jsonl',
  laneRuns: 'lane-runs.jsonl',
  recoveryLog: 'recovery-log.jsonl',
  escalations: 'escalations.jsonl',
  externalReviewLog: 'external-review-log.jsonl',
  locksDir: 'locks',
});

export function orchestratorDir(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'orchestrator',
  );
}

export function orchestratorLocksDir(projectPath) {
  return resolveInside(orchestratorDir(projectPath), ORCHESTRATOR_FILES.locksDir);
}

export function resolveOrchestratorPath(projectPath, ...segments) {
  return resolveInside(orchestratorDir(projectPath), ...segments);
}

export function routerSessionPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.routerSession);
}

export function continuityProfilePath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.continuityProfile);
}

export function continuityProfileHistoryPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.continuityProfileHistory);
}

export function lanePoliciesPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.lanePolicies);
}

export function runQueuePath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.runQueue);
}

export function laneRunsPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.laneRuns);
}

export function recoveryLogPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.recoveryLog);
}

export function escalationsPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.escalations);
}

export function externalReviewLogPath(projectPath) {
  return resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.externalReviewLog);
}
