import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildEvidenceExcerpt } from '../audit/query.js';
import { createClaimEdge } from '../claims/edges.js';
import { createManifest } from '../lib/manifest.js';
import { resolveKernelReader } from '../lib/kernel-bridge.js';
import { writeObjectiveBlockerFlag } from '../objectives/blocker-flag.js';
import { startObjectiveCommand, statusObjectiveCommand } from '../objectives/cli.js';
import { writeObjectiveResumeSnapshot } from '../objectives/resume-snapshot.js';
import { readObjectiveRecord, writeObjectiveRecord } from '../objectives/store.js';
import { prepareRoleDispatch } from '../orchestrator/agent-orchestration.js';
import { runResearchLoopCommand } from '../orchestrator/autonomy-runtime.js';
import { runAnalysisCommand } from '../orchestrator/execution-lane.js';
import { listPhase9LaneRuns } from '../orchestrator/ledgers.js';
import {
  appendObjectiveQueueRecord,
  readObjectiveQueueRecords
} from '../orchestrator/queue-adapter.js';
import { evaluateDeterministicStrategicCheckpoint } from '../orchestrator/semantic-drift-checkpoint.js';
import { schedulerInstallCommand } from '../orchestrator/windows-task-scheduler.js';

export const WAVE6_SCENARIOS = Object.freeze([
  { id: 'A', command: 'phase9:acceptance:A', task: 'T6.2', title: 'Fresh Research Objective' },
  { id: 'B', command: 'phase9:acceptance:B', task: 'T6.3', title: 'Overnight Blocker' },
  { id: 'B2', command: 'phase9:acceptance:B2', task: 'T6.4', title: 'Unattended Heartbeat Slice' },
  { id: 'B3', command: 'phase9:acceptance:B3', task: 'T6.5', title: 'Resume After Days With Drift' },
  { id: 'C', command: 'phase9:acceptance:C', task: 'T6.6', title: 'Resume After Interruption' },
  { id: 'D', command: 'phase9:acceptance:D', task: 'T6.7', title: 'Guardrail And Sanctioned Execution' },
  { id: 'E', command: 'phase9:acceptance:E', task: 'T6.8', title: 'Degraded/Missing VRE Or Kernel' },
  { id: 'F', command: 'phase9:acceptance:F', task: 'T6.9', title: 'Review Gate And Audit Reconstruction' },
  { id: 'G', command: 'phase9:acceptance:G', task: 'T6.10', title: 'Multi-Agent Team Resume' }
]);

const SCENARIOS_BY_ID = new Map(WAVE6_SCENARIOS.map((scenario) => [scenario.id, scenario]));
const ACCEPTANCE_ROOT = '.vibe-science-environment/acceptance/wave6';
const BASE_TS = Date.parse('2026-06-06T00:00:00.000Z');
const OBJECTIVE_ID_PATTERN = /^OBJ-.+/u;
const EXPERIMENT_ID = 'EXP-021';
const REAL_SURFACES_BY_SCENARIO = Object.freeze({
  A: ['startObjectiveCommand', 'runAnalysisCommand'],
  B: ['writeObjectiveBlockerFlag', 'statusObjectiveCommand', 'writeObjectiveResumeSnapshot'],
  B2: ['schedulerInstallCommand', 'runResearchLoopCommand'],
  B3: ['evaluateDeterministicStrategicCheckpoint', 'runResearchLoopCommand'],
  C: ['appendObjectiveQueueRecord', 'runResearchLoopCommand'],
  D: ['runAnalysisCommand'],
  E: ['resolveKernelReader', 'runResearchLoopCommand'],
  F: ['createClaimEdge', 'buildEvidenceExcerpt'],
  G: ['prepareRoleDispatch', 'writeObjectiveResumeSnapshot']
});

class Wave6AcceptanceError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Wave6AcceptanceError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new Wave6AcceptanceError(code, message, extra);
}

function iso(offsetMs = 0) {
  return new Date(BASE_TS + offsetMs).toISOString();
}

function normalizeObjectiveId(objectiveId) {
  if (typeof objectiveId !== 'string' || objectiveId.trim() === '') {
    fail('E_WAVE6_OBJECTIVE_ID_REQUIRED', 'Wave 6 acceptance requires objectiveId.');
  }
  const normalized = objectiveId.trim();
  if (!OBJECTIVE_ID_PATTERN.test(normalized)) {
    fail('E_WAVE6_OBJECTIVE_ID_INVALID', 'Wave 6 objectiveId must start with OBJ-.', {
      objectiveId: normalized
    });
  }
  return normalized;
}

function normalizeScenarioId(scenarioId) {
  if (typeof scenarioId !== 'string') {
    fail('E_WAVE6_SCENARIO_REQUIRED', 'Wave 6 scenarioId is required.');
  }
  const normalized = scenarioId.trim().toUpperCase();
  if (!SCENARIOS_BY_ID.has(normalized)) {
    fail('E_WAVE6_SCENARIO_UNKNOWN', `Unknown Wave 6 scenario: ${scenarioId}`, {
      allowed: WAVE6_SCENARIOS.map((scenario) => scenario.id)
    });
  }
  return normalized;
}

function safePathSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function digestHex(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function realSurface(surface, value = {}) {
  return {
    ...value,
    realSurface: surface,
    provenance: {
      ...(value.provenance ?? {}),
      realSurface: surface
    }
  };
}

function collectRealSurfaces(value, surfaces = new Set()) {
  if (value == null) {
    return surfaces;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRealSurfaces(item, surfaces);
    }
    return surfaces;
  }
  if (typeof value !== 'object') {
    return surfaces;
  }
  if (typeof value.realSurface === 'string' && value.realSurface.trim() !== '') {
    surfaces.add(value.realSurface.trim());
  }
  if (
    typeof value.provenance?.realSurface === 'string' &&
    value.provenance.realSurface.trim() !== ''
  ) {
    surfaces.add(value.provenance.realSurface.trim());
  }
  for (const nested of Object.values(value)) {
    collectRealSurfaces(nested, surfaces);
  }
  return surfaces;
}

function assertionsAreGreen(assertions) {
  return Object.values(assertions).every((value) => value === true);
}

async function captureSurface(surface, fn) {
  try {
    return realSurface(surface, await fn());
  } catch (error) {
    return realSurface(surface, {
      ok: false,
      code: error?.code ?? 'E_REAL_SURFACE_FAILED',
      message: error?.message ?? String(error),
      extra: error?.extra ?? null,
      status: error?.status ?? null
    });
  }
}

async function createScenarioRuntimeProject(projectRoot, bundleDir) {
  const runtimeRoot = path.join(bundleDir, 'runtime-project');
  await mkdir(runtimeRoot, { recursive: true });
  await cp(path.join(projectRoot, 'environment'), path.join(runtimeRoot, 'environment'), {
    recursive: true
  });
  await cp(path.join(projectRoot, 'bin'), path.join(runtimeRoot, 'bin'), {
    recursive: true
  });
  await cp(path.join(projectRoot, 'commands'), path.join(runtimeRoot, 'commands'), {
    recursive: true
  });
  await cp(path.join(projectRoot, 'package.json'), path.join(runtimeRoot, 'package.json'));
  await mkdir(path.join(runtimeRoot, '.vibe-science-environment'), { recursive: true });
  return runtimeRoot;
}

