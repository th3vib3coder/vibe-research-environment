import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearContinuityAssemblyCache,
  assembleContinuityContext,
  formatContinuityForPrompt,
} from '../orchestrator/context-assembly.js';
import { applyContinuityProfileUpdate } from '../orchestrator/continuity-profile.js';
import { runOrchestratorObjective, runOrchestratorStatus } from '../orchestrator/runtime.js';
import { countTokens } from '../lib/token-counter.js';
import { captureRuntimeFiles, diffWrites } from './_saved-artifacts.js';
import {
  buildPhase5LanePolicies,
  preparePhase5Workspace,
} from './_orchestrator-fixture.js';
import {
  cleanupEvalWorkspace,
  createEvalWorkspace,
  getRepoRoot,
} from './_workspace.js';

const repoRoot = getRepoRoot();
const artifactPath = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
  'artifacts',
  'phase5-context-and-cost-baseline.json',
);
const DEFAULT_READER = Object.freeze({
  dbAvailable: false,
  error: 'bridge unavailable',
});
const CONTINUITY_SUB_BUDGET_MAX = 12000;

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toRepoRelative(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/gu, '/');
}

function countWritesByZone(actualWrites) {
  const zones = {
    control: 0,
    orchestrator: 0,
    results: 0,
    other: 0,
  };

  for (const filePath of actualWrites) {
    if (filePath.startsWith('.vibe-science-environment/control/')) {
      zones.control += 1;
    } else if (filePath.startsWith('.vibe-science-environment/orchestrator/')) {
      zones.orchestrator += 1;
    } else if (filePath.startsWith('.vibe-science-environment/results/')) {
      zones.results += 1;
    } else {
      zones.other += 1;
    }
  }

  return zones;
}

async function measureAssembly(assembled) {
  const formatted = formatContinuityForPrompt(assembled);
  const tokens = await countTokens(formatted);
  return {
    totalTokens: assembled.totalTokens,
    formattedTokens: tokens.count,
    formattedChars: formatted.length,
    retrievalHitCount: assembled.retrievalHits.length,
    sourceRefCount: assembled.sourceRefs.length,
    truncated: assembled.truncated,
    withinSubBudget: assembled.totalTokens <= CONTINUITY_SUB_BUDGET_MAX,
  };
}

