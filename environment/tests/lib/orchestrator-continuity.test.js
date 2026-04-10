import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { loadValidator } from '../../control/_io.js';
import { openAttempt, updateAttempt } from '../../control/attempts.js';
import { publishCapabilitiesSnapshot } from '../../control/capabilities.js';
import { appendDecision } from '../../control/decisions.js';
import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { exportSessionDigest } from '../../flows/session-digest.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { buildAdvisorPack } from '../../flows/writing-packs.js';
import {
  applyContinuityProfileForget,
  applyContinuityProfileUpdate,
  confirmContinuityProposal,
  createContinuityForgetProposal,
  createContinuityUpdateProposal,
  listContinuityProfileHistory,
  rejectContinuityProposal,
} from '../../orchestrator/continuity-profile.js';
import {
  INTERNALS as CONTEXT_INTERNALS,
  assembleContinuityContext,
  clearContinuityAssemblyCache,
  formatContinuityForPrompt,
} from '../../orchestrator/context-assembly.js';
import {
  appendEscalationRecord,
  appendLaneRun,
  appendRecoveryRecord,
} from '../../orchestrator/ledgers.js';
import { createQueueTask } from '../../orchestrator/queue.js';
import {
  buildDefaultContinuityProfile,
  bootstrapContinuityProfile,
  bootstrapLanePolicies,
  bootstrapOrchestratorLedgers,
  bootstrapRouterSession,
  readContinuityProfile,
} from '../../orchestrator/state.js';
import { cleanupFixtureProject, createFixtureProject } from '../integration/_fixture.js';

function createReader({
  heads = [],
  unresolvedClaims = [],
  citations = [],
} = {}) {
  return {
    dbAvailable: true,
    async listClaimHeads() {
      return heads;
    },
    async listUnresolvedClaims() {
      return unresolvedClaims;
    },
    async listCitationChecks(options = {}) {
      if (typeof options.claimId !== 'string') {
        return citations;
      }

      return citations.filter((entry) => entry.claimId === options.claimId);
    },
  };
}