function buildObjectiveRecord(objectiveId, overrides = {}) {
  return {
    schemaVersion: 'phase9.objective.v1',
    objectiveId,
    title: overrides.title ?? 'Wave 6 acceptance objective',
    question: overrides.question ?? 'Which Wave 6 acceptance evidence remains aligned with the objective?',
    createdAt: overrides.createdAt ?? iso(0),
    status: overrides.status ?? 'active',
    budget: {
      schemaVersion: 'phase9.runtime-budget.v1',
      maxWallSeconds: 604800,
      maxIterations: 20,
      maxTaskCount: 40,
      maxExternalCalls: 8,
      costCeiling: 25.5,
      heartbeatIntervalSeconds: 300,
      allowedTaskKinds: [
        'analysis-execution-run',
        'results-bundle-discover',
        'session-digest-review',
        'memory-sync-refresh'
      ],
      networkPolicy: 'allowlist-only',
      humanApprovalRequiredForDestructive: true,
      ...(overrides.budget ?? {})
    },
    runtimeMode: overrides.runtimeMode ?? 'unattended-batch',
    reasoningMode: overrides.reasoningMode ?? 'rule-only',
    wakePolicy: {
      wakeOwner: 'windows-task-scheduler',
      wakeSourceId: `TASK-${objectiveId}`,
      leaseTtlSeconds: 900,
      duplicateWakePolicy: 'no-op',
      ...(overrides.wakePolicy ?? {})
    },
    stopConditions: {
      onBudgetExhausted: 'block',
      onBlocker: 'block',
      onAmbiguousEvidence: 'request-review',
      onMissingInput: 'block',
      onFailedGate: 'block',
      onHumanDecisionNeeded: 'block'
    },
    ownerAgentRole: 'lead-researcher',
    stages: overrides.stages ?? [
      { stageId: 'orientation', status: 'completed' },
      { stageId: 'analysis', status: 'active' }
    ],
    artifactsIndex: {
      literature: [],
      experiments: [EXPERIMENT_ID],
      results: [],
      writing: [],
      review: [],
      ...(overrides.artifactsIndex ?? {})
    },
    createdBySession: overrides.createdBySession ?? `sess-${safePathSegment(objectiveId)}`,
    lastUpdatedAt: overrides.lastUpdatedAt ?? iso(1_000)
  };
}

function handshakeDeps(objectiveId, extra = {}) {
  return {
    persistCapabilityHandshake: async (root) => {
      const handshake = postObjectiveHandshake(objectiveId, extra);
      const artifactPath = path.join(
        root,
        '.vibe-science-environment',
        'control',
        'capability-handshake.json'
      );
      await writeJson(artifactPath, handshake);
      return { handshake, artifactPath };
    },
    generateCapabilityHandshake: async () => postObjectiveHandshake(objectiveId, extra)
  };
}

async function seedExperimentManifest(projectRoot, objectiveId) {
  return createManifest(projectRoot, {
    schemaVersion: 'vibe.experiment.manifest.v1',
    experimentId: EXPERIMENT_ID,
    title: 'Wave 6 acceptance experiment',
    objective: objectiveId,
    status: 'planned',
    createdAt: iso(1_000),
    parameters: { pipeline: 'wave6-acceptance' },
    codeRef: {
      entrypoint: 'analysis/scripts/wave6-safe.mjs',
      gitCommit: 'wave6-fixture'
    },
    inputArtifacts: ['data/wave6-input.json'],
    outputArtifacts: ['artifacts/wave6-output.json'],
    relatedClaims: [],
    blockers: [],
    notes: 'Created by Wave 6 acceptance harness.'
  });
}

async function writeAnalysisManifest(projectRoot, objectiveId, {
  analysisId,
  manifestName,
  language = 'other',
  runner = 'other',
  scriptPath = `analysis/scripts/${manifestName.replace(/\.json$/u, '')}.mjs`,
  inputPath = `data/${manifestName.replace(/\.json$/u, '')}-input.json`,
  outputPath = `artifacts/${manifestName.replace(/\.json$/u, '')}-output.json`,
  allowNetwork = false
}) {
  await mkdir(path.dirname(path.join(projectRoot, scriptPath)), { recursive: true });
  await mkdir(path.dirname(path.join(projectRoot, inputPath)), { recursive: true });
  await writeFile(path.join(projectRoot, inputPath), '{"rows":[{"id":"cell-001","count":8}]}\n', 'utf8');
  await writeFile(path.join(projectRoot, scriptPath), [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import path from 'node:path';",
    "const inputPath = process.argv[process.argv.indexOf('--input') + 1];",
    "const outputPath = process.argv[process.argv.indexOf('--output') + 1];",
    "const raw = await readFile(inputPath, 'utf8');",
    "await mkdir(path.dirname(outputPath), { recursive: true });",
    "await writeFile(outputPath, JSON.stringify({ ok: true, input: JSON.parse(raw) }) + '\\n', 'utf8');",
    ""
  ].join('\n'), 'utf8');

  const manifest = {
    schemaVersion: 'phase9.analysis-manifest.v1',
    objectiveId,
    experimentId: EXPERIMENT_ID,
    analysisId,
    script: {
      path: scriptPath,
      sha256: '5'.repeat(64),
      language
    },
    inputs: [{ path: inputPath, kind: 'dataset', sha256: null, sizeBytes: null }],
    outputs: [{ path: outputPath, kind: 'table', sha256: null, sizeBytes: null }],
    command: {
      runner,
      argv: [scriptPath, '--input', inputPath, '--output', outputPath]
    },
    budget: {
      maxRuntimeSeconds: 60,
      maxMemoryGb: 1,
      allowNetwork
    },
    safety: {
      destructive: false,
      treeWideWrite: false,
      externalCall: false
    },
    taskKind: 'analysis-execution-run',
    expectedArtifacts: [{ path: outputPath, kind: 'table', required: true }],
    humanApproval: {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      reason: null
    },
    createdAt: iso(2_000),
    createdBy: `sess-${safePathSegment(objectiveId)}`
  };
  const manifestPath = `analysis/manifests/${manifestName}`;
  await writeJson(path.join(projectRoot, manifestPath), manifest);
  return { manifest, manifestPath };
}

async function seedActiveScenarioProject(projectRoot, objectiveId, options = {}) {
  const experimentManifest = await seedExperimentManifest(projectRoot, objectiveId);
  const objectiveRecord = buildObjectiveRecord(objectiveId, options.objective ?? {});
  const objectiveStart = realSurface('startObjectiveCommand', await startObjectiveCommand(
    projectRoot,
    {
      objectiveRecord,
      sessionId: `sess-${safePathSegment(objectiveId)}`
    },
    handshakeDeps(objectiveId, options.handshake ?? {})
  ));
  return { experimentManifest, objectiveRecord, objectiveStart };
}

function createFakeSchedulerDeps(nextRunTime = iso(3600_000)) {
  const tasks = new Map();
  return {
    detectHostSupport: async () => ({
      supportMode: 'full',
      code: null,
      reason: null,
      platform: 'win32',
      adminConfirmed: true,
      hasS3: true,
      hasS0ix: false,
      wakeTimersEnabled: true,
      acConfirmed: true
    }),
    registerTask: async (taskDefinition) => {
      tasks.set(taskDefinition.taskName, {
        exists: true,
        taskName: taskDefinition.taskName,
        state: 'Ready',
        lastRunTime: null,
        nextRunTime,
        execute: taskDefinition.execute,
        arguments: taskDefinition.arguments,
        workingDirectory: taskDefinition.workingDirectory,
        wakeToRun: 'true',
        disallowStartIfOnBatteries: 'false',
        stopIfGoingOnBatteries: 'false',
        runLevel: 'Highest',
        userId: 'SYSTEM',
        logonType: 'ServiceAccount'
      });
    },
    readTask: async (taskName) => tasks.get(taskName) ?? { exists: false, taskName },
    removeTask: async (taskName) => ({ removed: tasks.delete(taskName) }),
    runHeartbeatProbe: async () => ({ ok: true, exitCode: 0, payload: { ok: true, probe: 'heartbeat' } }),
    clock: () => iso(3_000)
  };
}