async function main() {
  const projectPath = await createEvalWorkspace('vre-phase5-cost-');

  try {
    const lanePolicies = buildPhase5LanePolicies();
    await preparePhase5Workspace(projectPath, { lanePolicies });
    await applyContinuityProfileUpdate(projectPath, {
      path: '/operator/reportVerbosity',
      newValue: 'concise',
      reason: 'Phase 5 measurement seeds one explicit verbosity preference.',
      actor: 'operator',
      recordedAt: '2026-04-10T10:00:00Z',
    });
    await applyContinuityProfileUpdate(projectPath, {
      path: '/project/primaryAudience',
      newValue: 'advisor',
      reason: 'Phase 5 measurement seeds one explicit audience preference.',
      actor: 'operator',
      recordedAt: '2026-04-10T10:01:00Z',
    });
    await runOrchestratorObjective({
      projectPath,
      objective: 'Export a session digest for the current workspace.',
      sourceSessionId: 'ORCH-SESSION-COST',
      reader: DEFAULT_READER,
    });

    clearContinuityAssemblyCache();
    const profile = await assembleContinuityContext(projectPath, {
      mode: 'profile',
      laneId: 'execution',
      disableCache: true,
    });
    const query = await assembleContinuityContext(projectPath, {
      mode: 'query',
      laneId: 'review',
      queryText: 'lane run',
      limit: 3,
      disableCache: true,
    });
    const full = await assembleContinuityContext(projectPath, {
      mode: 'full',
      laneId: 'review',
      queryText: 'lane run',
      limit: 3,
      disableCache: true,
    });

    const beforeSnapshot = await captureRuntimeFiles(projectPath);
    const runStartedAt = new Date().toISOString();
    const run = await runOrchestratorObjective({
      projectPath,
      objective: 'Export a session digest for the current workspace.',
      sourceSessionId: 'ORCH-SESSION-CYCLE',
      reader: DEFAULT_READER,
    });
    const runEndedAt = new Date().toISOString();
    const statusStartedAt = new Date().toISOString();
    const status = await runOrchestratorStatus({
      projectPath,
      reader: DEFAULT_READER,
    });
    const statusEndedAt = new Date().toISOString();
    const afterSnapshot = await captureRuntimeFiles(projectPath);
    const actualWrites = diffWrites(beforeSnapshot, afterSnapshot);

    const profileMeasurement = await measureAssembly(profile);
    const queryMeasurement = await measureAssembly(query);
    const fullMeasurement = await measureAssembly(full);
    const runElapsedSeconds =
      (Date.parse(runEndedAt) - Date.parse(runStartedAt)) / 1000;
    const statusElapsedSeconds =
      (Date.parse(statusEndedAt) - Date.parse(statusStartedAt)) / 1000;

    const artifact = {
      artifactId: 'phase5-context-and-cost-baseline',
      phase: 5,
      createdAt: new Date().toISOString(),
      passed:
        profileMeasurement.withinSubBudget &&
        queryMeasurement.withinSubBudget &&
        fullMeasurement.withinSubBudget,
      validationClaim:
        'Phase 5 continuity assembly and one coordinator cycle now have a measured baseline instead of a guessed cost story.',
      measurementMethod: {
        continuityAssembly:
          'Measured from live assembleContinuityContext(...) outputs and formatted with formatContinuityForPrompt(...).',
        tokenCounter:
          'Measured with the repo token-counter helper; provider-native if configured, otherwise char_fallback.',
        coordinatorCycle:
          'Measured from one live /orchestrator-run plus /orchestrator-status cycle in a fresh eval workspace.',
      },
      scenario: {
        continuityQueryText: 'lane run',
        cycleObjective: 'Export a session digest for the current workspace.',
        cycleRunCommand: '/orchestrator-run',
        cycleStatusCommand: '/orchestrator-status',
      },
      sources: {
        continuity: {
          profileMode: profileMeasurement,
          queryMode: queryMeasurement,
          fullMode: fullMeasurement,
        },
        coordinatorCycle: {
          runAttemptId: run.attempt.attemptId,
          statusAttemptId: status.attempt.attemptId,
          actualWrites,
          writeCountsByZone: countWritesByZone(actualWrites),
        },
      },
      totals: {
        continuitySubBudgetMax: CONTINUITY_SUB_BUDGET_MAX,
        profileTokens: profileMeasurement.totalTokens,
        queryTokens: queryMeasurement.totalTokens,
        fullTokens: fullMeasurement.totalTokens,
        queryIncrementalVsProfile: queryMeasurement.totalTokens - profileMeasurement.totalTokens,
        fullIncrementalVsProfile: fullMeasurement.totalTokens - profileMeasurement.totalTokens,
        coordinatorRunElapsedSeconds: runElapsedSeconds,
        coordinatorStatusElapsedSeconds: statusElapsedSeconds,
        coordinatorCycleElapsedSeconds: runElapsedSeconds + statusElapsedSeconds,
      },
      providerObservations: {
        executionLane: {
          providerRef: lanePolicies.lanes.execution.providerRef,
          integrationKind: lanePolicies.lanes.execution.integrationKind,
          billingMode: lanePolicies.lanes.execution.billingMode,
          apiFallbackAllowed: lanePolicies.lanes.execution.apiFallbackAllowed,
          observation:
            'The MVP execution lane is local-logic only, so this baseline observed no provider billing or external rate-limit surface.',
        },
        reviewLane: {
          providerRef: lanePolicies.lanes.review.providerRef,
          integrationKind: lanePolicies.lanes.review.integrationKind,
          billingMode: lanePolicies.lanes.review.billingMode,
          apiFallbackAllowed: lanePolicies.lanes.review.apiFallbackAllowed,
          observation:
            'The MVP review lane stays on the local CLI path in the saved baseline; no API fallback was required or observed.',
        },
      },
      notes: [
        'Continuity tokens are a sub-budget measurement for the assembler, not the total end-to-end prompt budget.',
        'Coordinator cycle write counts include control-plane and orchestrator state plus the exported session digest.',
      ],
      referenceBudgets: {
        continuityFullModeTarget: `<= ${CONTINUITY_SUB_BUDGET_MAX} tokens`,
        runtimeStory:
          'One local coordinator cycle should stay understandable in writes and cheap enough to inspect before Phase 6 expands provider scope.',
      },
    };

    await writeJson(artifactPath, artifact);
    return artifact;
  } finally {
    await cleanupEvalWorkspace(projectPath);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifact = await main();
    console.log(`saved ${toRepoRelative(artifactPath)}`);
    console.log(`full continuity tokens ${artifact.totals.fullTokens}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as measurePhase5ContextAndCost };