function buildExperiment(overrides = {}) {
  return {
    experimentId: 'EXP-301',
    title: 'Wave 2 continuity recall experiment',
    objective: 'Ground continuity recall in helper-backed surfaces',
    status: 'planned',
    createdAt: '2026-04-10T08:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 31,
    },
    codeRef: {
      entrypoint: 'scripts/run_wave2.py',
      gitCommit: 'wave2301',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/wave2.png'],
    relatedClaims: ['C-301'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}

test('continuity profile updates and forget operations remain explicit and auditable', async () => {
  const projectRoot = await createFixtureProject('vre-orch-continuity-update-');

  try {
    await bootstrapContinuityProfile(projectRoot);

    const updated = await applyContinuityProfileUpdate(projectRoot, {
      path: 'operator.reportVerbosity',
      newValue: 'concise',
      reason: 'Operator wants shorter coordinator summaries.',
      recordedAt: '2026-04-10T09:00:00Z',
    });

    assert.equal(updated.changed, true);
    assert.equal(updated.profile.operator.reportVerbosity, 'concise');
    assert.equal(updated.historyEntry.eventKind, 'update');
    assert.equal(updated.historyEntry.previousValue, 'standard');
    assert.equal(updated.historyEntry.newValue, 'concise');

    const forgotten = await applyContinuityProfileForget(projectRoot, {
      path: 'operator.reportVerbosity',
      forgetReason: 'Reset to the default report verbosity.',
      recordedAt: '2026-04-10T09:05:00Z',
    });

    assert.equal(forgotten.changed, true);
    assert.equal(forgotten.profile.operator.reportVerbosity, 'standard');
    assert.equal(forgotten.historyEntry.eventKind, 'forget');
    assert.equal(forgotten.historyEntry.previousValue, 'concise');
    assert.equal(forgotten.historyEntry.forgetReason, 'Reset to the default report verbosity.');

    const history = await listContinuityProfileHistory(projectRoot);
    assert.equal(history.length, 2);
    assert.equal(history[0].eventKind, 'forget');
    assert.equal(history[1].eventKind, 'update');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('continuity proposals stay inert until confirmed and can be rejected without side effects', async () => {
  const projectRoot = await createFixtureProject('vre-orch-continuity-proposal-');

  try {
    const proposal = await createContinuityUpdateProposal(projectRoot, {
      path: 'runtime.defaultAllowApiFallback',
      newValue: true,
      reason: 'The reporting lane may need API fallback during supervised runs.',
    });

    assert.equal((await readContinuityProfile(projectRoot)), null);
    assert.deepEqual(await listContinuityProfileHistory(projectRoot), []);
    assert.equal(proposal.status, 'pending');
    assert.equal(proposal.actor, 'orchestrator-proposal');

    const rejected = rejectContinuityProposal(proposal, {
      reason: 'Keep fallback disabled until lane policy binds it explicitly.',
      rejectedAt: '2026-04-10T09:15:00Z',
    });
    assert.equal(rejected.status, 'rejected');
    assert.equal((await readContinuityProfile(projectRoot)), null);
    assert.deepEqual(await listContinuityProfileHistory(projectRoot), []);

    const forgetProposal = await createContinuityForgetProposal(projectRoot, {
      path: 'operator.defaultAutonomyPreference',
      forgetReason: 'Revert to the default autonomy policy.',
    });
    const confirmedForget = await confirmContinuityProposal(projectRoot, forgetProposal, {
      recordedAt: '2026-04-10T09:20:00Z',
    });
    assert.equal(confirmedForget.status, 'noop');

    const confirmedUpdate = await confirmContinuityProposal(projectRoot, proposal, {
      recordedAt: '2026-04-10T09:25:00Z',
    });
    assert.equal(confirmedUpdate.status, 'confirmed');

    const profile = await readContinuityProfile(projectRoot);
    assert.equal(profile.runtime.defaultAllowApiFallback, true);

    const history = await listContinuityProfileHistory(projectRoot);
    assert.equal(history.length, 1);
    assert.equal(history[0].actor, 'orchestrator-proposal');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('profile mode stays read-only and falls back to the default stable profile', async () => {
  const projectRoot = await createFixtureProject('vre-orch-continuity-profile-');

  try {
    clearContinuityAssemblyCache();

    assert.equal(await readContinuityProfile(projectRoot), null);
    assert.deepEqual(await listContinuityProfileHistory(projectRoot), []);

    const payload = await assembleContinuityContext(projectRoot, {
      mode: 'profile',
      maxTokens: 400,
    });

    const defaults = buildDefaultContinuityProfile();
    defaults.updatedAt = payload.stableProfile.updatedAt;

    assert.deepEqual(payload.stableProfile, defaults);
    assert.equal(payload.dynamicContext.objective, null);
    assert.equal(payload.dynamicContext.currentMode, null);
    assert.equal(payload.dynamicContext.queue.total, 0);
    assert.deepEqual(payload.retrievalHits, []);
    assert.deepEqual(payload.sourceRefs, []);
    assert.equal(payload.truncated, false);
    assert.equal(await readContinuityProfile(projectRoot), null);
    assert.deepEqual(await listContinuityProfileHistory(projectRoot), []);
  } finally {
    clearContinuityAssemblyCache();
    await cleanupFixtureProject(projectRoot);
  }
});

test('continuity recall dedup keeps stable and dynamic context ahead of recall hits', () => {
  const stableProfile = buildDefaultContinuityProfile({
    updatedAt: '2026-04-10T09:00:00Z',
  });
  const dynamicContext = {
    objective: 'Review the current digest.',
    currentMode: 'review',
    activeThreadId: null,
    laneId: 'review',
    queueFocusTaskId: 'ORCH-TASK-2026-04-10-DEDUP',
    currentTarget: null,
    session: null,
    blockers: [],
    queue: null,
    escalations: null,
    recovery: null,
    memory: null,
    domain: null,
    connectors: { total: 0, degraded: 0, unavailable: 0 },
    automations: { total: 0, blocked: 0, degraded: 0 },
    writingSignals: null,
    resultsSignals: null,
    recentAttempts: [],
    recentDecisions: [],
  };
  const dedup = CONTEXT_INTERNALS.deduplicateRecallHits(stableProfile, dynamicContext, [
    {
      sourceType: 'decision-log',
      sourceRef: 'decision/ORCH-1',
      title: null,
      summary: '- Default autonomy: advisory',
      recordedAt: '2026-04-10T09:01:00Z',
      isStale: false,
    },
    {
      sourceType: 'lane-run',
      sourceRef: 'lane-run/ORCH-RUN-DEDUP',
      title: null,
      summary: '- Objective: Review the current digest.',
      recordedAt: '2026-04-10T09:02:00Z',
      isStale: false,
    },
    {
      sourceType: 'writing-pack',
      sourceRef: 'writing-pack/WPACK-DEDUP',
      title: 'Advisor caveat',
      summary: 'Highlight the unresolved export alert before shipping the digest.',
      recordedAt: '2026-04-10T09:03:00Z',
      isStale: false,
    },
  ]);

  assert.equal(dedup.dedupCount, 2);
  assert.equal(dedup.hits.length, 1);
  assert.equal(dedup.hits[0].sourceType, 'writing-pack');
  assert.equal(dedup.hits[0].sourceRef, 'writing-pack/WPACK-DEDUP');
});

test('assembleContinuityContext builds helper-backed full continuity payloads and formatter output', async () => {
  const projectRoot = await createFixtureProject('vre-orch-continuity-assembly-');

  try {
    const reader = createReader({
      heads: [{
        claimId: 'C-301',
        currentStatus: 'PROMOTED',
        confidence: 0.93,
        narrative: 'Advisor-facing summary should remain concise and claim-backed.',
        governanceProfileAtCreation: 'strict',
      }],
      citations: [{
        claimId: 'C-301',
        citationId: 'CIT-301',
        verificationStatus: 'VERIFIED',
      }],
    });
    const alertReader = createReader({
      heads: [{
        claimId: 'C-301',
        currentStatus: 'KILLED',
        confidence: 0.51,
        governanceProfileAtCreation: 'strict',
      }],
      citations: [{
        claimId: 'C-301',
        citationId: 'CIT-301',
        verificationStatus: 'RETRACTED',
        retractionStatus: 'RETRACTED',
      }],
    });

    await bootstrapContinuityProfile(projectRoot);
    await bootstrapLanePolicies(projectRoot);
    await bootstrapRouterSession(projectRoot, {
      currentMode: 'supervise',
      objective: 'Prepare a safe advisor-facing status update.',
      queueFocusTaskId: 'ORCH-TASK-2026-04-10-301',
    });
    await bootstrapOrchestratorLedgers(projectRoot);

    await applyContinuityProfileUpdate(projectRoot, {
      path: 'operator.reportVerbosity',
      newValue: 'concise',
      reason: 'Advisor updates should be short by default.',
      recordedAt: '2026-04-10T09:30:00Z',
    });

    await publishSessionSnapshot(projectRoot, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: 'writing',
      currentStage: 'advisor-pack',
      nextActions: ['Resolve export alert and update advisor pack.'],
      blockers: ['Awaiting operator decision on the challenged claim.'],
      kernel: { dbAvailable: true, degradedReason: null },
      capabilities: {
        claimHeads: true,
        citationChecks: true,
        governanceProfileAtCreation: true,
        claimSearch: false,
      },
      budget: {
        state: 'ok',
        toolCalls: 3,
        estimatedCostUsd: 0.14,
        countingMode: 'provider_native',
      },
      signals: {
        staleMemory: false,
        unresolvedClaims: 0,
        blockedExperiments: 0,
        exportAlerts: 1,
      },
      lastCommand: '/flow-writing',
      lastAttemptId: 'ATT-2026-04-10-301',
      updatedAt: '2026-04-10T09:35:00Z',
    });
    await publishCapabilitiesSnapshot(projectRoot, {
      schemaVersion: 'vibe-env.capabilities.v1',
      kernel: {
        dbAvailable: true,
        projections: {
          overview: true,
          claimHeads: true,
          unresolvedClaims: true,
          citationChecks: true,
        },
        advanced: {
          governanceProfileAtCreation: true,
          claimSearch: false,
        },
      },
      install: {
        bundles: ['governance-core', 'control-plane', 'flow-results', 'flow-writing'],
      },
      updatedAt: '2026-04-10T09:35:00Z',
    });

    const attempt = await openAttempt(projectRoot, {
      attemptId: 'ATT-2026-04-10-301',
      scope: 'flow-writing',
      targetId: 'submission-301',
    });
    await updateAttempt(projectRoot, attempt.attemptId, {
      status: 'blocked',
      summary: 'Advisor pack blocked until the operator resolves the review disagreement.',
      errorCode: 'REVIEW-DISAGREEMENT',
      endedAt: '2026-04-10T09:36:00Z',
    });

    await appendDecision(projectRoot, {
      decisionId: 'DEC-2026-04-10-301',
      flow: 'writing',
      targetId: 'submission-301',
      kind: 'reporting-style',
      reason: 'Keep the advisor update concise and highlight only material blockers.',
      recordedAt: '2026-04-10T09:37:00Z',
    });

    await createQueueTask(projectRoot, {
      taskId: 'ORCH-TASK-2026-04-10-301',
      mode: 'review',
      ownerLane: 'review',
      status: 'blocked',
      title: 'Challenge the advisor draft and route the outcome explicitly.',
      statusReason: 'Waiting for operator arbitration before resuming.',
    });

    await appendLaneRun(projectRoot, {
      laneRunId: 'ORCH-RUN-2026-04-10-300',
      laneId: 'execution',
      taskId: 'ORCH-TASK-2026-04-10-301',
      providerRef: 'openai/codex',
      integrationKind: 'local-cli',
      supervisionCapability: 'streaming',
      status: 'failed',
      summary: 'Earlier draft run failed before review alignment.',
      startedAt: '2026-04-10T09:10:00Z',
      endedAt: '2026-04-10T09:12:00Z',
    });
    await appendLaneRun(projectRoot, {
      laneRunId: 'ORCH-RUN-2026-04-10-301',
      laneId: 'execution',
      taskId: 'ORCH-TASK-2026-04-10-301',
      providerRef: 'openai/codex',
      integrationKind: 'local-cli',
      supervisionCapability: 'streaming',
      status: 'completed',
      summary: 'Latest draft run produced the advisor-facing artifact set.',
      startedAt: '2026-04-10T09:40:00Z',
      endedAt: '2026-04-10T09:45:00Z',
    });
    await appendRecoveryRecord(projectRoot, {
      recoveryId: 'ORCH-REC-2026-04-10-301',
      taskId: 'ORCH-TASK-2026-04-10-301',
      laneRunId: 'ORCH-RUN-2026-04-10-301',
      failureClass: 'lane-drift',
      recoveryAction: 'request-contrarian-review',
      result: 'scheduled',
      summary: 'Route the next step through the review lane before continuing.',
      recordedAt: '2026-04-10T09:46:00Z',
    });
    await appendEscalationRecord(projectRoot, {
      escalationId: 'ORCH-ESC-2026-04-10-301',
      taskId: 'ORCH-TASK-2026-04-10-301',
      laneRunId: 'ORCH-RUN-2026-04-10-301',
      status: 'pending',
      triggerKind: 'review-disagreement',
      decisionNeeded: 'Decide whether to accept the contrarian review objection.',
      contextShown: ['external-review/ORCH-REVIEW-2026-04-10-301'],
      recordedAt: '2026-04-10T09:47:00Z',
    });

    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-301', {
      status: 'active',
      latestAttemptId: attempt.attemptId,
    });
    await updateExperiment(projectRoot, 'EXP-301', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'wave2.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-301', {
      now: '2026-04-10T09:50:00Z',
      datasetHash: 'sha256:wave2-301',
      artifactMetadata: {
        'plots/wave2.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support the Wave 2 recall bundle.',
          caption: 'Wave 2 advisor figure.',
          interpretation: 'The advisor-facing result remains stable in the packaged output.',
        },
      },
      reader,
    });
    await exportSessionDigest(projectRoot, {
      sourceSessionId: 'session-wave2-301',
      now: '2026-04-10T09:52:00Z',
      experimentIds: ['EXP-301'],
      attemptIds: [attempt.attemptId],
    });

    await buildWritingHandoff(projectRoot, {
      now: '2026-04-10T09:53:00Z',
      snapshotId: 'WEXP-2026-04-10-301A',
      reader,
    });
    await buildWritingHandoff(projectRoot, {
      now: '2026-04-10T09:55:00Z',
      snapshotId: 'WEXP-2026-04-10-301B',
      reader: alertReader,
    });
    await buildAdvisorPack(projectRoot, {
      date: '2026-04-10',
      now: '2026-04-10T09:56:00Z',
    });

    const payload = await assembleContinuityContext(projectRoot, {
      mode: 'full',
      laneId: 'review',
      threadId: 'thread-wave2-301',
      queueTaskId: 'ORCH-TASK-2026-04-10-301',
      maxTokens: 1200,
      limit: 12,
    });

    const validate = await loadValidator(projectRoot, 'assembled-continuity-payload.schema.json');
    assert.equal(validate(payload), true, JSON.stringify(validate.errors));
    assert.equal(payload.stableProfile.operator.reportVerbosity, 'concise');
    assert.equal(payload.dynamicContext.currentMode, 'supervise');
    assert.ok(payload.retrievalHits.length >= 4);

    const sourceTypes = new Set(payload.retrievalHits.map((entry) => entry.sourceType));
    assert.equal(sourceTypes.has('decision-log'), true);
    assert.equal(sourceTypes.has('attempt-summary'), true);
    assert.equal(sourceTypes.has('experiment-bundle'), true);
    assert.equal(sourceTypes.has('writing-pack'), true);
    assert.equal(sourceTypes.has('export-alert'), true);
    assert.equal(sourceTypes.has('lane-run'), true);

    const formatted = formatContinuityForPrompt(payload);
    assert.match(formatted, /## Stable Continuity Profile/u);
    assert.match(formatted, /## Dynamic Context/u);
    assert.match(formatted, /## Recall Hits/u);
    assert.match(formatted, /advisor/u);
  } finally {
    clearContinuityAssemblyCache();
    await cleanupFixtureProject(projectRoot);
  }
});

test('continuity assembly enforces sub-budget truncation and reuses the per-turn cache', async () => {
  const projectRoot = await createFixtureProject('vre-orch-continuity-budget-');

  try {
    clearContinuityAssemblyCache();

    for (let index = 0; index < 6; index += 1) {
      await appendDecision(projectRoot, {
        decisionId: `DEC-2026-04-10-B${index}`,
        flow: 'writing',
        targetId: `target-${index}`,
        kind: 'reporting-style',
        reason: `Advisor summary ${index} should stay concise and highlight only critical blockers.`,
        recordedAt: `2026-04-10T10:0${index}:00Z`,
      });
    }

    const first = await assembleContinuityContext(projectRoot, {
      mode: 'query',
      threadId: 'thread-budget-1',
      queryText: 'advisor concise',
      maxTokens: 40,
      limit: 6,
    });

    assert.equal(first.truncated, true);
    assert.ok(first.totalTokens <= 40);
    assert.ok(first.retrievalHits.length < 6);
    assert.equal(CONTEXT_INTERNALS.getCacheSize(), 1);

    const second = await assembleContinuityContext(projectRoot, {
      mode: 'query',
      threadId: 'thread-budget-1',
      queryText: 'advisor concise',
      maxTokens: 40,
      limit: 6,
    });

    assert.deepEqual(second, first);
    assert.equal(CONTEXT_INTERNALS.getCacheSize(), 1);
  } finally {
    clearContinuityAssemblyCache();
    await cleanupFixtureProject(projectRoot);
  }
});