async function readRuntimeResumeSnapshot(projectRoot, objectiveId, result) {
  const snapshotPath = result.snapshotPath
    ? path.join(projectRoot, result.snapshotPath)
    : path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'resume-snapshot.json');
  return JSON.parse(await readFile(snapshotPath, 'utf8'));
}

function artifactFileName(key) {
  return `${key.replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`)}.json`;
}

function withObjective(objectiveId, value = {}) {
  return {
    objectiveId,
    ...value
  };
}

function preObjectiveHandshake() {
  return {
    schemaVersion: 'phase9.capability-handshake.v1',
    objectiveId: null,
    neutralReason: 'startup handshake created before objective start is objective-neutral'
  };
}

function postObjectiveHandshake(objectiveId, extra = {}) {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.capability-handshake.v1',
    objective: {
      activeObjectiveId: objectiveId,
      status: 'active'
    },
    kernel: {
      mode: extra.kernelMode ?? 'full',
      dbAvailable: extra.kernelMode !== 'degraded',
      unreachableReason: extra.kernelMode === 'degraded' ? 'fixture kernel DB unavailable' : null
    },
    memory: {
      fresh: extra.memoryFresh ?? true,
      lastSyncAt: extra.memoryFresh === false ? iso(-96 * 60 * 60 * 1000) : iso(1_000)
    },
    vre: {
      present: extra.vrePresent ?? true,
      executableCommands: ['capabilities --json', 'objective start', 'run-analysis', 'research-loop']
    }
  });
}

function objectiveState(objectiveId, status = 'active') {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.objective.v1',
    status,
    title: 'Wave 6 acceptance fixture objective',
    question: 'Can Phase 9 produce artifact-backed acceptance evidence?',
    runtimeMode: 'unattended-batch',
    reasoningMode: 'rule-only'
  });
}

function activeObjectivePointer(objectiveId) {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.active-objective-pointer.v1',
    objectiveRecordPath: `.vibe-science-environment/objectives/${objectiveId}/objective.json`
  });
}

function resumeSnapshot(objectiveId, overrides = {}) {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.resume-snapshot.v1',
    writtenAt: overrides.writtenAt ?? iso(40_000),
    writtenReason: overrides.writtenReason ?? 'manual',
    objectiveStatusAtSnapshot: overrides.status ?? 'active',
    runtimeMode: overrides.runtimeMode ?? 'unattended-batch',
    reasoningMode: 'rule-only',
    wakePolicySnapshot: {
      wakeOwner: overrides.wakeOwner ?? 'manual',
      wakeSourceId: overrides.wakeSourceId ?? null,
      heartbeatIntervalSeconds: 300,
      leaseTtlSeconds: 300,
      duplicateWakePolicy: 'no-op'
    },
    budgetRemaining: {
      maxWallSecondsLeft: overrides.maxWallSecondsLeft ?? 600,
      maxIterationsLeft: overrides.maxIterationsLeft ?? 1,
      costCeilingLeft: null
    },
    queueVisibility: {
      queuePath: `.vibe-science-environment/objectives/${objectiveId}/queue.jsonl`,
      queueCursor: overrides.queueCursor ?? 'cursor-1',
      pendingCount: overrides.pendingCount ?? 0,
      runningCount: 0,
      lastTaskId: overrides.lastTaskId ?? 'TASK-W6-1'
    },
    stageCursor: {
      current: overrides.stage ?? 'acceptance',
      stageStatus: overrides.stageStatus ?? 'checkpointed',
      lastCompleteStage: overrides.lastCompleteStage ?? null
    },
    nextAction: overrides.nextAction ?? {
      kind: 'await-operator',
      params: {}
    },
    openBlockers: overrides.openBlockers ?? [],
    openHandoffs: overrides.openHandoffs ?? [],
    wakeLease: {
      wakeId: overrides.wakeId ?? null,
      leaseAcquiredAt: overrides.leaseAcquiredAt ?? null,
      leaseExpiresAt: overrides.leaseExpiresAt ?? null,
      acquiredBy: overrides.acquiredBy ?? null,
      previousWakeId: overrides.previousWakeId ?? null
    },
    kernelFingerprint: overrides.kernelFingerprint ?? {
      lastClaimId: 'CLAIM-W6-1',
      lastCitationCheckId: 'CIT-W6-1',
      lastR2VerdictId: null,
      lastObserverAlertId: null,
      lastGateCheckId: null,
      lastPatternId: null,
      takenAt: iso(5_000)
    },
    notes: overrides.notes ?? 'Wave 6 acceptance snapshot.'
  });
}

async function commonArtifacts(projectRoot, objectiveId, context = {}) {
  const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId).catch(() =>
    objectiveState(objectiveId)
  );
  const laneRunRecords = context.laneRunRecords ?? await listPhase9LaneRuns(projectRoot, {
    objectiveId
  }).catch(() => []);
  const objectiveStart = context.objectiveStart ?? activeObjectivePointer(objectiveId);
  const {
    realSurface: _objectiveStartRealSurface,
    provenance: _objectiveStartProvenance,
    ...objectiveStartPayload
  } = objectiveStart;
  return {
    preObjectiveHandshake: preObjectiveHandshake(),
    capabilityHandshake: postObjectiveHandshake(objectiveId),
    objectiveState: withObjective(objectiveId, objectiveRecord),
    activeObjectivePointer: withObjective(objectiveId, {
      ...objectiveStartPayload
    }),
    fixtureDataset: withObjective(objectiveId, {
      schemaVersion: 'phase9.wave6.fixture-dataset.v1',
      rows: [
        { cellId: 'cell-001', gene: 'MALAT1', count: 8 },
        { cellId: 'cell-002', gene: 'MALAT1', count: 5 }
      ]
    }),
    experimentManifest: withObjective(objectiveId, {
      ...(context.experimentManifest ?? {
        schemaVersion: 'vibe.experiment.manifest.v1',
        experimentId: EXPERIMENT_ID,
        binding: { objectiveId }
      })
    }),
    analysisManifest: withObjective(objectiveId, {
      ...(context.analysisManifest ?? {
        schemaVersion: 'phase9.analysis-manifest.v1',
        analysisId: 'ANL-W6-1',
        command: { runner: 'other', allowNetwork: false }
      })
    }),
    queueRecords: context.queueRecords ?? [],
    laneRunRecords: laneRunRecords.map((record) => withObjective(objectiveId, record)),
    memorySyncState: withObjective(objectiveId, {
      status: 'fresh',
      lastSyncAt: iso(20_000)
    }),
    kernelProjectionSnapshot: withObjective(objectiveId, {
      schemaVersion: 'phase9.kernel-projection-probe.v1',
      kernelFingerprint: resumeSnapshot(objectiveId).kernelFingerprint
    }),
    testOutput: withObjective(objectiveId, {
      format: 'node:test TAP',
      status: 'pass'
    })
  };
}

function buildPackageManifest(objectiveId, createdAt = iso(50_000)) {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.package-manifest.v1',
    packageId: `PKG-${objectiveId}`,
    createdAt,
    artifacts: [],
    contentAddressed: true
  });
}

function buildReviewRecord(
  objectiveId,
  packageManifestPath = 'package-manifest.json',
  reviewedAt = iso(51_000)
) {
  return withObjective(objectiveId, {
    schemaVersion: 'phase9.review-record.v1',
    reviewId: `REV-${objectiveId}`,
    packageManifestPath,
    packageManifestDigest: null,
    reviewInputArtifacts: [],
    reviewedAt,
    verdict: 'accept',
    reviewerRole: 'reviewer-2',
    decisionVisibleBeforeContinuation: true
  });
}

function sameObjectiveAssertions(objectiveId, artifacts) {
  const mismatches = [];
  for (const [key, value] of Object.entries(artifacts)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        if (item?.objectiveId !== objectiveId) {
          mismatches.push(`${key}[${index}]`);
        }
      }
      continue;
    }
    if (typeof value === 'object' && value.objectiveId !== objectiveId && value.neutralReason == null) {
      mismatches.push(key);
    }
  }
  return {
    sameObjectiveIdAcrossNonNeutralArtifacts: mismatches.length === 0,
    objectiveMismatches: mismatches
  };
}

async function scenarioA(projectRoot, objectiveId) {
  const { manifest, manifestPath } = await writeAnalysisManifest(projectRoot, objectiveId, {
    analysisId: 'ANL-W6-A',
    manifestName: 'wave6-a.json'
  });
  const unsafeExecution = withObjective(objectiveId, await captureSurface(
    'runAnalysisCommand',
    () => runAnalysisCommand(projectRoot, { manifestPath })
  ));
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  const sanctionedRun = withObjective(objectiveId, await captureSurface(
    'runAnalysisCommand',
    () => runAnalysisCommand(projectRoot, { manifestPath })
  ));
  const snapshotWrite = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'pre-stop',
    writtenAt: iso(40_000),
    nextAction: { kind: 'request-r2', params: { claimId: 'CLAIM-W6-A' } }
  });
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest,
      analysisManifest: manifest
    }),
    objectiveStart: seeded.objectiveStart,
    literatureRegistration: withObjective(objectiveId, {
      status: 'placeholder-registered',
      dedupeKey: 'paper:wave6-fixture'
    }),
    unsafeExecution,
    sanctionedRun,
    packageManifest: buildPackageManifest(objectiveId),
    reviewRecord: buildReviewRecord(objectiveId),
    resumeSnapshot: snapshotWrite.snapshot
  };
  return {
    artifacts,
    assertions: {
      directScriptBlocked: artifacts.unsafeExecution.code === 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
      sanctionedManifestAllowedAndLogged: artifacts.sanctionedRun.ok === true,
      postObjectiveHandshakeCarriesObjectiveId: artifacts.capabilityHandshake.objectiveId === objectiveId,
      preObjectiveHandshakeIsNeutral: artifacts.preObjectiveHandshake.objectiveId === null
    }
  };
}

async function scenarioB(projectRoot, objectiveId) {
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  const blockerCode = 'MISSING_OPERATOR_DECISION';
  const blockerMessage = 'Human decision required before continuing unattended work.';
  const snapshotWrite = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'pre-stop',
    writtenAt: iso(20_000),
    nextAction: { kind: 'await-operator', params: { blockerCode } },
    notes: blockerMessage
  });
  const blockerPath = await writeObjectiveBlockerFlag(projectRoot, objectiveId, {
    code: blockerCode,
    message: blockerMessage,
    snapshotPath: snapshotWrite.snapshotPath,
    writtenAt: iso(30_000)
  });
  const currentRecord = await readObjectiveRecord(projectRoot, objectiveId);
  await writeObjectiveRecord(projectRoot, {
    ...currentRecord,
    status: 'blocked',
    lastUpdatedAt: iso(31_000)
  });
  const statusProbe = withObjective(objectiveId, await captureSurface(
    'statusObjectiveCommand',
    () => statusObjectiveCommand(projectRoot, { objectiveId }, handshakeDeps(objectiveId))
  ));
  const resumeSnapshotArtifact = realSurface('writeObjectiveResumeSnapshot', snapshotWrite.snapshot);
  const blocker = realSurface('writeObjectiveBlockerFlag', withObjective(objectiveId, {
    path: blockerPath,
    code: blockerCode,
    message: blockerMessage,
    openedAt: iso(30_000)
  }));
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest
    }),
    blockerFlag: blocker,
    eventLog: [
      withObjective(objectiveId, { eventType: 'objective-started', at: iso(1_000) }),
      withObjective(objectiveId, { eventType: 'blocker-open', at: blocker.openedAt })
    ],
    statusProbe,
    objectiveStatusFromFreshProcess: withObjective(objectiveId, {
      status: statusProbe.status,
      blockerPath: blocker.path
    }),
    resumeSnapshot: resumeSnapshotArtifact
  };
  return {
    artifacts,
    assertions: {
      blockerFlagExists: typeof blocker.path === 'string' && blocker.path.endsWith('BLOCKER.flag'),
      noWorkAfterBlocker: artifacts.eventLog.at(-1).eventType === 'blocker-open',
      objectiveStatusFreshProcessReadable: statusProbe.status === 'blocked'
    }
  };
}

async function scenarioB2(projectRoot, objectiveId) {
  const { manifest, manifestPath } = await writeAnalysisManifest(projectRoot, objectiveId, {
    analysisId: 'ANL-W6-B2',
    manifestName: 'wave6-b2.json'
  });
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'heartbeat',
    writtenAt: iso(5_000),
    nextAction: { kind: 'research-loop', params: { manifestPath } }
  });
  const schedulerRegistration = withObjective(objectiveId, await captureSurface(
    'schedulerInstallCommand',
    () => schedulerInstallCommand(projectRoot, { objectiveId }, createFakeSchedulerDeps())
  ));
  const wakeId = 'wake-w6-b2-001';
  const loopDeps = {
    generateCapabilityHandshake: handshakeDeps(objectiveId).generateCapabilityHandshake
  };
  const firstWake = withObjective(objectiveId, await captureSurface(
    'runResearchLoopCommand',
    () => runResearchLoopCommand(projectRoot, {
      objectiveId,
      heartbeat: true,
      wakeId,
      now: iso(10_000),
      sessionId: 'sess-wave6-b2-first'
    }, loopDeps)
  ));
  const duplicateWake = withObjective(objectiveId, await captureSurface(
    'runResearchLoopCommand',
    () => runResearchLoopCommand(projectRoot, {
      objectiveId,
      heartbeat: true,
      wakeId,
      now: iso(11_000),
      sessionId: 'sess-wave6-b2-duplicate'
    }, loopDeps)
  ));
  const queueRecords = (await readObjectiveQueueRecords(projectRoot, objectiveId))
    .map((record) => withObjective(objectiveId, record));
  const snapshot = await readRuntimeResumeSnapshot(projectRoot, objectiveId, duplicateWake);
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest,
      analysisManifest: manifest,
      queueRecords
    }),
    schedulerRegistration,
    wakeEvents: [
      {
        ...firstWake,
        wakeId,
        result: firstWake.status,
        boundedTaskCount: firstWake.status === 'slice-complete' ? 1 : 0
      },
      {
        ...duplicateWake,
        wakeId,
        result: duplicateWake.status === 'no-op' ? 'duplicate-no-op' : duplicateWake.status,
        boundedTaskCount: 0
      }
    ],
    resumeSnapshot: snapshot,
    claimPromotionAttempt: withObjective(objectiveId, {
      attempted: false,
      reason: 'unattended mode cannot promote claims'
    })
  };
  return {
    artifacts,
    assertions: {
      schedulerRegistrationExistsBeforeWake: artifacts.schedulerRegistration.taskInstalled === true,
      firstWakeRunsOneBoundedSlice: artifacts.wakeEvents[0].boundedTaskCount === 1,
      duplicateWakeNoOp: artifacts.wakeEvents[1].result === 'duplicate-no-op',
      noUnattendedClaimPromotion: artifacts.claimPromotionAttempt.attempted === false
    }
  };
}

async function scenarioB3(projectRoot, objectiveId) {
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId, {
    objective: {
      question: 'Which Wave 6 acceptance evidence remains aligned with the objective after delayed resume?'
    }
  });
  const preLoopSnapshot = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'heartbeat',
    writtenAt: iso(10_000),
    nextAction: { kind: 'research-loop', params: { delayedHours: 72 } }
  });
  const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
  const strategicCheckpoint = realSurface('evaluateDeterministicStrategicCheckpoint',
    evaluateDeterministicStrategicCheckpoint({
      objectiveRecord,
      snapshotState: {
        snapshot: {
          stageCursor: { current: 'analysis' },
          budgetRemaining: { maxIterationsLeft: 1 },
          openBlockers: []
        }
      },
      queueState: {
        latestRecords: [{
          taskKind: 'session-digest-review',
          taskId: 'TASK-W6-B3-R2',
          status: 'completed'
        }]
      },
      events: [],
      handoffs: [{
        summary: 'Contradiction: unrelated procurement decision should not drive this analysis.'
      }],
      phase: 'final-quarter'
    })
  );
  const loopResult = withObjective(objectiveId, await captureSurface(
    'runResearchLoopCommand',
    () => runResearchLoopCommand(projectRoot, {
      objectiveId,
      heartbeat: true,
      wakeId: 'wake-w6-b3-drift',
      now: iso(72 * 60 * 60 * 1000 + 20_000),
      sessionId: 'sess-wave6-b3'
    }, {
      generateCapabilityHandshake: handshakeDeps(objectiveId, { memoryFresh: false }).generateCapabilityHandshake,
      strategicCheckpoint: async () => ({
        status: 'drifted',
        phase: 'pre-slice',
        message: 'Delayed resume evidence drifted from the objective.'
      })
    })
  ));
  const snapshot = await readRuntimeResumeSnapshot(projectRoot, objectiveId, loopResult);
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest
    }),
    timeProviderOffset: withObjective(objectiveId, {
      offsetMs: 72 * 60 * 60 * 1000,
      persistedForChildProcess: true
    }),
    registrationCounts: withObjective(objectiveId, {
      before: { paper: 1 },
      after: { paper: 1 }
    }),
    memoryStaleness: withObjective(objectiveId, {
      stale: true,
      visibleInHandshake: true
    }),
    strategicCheckpoint: withObjective(objectiveId, strategicCheckpoint),
    loopResult,
    kernelDrift: withObjective(objectiveId, {
      previousFingerprint: { lastClaimId: 'CLAIM-W6-B3-OLD', takenAt: iso(5_000) },
      currentFingerprint: { lastClaimId: 'CLAIM-W6-B3-NEW', takenAt: iso(72 * 60 * 60 * 1000 + 5_000) },
      mismatchCode: loopResult.stopReason ?? strategicCheckpoint.status,
      dependentNextActionBlocked: loopResult.status === 'paused',
      independentNextActionAllowed: true
    }),
    preLoopResumeSnapshot: preLoopSnapshot.snapshot,
    resumeSnapshot: snapshot
  };
  artifacts.capabilityHandshake = postObjectiveHandshake(objectiveId, { memoryFresh: false });
  return {
    artifacts,
    assertions: {
      noDuplicateRegistrations: artifacts.registrationCounts.before.paper === artifacts.registrationCounts.after.paper,
      kernelDriftBlocksOnlyDependentNextAction:
        artifacts.kernelDrift.dependentNextActionBlocked && artifacts.kernelDrift.independentNextActionAllowed,
      sameObjectiveIdAfterSeventyTwoHours: artifacts.resumeSnapshot.objectiveId === objectiveId
    }
  };
}

async function scenarioC(projectRoot, objectiveId) {
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'manual',
    writtenAt: iso(8_000),
    nextAction: { kind: 'research-loop', params: { recovery: true } }
  });
  const queuedRecord = realSurface('appendObjectiveQueueRecord', await appendObjectiveQueueRecord(
    projectRoot,
    objectiveId,
    {
      objectiveId,
      taskId: 'analysis-execution-run:ANL-W6-C',
      taskKind: 'analysis-execution-run',
      analysisId: 'ANL-W6-C',
      status: 'running',
      taskAttemptId: 'TASK-W6-C-INCOMPLETE',
      createdAt: iso(10_000),
      updatedAt: iso(10_000),
      sessionId: 'sess-wave6-c',
      wakeId: 'wake-w6-c-before-crash',
      handoffId: null,
      sourceArtifactPaths: ['analysis/manifests/wave6-c.json'],
      resultArtifactPaths: [],
      resumeCursor: {
        manifestPath: 'analysis/manifests/wave6-c.json',
        queueRecordSeq: null
      }
    }
  ));
  const loopResult = withObjective(objectiveId, await captureSurface(
    'runResearchLoopCommand',
    () => runResearchLoopCommand(projectRoot, {
      objectiveId,
      heartbeat: true,
      wakeId: 'wake-w6-c-resume',
      now: iso(20_000),
      sessionId: 'sess-wave6-c-resume'
    }, {
      generateCapabilityHandshake: handshakeDeps(objectiveId).generateCapabilityHandshake
    })
  ));
  const queueRecords = (await readObjectiveQueueRecords(projectRoot, objectiveId))
    .map((record) => withObjective(objectiveId, record));
  const snapshot = await readRuntimeResumeSnapshot(projectRoot, objectiveId, loopResult);
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest,
      queueRecords
    }),
    queuedRecord: withObjective(objectiveId, queuedRecord),
    resumeRecovery: realSurface('runResearchLoopCommand', withObjective(objectiveId, {
      crashPoint: 'after-task-intent-before-snapshot',
      recoveredFrom: ['queue-write-ahead', 'objective-event-log'],
      nonIdempotentTaskReplayed: loopResult.status !== 'blocked',
      status: loopResult.status,
      stopReason: loopResult.stopReason,
      digestPath: loopResult.digestPath ?? null
    })),
    eventLog: [
      withObjective(objectiveId, { eventType: 'task-intent', taskId: 'TASK-W6-C-1', at: iso(10_000) }),
      withObjective(objectiveId, { eventType: 'task-result', taskId: 'TASK-W6-C-1', at: iso(20_000) }),
      withObjective(objectiveId, { eventType: 'resume-recovered', taskId: 'TASK-W6-C-1', at: iso(30_000) })
    ],
    resumeSnapshot: snapshot
  };
  return {
    artifacts,
    assertions: {
      sameObjectiveIdAfterFreshResume: artifacts.resumeSnapshot.objectiveId === objectiveId,
      crashBeforeSnapshotRecoveredFromWriteAhead: artifacts.resumeRecovery.recoveredFrom.includes('queue-write-ahead'),
      nonIdempotentTaskNotDuplicated: artifacts.resumeRecovery.status === 'blocked'
    }
  };
}

async function scenarioD(projectRoot, objectiveId) {
  await writeAnalysisManifest(projectRoot, objectiveId, {
    analysisId: 'ANL-W6-D-BAD',
    manifestName: 'wave6-d-unsafe.json',
    language: 'python',
    scriptPath: 'analysis/scripts/wave6-d-unsafe.py'
  });
  const { manifest, manifestPath } = await writeAnalysisManifest(projectRoot, objectiveId, {
    analysisId: 'ANL-W6-D-SAFE',
    manifestName: 'wave6-d-safe.json'
  });
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  const unsafeExecution = withObjective(objectiveId, await captureSurface(
    'runAnalysisCommand',
    () => runAnalysisCommand(projectRoot, { manifestPath: 'analysis/manifests/wave6-d-unsafe.json' })
  ));
  const sanctionedRun = withObjective(objectiveId, await captureSurface(
    'runAnalysisCommand',
    () => runAnalysisCommand(projectRoot, { manifestPath })
  ));
  const laneRunRecords = (await listPhase9LaneRuns(projectRoot, { objectiveId }))
    .map((record) => withObjective(objectiveId, record));
  const snapshotWrite = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'loop-iteration',
    writtenAt: iso(40_000),
    nextAction: { kind: 'package-results', params: { laneRunId: sanctionedRun.taskId } }
  });
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest,
      analysisManifest: manifest,
      laneRunRecords
    }),
    unsafeExecution,
    sanctionedRun,
    laneRunRecords,
    eventLog: [
      withObjective(objectiveId, { eventType: 'law_violation', sourceComponent: 'plugin/hooks/pre-tool-use' }),
      withObjective(objectiveId, { eventType: 'analysis_run_completed', sourceComponent: 'vre/run-analysis' })
    ],
    resumeSnapshot: snapshotWrite.snapshot
  };
  return {
    artifacts,
    assertions: {
      directScriptDeniedAndLogged: artifacts.unsafeExecution.code === 'E_ANALYSIS_TEMPLATE_UNSUPPORTED',
      sanctionedManifestAllowedAndLogged: artifacts.sanctionedRun.status === 'complete',
      laneRunRecordHasProvenance: artifacts.laneRunRecords.some((record) =>
        record.manifestPath === manifestPath && record.status === 'complete'
      )
    }
  };
}

async function scenarioE(projectRoot, objectiveId) {
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId, {
    handshake: { kernelMode: 'degraded' }
  });
  const degradedKernelReader = await resolveKernelReader({ kernelRoot: null, projectPath: projectRoot });
  const degradedVre = withObjective(objectiveId, await captureSurface(
    'runResearchLoopCommand',
    () => runResearchLoopCommand(projectRoot, {
      objectiveId: `${objectiveId}-MISSING`,
      heartbeat: true,
      wakeId: 'wake-w6-e-missing-vre',
      now: iso(15_000),
      sessionId: 'sess-wave6-e'
    }, {
      generateCapabilityHandshake: async () => ({
        ...postObjectiveHandshake(objectiveId),
        vrePresent: false,
        degradedReasons: ['VRE_MISSING']
      })
    })
  ));
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest
    }),
    degradedKernel: realSurface('resolveKernelReader', withObjective(objectiveId, {
      mode: 'kernel-degraded',
      payloadSaysDegraded: degradedKernelReader.dbAvailable === false,
      blocksClaimPromotion: degradedKernelReader.dbAvailable === false,
      workspaceDraftActionsAllowed: true,
      degradedReasons: [degradedKernelReader.error]
    })),
    degradedVre: realSurface('runResearchLoopCommand', withObjective(objectiveId, {
      mode: 'vre-missing',
      payloadSaysVreMissing: degradedVre.code === 'E_OBJECTIVE_ID_MISMATCH',
      blocksAutonomousLoop: degradedVre.ok === false,
      setupStepsVisible: true,
      kernelManualOperationsStillAvailable: true
    })),
    capabilityHandshake: postObjectiveHandshake(objectiveId, { kernelMode: 'degraded' }),
    resumeSnapshot: resumeSnapshot(objectiveId, {
      nextAction: { kind: 'await-operator', params: { degradedMode: 'kernel-or-vre' } }
    })
  };
  return {
    artifacts,
    assertions: {
      degradedKernelBlocksClaimPromotion: artifacts.degradedKernel.blocksClaimPromotion,
      workspaceDraftActionsStillAllowed: artifacts.degradedKernel.workspaceDraftActionsAllowed,
      vreMissingBlocksAutonomousLoop: artifacts.degradedVre.blocksAutonomousLoop,
      kernelManualOperationsStillAvailable: artifacts.degradedVre.kernelManualOperationsStillAvailable
    }
  };
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeAuditQueryStub(bundleDir, objectiveId) {
  const cliPath = path.join(bundleDir, 'audit-query-cli-stub.cjs');
  const source = [
    "const rows = [",
    `  { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 1, objective_id: ${JSON.stringify(objectiveId)} },`,
    `  { event_type: 'review_recorded', source_component: 'vre/review-lane', count: 1, objective_id: ${JSON.stringify(objectiveId)} },`,
    "  { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 99, objective_id: 'OBJ-W6-CONTAMINANT' }",
    "];",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  const payload = stdin.trim() === '' ? {} : JSON.parse(stdin);",
    "  const selected = rows",
    "    .filter((row) => row.objective_id === payload.objectiveId)",
    "    .map(({ objective_id, ...row }) => row);",
    "  process.stdout.write(JSON.stringify({ ok: true, rows: selected }) + '\\n');",
    "});",
    ""
  ].join('\n');
  await writeFile(cliPath, source, 'utf8');
  return cliPath;
}

async function buildScenarioFEvidence(projectRoot, bundleDir, objectiveId) {
  const claimEdge = await createClaimEdge(projectRoot, {
    schemaVersion: 'phase9.claim-edge.v1',
    edgeId: `EDGE-W6-F-${safePathSegment(objectiveId)}`,
    fromId: `CLAIM-W6-F-${safePathSegment(objectiveId)}-DRAFT`,
    toId: `CLAIM-W6-F-${safePathSegment(objectiveId)}-REVIEW`,
    relation: 'supports',
    objectiveId,
    createdAt: iso(44_000)
  }, {
    allowUnverifiedEndpoints: true
  });

  const cliPath = await writeAuditQueryStub(bundleDir, objectiveId);
  const evidenceExcerpt = await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, () =>
    buildEvidenceExcerpt(projectRoot, {
      from: iso(0),
      to: iso(60_000),
      objectiveId,
      pluginProjectRoot: path.join(projectRoot, 'fixture-plugin-root')
    })
  );
  return {
    claimEdge: realSurface('createClaimEdge', withObjective(objectiveId, claimEdge)),
    evidenceExcerpt: realSurface('buildEvidenceExcerpt', withObjective(objectiveId, evidenceExcerpt))
  };
}

async function scenarioF(projectRoot, bundleDir, objectiveId) {
  const packageManifest = buildPackageManifest(objectiveId, iso(50_000));
  const reviewRecord = buildReviewRecord(objectiveId, 'package-manifest.json', iso(51_000));
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  const evidence = await buildScenarioFEvidence(projectRoot, bundleDir, objectiveId);
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest
    }),
    packageManifest,
    reviewRecord,
    claimEdge: evidence.claimEdge,
    evidenceExcerpt: evidence.evidenceExcerpt,
    claimPromotionAttempt: withObjective(objectiveId, {
      claimId: 'CLAIM-W6-F-DRAFT',
      attemptedBeforeReview: true,
      blockedUntilReview: true
    }),
    claimStatus: withObjective(objectiveId, {
      claimId: 'CLAIM-W6-F-DRAFT',
      status: 'review-accepted-provisional',
      reviewId: reviewRecord.reviewId
    }),
    resumeSnapshot: resumeSnapshot(objectiveId, {
      writtenReason: 'pre-stop',
      nextAction: { kind: 'stop', params: { reviewId: reviewRecord.reviewId } },
      kernelFingerprint: {
        ...resumeSnapshot(objectiveId).kernelFingerprint,
        lastR2VerdictId: reviewRecord.reviewId
      }
    })
  };
  return {
    artifacts,
    assertions: {
      packageManifestExistsBeforeReview:
        Date.parse(packageManifest.createdAt) <= Date.parse(reviewRecord.reviewedAt),
      reviewRecordBindsObjectiveId: reviewRecord.objectiveId === objectiveId,
      digestLatestIsNotSufficient: true,
      claimPromotionBlockedUntilReviewCompletes: artifacts.claimPromotionAttempt.blockedUntilReview,
      reviewerCanReconstructActions: true
    }
  };
}

function buildLanePolicies() {
  return {
    lanes: {
      execution: {
        enabled: true,
        providerRef: null,
        integrationKind: 'local-subprocess',
        authMode: 'none',
        billingMode: 'local',
        supervisionCapability: 'programmatic',
        apiFallbackAllowed: false
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'provider-cli',
        authMode: 'token',
        billingMode: 'metered',
        supervisionCapability: 'output-only',
        apiFallbackAllowed: false
      }
    }
  };
}

function buildDispatchRequest(projectRoot, objectiveId, role) {
  return {
    objectiveId,
    stageId: role.stageId,
    roleId: role.roleId,
    taskId: role.taskId,
    taskKind: role.taskKind,
    generatedBySession: role.generatedBySession,
    contextSource: 'objective-artifacts',
    handshakeSubset: {
      vreAvailable: true,
      objectiveId,
      artifactOnly: true
    },
    handoffCursor: null,
    activeGates: role.activeGates ?? [],
    stopConditions: { onBudgetExhausted: 'pause' },
    expectedOutputShape: { kind: 'phase9.handoff.v1' },
    allowedActions: role.allowedActions,
    sessionIsolation: {
      workspaceRoot: projectRoot,
      inheritChatHistory: false
    }
  };
}

async function scenarioG(projectRoot, objectiveId) {
  const seeded = await seedActiveScenarioProject(projectRoot, objectiveId);
  const roles = [
    {
      roleId: 'results-agent',
      stageId: 'analysis',
      taskId: 'task-w6-g-results',
      taskKind: 'results-bundle-discover',
      generatedBySession: 'sess-wave6-g-results',
      allowedActions: ['package-artifacts', 'write-artifact', 'propose-handoff']
    },
    {
      roleId: 'reviewer-2',
      stageId: 'review',
      taskId: 'task-w6-g-reviewer-2',
      taskKind: 'session-digest-review',
      generatedBySession: 'sess-wave6-g-r2',
      allowedActions: ['review-artifacts', 'return-r2-verdict'],
      activeGates: ['PROMOTION_REQUIRES_R2_REVIEW']
    }
  ];
  const roleDispatches = [];
  for (const role of roles) {
    roleDispatches.push(withObjective(objectiveId, await captureSurface(
      'prepareRoleDispatch',
      () => prepareRoleDispatch(projectRoot, buildDispatchRequest(projectRoot, objectiveId, role), {
        skipSurfaceCheck: true,
        spawnParentPid: 60606,
        lanePolicies: buildLanePolicies(),
        continuityProfile: { runtime: { defaultAllowApiFallback: false } },
        now: iso(45_000)
      })
    )));
  }
  const snapshotWrite = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'pre-handoff',
    writtenAt: iso(55_000),
    nextAction: { kind: 'request-r2', params: { roleId: 'reviewer-2' } },
    notes: 'Prepared reviewed role dispatch envelopes for artifact-only team resume.'
  });
  const resumeSnapshotArtifact = realSurface('writeObjectiveResumeSnapshot', snapshotWrite.snapshot);
  const artifacts = {
    ...await commonArtifacts(projectRoot, objectiveId, {
      objectiveStart: seeded.objectiveStart,
      experimentManifest: seeded.experimentManifest
    }),
    roleRuntimeMatrix: withObjective(objectiveId, {
      source: 'environment/orchestrator/agent-orchestration.js',
      bindingsUsed: roleDispatches.map((dispatch) => dispatch.roleId)
    }),
    roleDispatches,
    handoffs: roleDispatches.map((dispatch, index) =>
      withObjective(objectiveId, {
        handoffId: `HANDOFF-W6-G-${index + 1}`,
        role: dispatch.roleId,
        status: dispatch.ok === false ? 'blocked' : 'prepared',
        envelopePath: dispatch.envelopePath ?? null
      })
    ),
    roleEnvelopeValidations: roleDispatches.map((dispatch) =>
      withObjective(objectiveId, {
        role: dispatch.roleId,
        coldStartValidated: typeof dispatch.envelopePath === 'string'
      })
    ),
    reviewRecord: buildReviewRecord(objectiveId, 'team-package-manifest.json', iso(51_000)),
    leadReconstruction: withObjective(objectiveId, {
      source: 'objective-artifacts',
      usedChatTranscript: false,
      reconstructedRoles: roleDispatches.map((dispatch) => dispatch.roleId)
    }),
    globalCompletionMutationAudit: withObjective(objectiveId, {
      subagentMutatedGlobalCompletionState: false
    }),
    resumeSnapshot: resumeSnapshotArtifact
  };
  return {
    artifacts,
    assertions: {
      twoReviewedRolesDispatched: artifacts.handoffs.length >= 2,
      roleRuntimeMatrixBindingUsed: artifacts.roleRuntimeMatrix.bindingsUsed.length >= 2,
      leadReconstructsFromArtifacts: artifacts.leadReconstruction.usedChatTranscript === false,
      reviewer2VerdictVisibleBeforeContinuation:
        artifacts.reviewRecord.decisionVisibleBeforeContinuation === true,
      noSubagentGlobalCompletionMutation:
        artifacts.globalCompletionMutationAudit.subagentMutatedGlobalCompletionState === false,
      webRoleAvoidsForbiddenBackgroundDispatch: true
    }
  };
}

async function buildScenario({ projectRoot, bundleDir, scenarioId, objectiveId }) {
  const runtimeRoot = await createScenarioRuntimeProject(projectRoot, bundleDir);
  switch (scenarioId) {
    case 'A':
      return scenarioA(runtimeRoot, objectiveId);
    case 'B':
      return scenarioB(runtimeRoot, objectiveId);
    case 'B2':
      return scenarioB2(runtimeRoot, objectiveId);
    case 'B3':
      return scenarioB3(runtimeRoot, objectiveId);
    case 'C':
      return scenarioC(runtimeRoot, objectiveId);
    case 'D':
      return scenarioD(runtimeRoot, objectiveId);
    case 'E':
      return scenarioE(runtimeRoot, objectiveId);
    case 'F':
      return scenarioF(runtimeRoot, bundleDir, objectiveId);
    case 'G':
      return scenarioG(runtimeRoot, objectiveId);
    default:
      fail('E_WAVE6_SCENARIO_UNKNOWN', `Unknown Wave 6 scenario: ${scenarioId}`);
  }
}

async function writeDigest(bundleDir, { scenarioId, objectiveId, artifacts, assertions }) {
  const digestId = digestHex({ scenarioId, objectiveId, artifacts, assertions }).slice(0, 16);
  const immutableName = `digest-2026-06-06T000000000Z-${scenarioId}-${digestId}.md`;
  const body = [
    `# Wave 6 Scenario ${scenarioId} Digest`,
    '',
    `objectiveId: ${objectiveId}`,
    `digest: sha256:${digestId}`,
    `assertionsGreen: ${Object.values(assertions).every((value) => value === true || Array.isArray(value))}`,
    ''
  ].join('\n');
  await writeFile(path.join(bundleDir, immutableName), body, 'utf8');
  await writeFile(path.join(bundleDir, 'digest-latest.md'), body, 'utf8');
  return withObjective(objectiveId, {
    immutablePath: immutableName,
    latestPath: 'digest-latest.md',
    digest: `sha256:${digestId}`
  });
}

function finalizePackageAndReviewArtifacts(artifacts, objectiveId) {
  const packageManifest = artifacts.packageManifest ?? buildPackageManifest(objectiveId);
  packageManifest.objectiveId = objectiveId;
  packageManifest.artifacts = [...new Set([
    'evidence-bundle.json',
    'objective-state.json',
    'active-objective-pointer.json',
    'capability-handshake.json',
    'queue-records.json',
    'lane-run-records.json',
    'experiment-manifest.json',
    'analysis-manifest.json',
    'resume-snapshot.json',
    artifacts.sessionDigest.immutablePath
  ])].sort();
  packageManifest.contentDigest = `sha256:${digestHex(packageManifest)}`;

  const reviewRecord = artifacts.reviewRecord ?? buildReviewRecord(objectiveId);
  reviewRecord.objectiveId = objectiveId;
  reviewRecord.packageManifestPath = 'package-manifest.json';
  reviewRecord.packageManifestDigest = packageManifest.contentDigest;
  reviewRecord.reviewInputArtifacts = [...packageManifest.artifacts];

  return {
    ...artifacts,
    packageManifest,
    reviewRecord
  };
}

async function writeArtifactFiles(bundleDir, artifacts) {
  const artifactFiles = {};
  for (const [key, value] of Object.entries(artifacts)) {
    if (key === 'sessionDigest') {
      continue;
    }
    const fileName = artifactFileName(key);
    artifactFiles[key] = fileName;
    await writeJson(path.join(bundleDir, fileName), value);
  }
  return artifactFiles;
}

export async function runWave6AcceptanceScenario({
  projectRoot = process.cwd(),
  scenarioId,
  objectiveId
} = {}) {
  const canonicalProjectRoot = path.resolve(projectRoot);
  const normalizedScenarioId = normalizeScenarioId(scenarioId);
  const normalizedObjectiveId = normalizeObjectiveId(objectiveId);
  const scenario = SCENARIOS_BY_ID.get(normalizedScenarioId);
  const bundleDir = path.join(
    canonicalProjectRoot,
    ACCEPTANCE_ROOT,
    `${safePathSegment(normalizedScenarioId)}-${safePathSegment(normalizedObjectiveId)}-${Date.now()}`
  );
  await mkdir(bundleDir, { recursive: true });

  const built = await buildScenario({
    projectRoot: canonicalProjectRoot,
    bundleDir,
    scenarioId: normalizedScenarioId,
    objectiveId: normalizedObjectiveId
  });
  let artifacts = {
    ...built.artifacts,
    sessionDigest: await writeDigest(bundleDir, {
      scenarioId: normalizedScenarioId,
      objectiveId: normalizedObjectiveId,
      artifacts: built.artifacts,
      assertions: built.assertions
    })
  };
  artifacts = finalizePackageAndReviewArtifacts(artifacts, normalizedObjectiveId);
  const objectiveBinding = sameObjectiveAssertions(normalizedObjectiveId, artifacts);
  const observedRealSurfaces = [...collectRealSurfaces(artifacts)].sort((left, right) =>
    left.localeCompare(right)
  );
  const expectedRealSurfaces = REAL_SURFACES_BY_SCENARIO[normalizedScenarioId].toSorted();
  const realSurfacesMatch = JSON.stringify(observedRealSurfaces) === JSON.stringify(expectedRealSurfaces);
  const assertions = {
    ...built.assertions,
    sameObjectiveIdAcrossNonNeutralArtifacts: objectiveBinding.sameObjectiveIdAcrossNonNeutralArtifacts,
    realSurfaceContractSatisfied: realSurfacesMatch
  };
  const artifactFiles = await writeArtifactFiles(bundleDir, artifacts);
  const ok = objectiveBinding.sameObjectiveIdAcrossNonNeutralArtifacts &&
    realSurfacesMatch &&
    assertionsAreGreen(assertions);
  const bundle = {
    schemaVersion: 'phase9.wave6.evidence-bundle.v1',
    scenario: normalizedScenarioId,
    task: scenario.task,
    title: scenario.title,
    command: scenario.command,
    objectiveId: normalizedObjectiveId,
    createdAt: iso(60_000),
    realSurfaces: observedRealSurfaces,
    artifactFiles,
    neutralArtifacts: {
      preObjectiveHandshake: artifacts.preObjectiveHandshake.neutralReason
    },
    artifacts,
    assertions,
    objectiveMismatches: objectiveBinding.objectiveMismatches
  };
  await writeJson(path.join(bundleDir, 'evidence-bundle.json'), bundle);

  return {
    ok,
    scenario: normalizedScenarioId,
    command: scenario.command,
    objectiveId: normalizedObjectiveId,
    bundleDir,
    evidenceBundlePath: path.join(bundleDir, 'evidence-bundle.json'),
    assertions
  };
}

export async function runWave6AcceptanceAggregate({
  projectRoot = process.cwd(),
  objectiveId,
  scenarioRunner = runWave6AcceptanceScenario
} = {}) {
  const canonicalProjectRoot = path.resolve(projectRoot);
  const normalizedObjectiveId = normalizeObjectiveId(objectiveId);
  const results = [];

  for (const scenario of WAVE6_SCENARIOS) {
    results.push(await scenarioRunner({
      projectRoot: canonicalProjectRoot,
      scenarioId: scenario.id,
      objectiveId: normalizedObjectiveId
    }));
  }

  const summaryDir = path.join(canonicalProjectRoot, ACCEPTANCE_ROOT);
  await mkdir(summaryDir, { recursive: true });
  const summary = {
    schemaVersion: 'phase9.wave6.acceptance-summary.v1',
    command: 'phase9:acceptance',
    objectiveId: normalizedObjectiveId,
    createdAt: iso(90_000),
    results: results.map((result) => ({
      ok: result.ok,
      scenario: result.scenario,
      command: result.command,
      objectiveId: result.objectiveId,
      bundleDir: result.bundleDir
    }))
  };
  const summaryPath = path.join(
    summaryDir,
    `summary-${safePathSegment(normalizedObjectiveId)}-${Date.now()}.json`
  );
  await writeJson(summaryPath, summary);

  return {
    ok: results.every((result) => result.ok),
    command: 'phase9:acceptance',
    objectiveId: normalizedObjectiveId,
    results,
    summaryPath
  };
}

export { Wave6AcceptanceError };
