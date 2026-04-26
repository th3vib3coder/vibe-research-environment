import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { loadValidator } from '../../control/_io.js';
import {
  activateObjective,
  objectiveEventsPath,
  objectiveHandoffsPath,
  readObjectiveHandoffs,
} from '../../objectives/store.js';
import { writeObjectiveBlockerFlag } from '../../objectives/blocker-flag.js';
import {
  appendObjectiveEvent,
  readResumeSnapshot,
  writeObjectiveResumeSnapshot,
} from '../../objectives/resume-snapshot.js';
import { writeObjectiveDigest } from '../../objectives/digest-writer.js';
import { dispatchRoleAssignment } from '../../orchestrator/agent-orchestration.js';
import {
  appendObjectiveQueueRecord,
  objectiveQueuePath,
  readObjectiveQueueRecords,
} from '../../orchestrator/queue-adapter.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturePath = path.join(
  repoRoot,
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'team-resume-acceptance',
  'valid-pre-spawn-artifact-only.json',
);
const freshProcessHelperPath = path.join(
  repoRoot,
  'environment',
  'tests',
  '_helpers',
  'team-resume-fresh-process.mjs',
);

function repoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

async function readAcceptanceFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

async function readObjectiveFixture(objectiveId) {
  const fixture = JSON.parse(
    await readFile(
      path.join(repoRoot, 'environment', 'tests', 'fixtures', 'phase9', 'objective', 'valid-active.json'),
      'utf8',
    ),
  );
  return {
    ...fixture,
    objectiveId,
    createdAt: '2026-04-26T08:00:00Z',
    lastUpdatedAt: '2026-04-26T08:00:00Z',
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
        apiFallbackAllowed: false,
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'provider-cli',
        authMode: 'token',
        billingMode: 'metered',
        supervisionCapability: 'output-only',
        apiFallbackAllowed: false,
      },
    },
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
      artifactOnly: true,
    },
    handoffCursor: role.handoffCursor ?? null,
    activeGates: role.activeGates ?? [],
    stopConditions: { onBudgetExhausted: 'pause' },
    expectedOutputShape: { kind: 'phase9.handoff.v1' },
    allowedActions: role.allowedActions,
    sessionIsolation: {
      workspaceRoot: projectRoot,
      inheritChatHistory: false,
    },
  };
}

async function runFreshProcessProbe(args, env = {}) {
  return execFileAsync(
    process.execPath,
    [freshProcessHelperPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        Path: process.env.Path,
        PATHEXT: process.env.PATHEXT,
        SystemRoot: process.env.SystemRoot,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        ...env,
      },
      windowsHide: true,
    },
  );
}

test('T4.5.4 pre-spawn team resume acceptance reconstructs reviewed role work from artifacts only', async () => {
  const fixture = await readAcceptanceFixture();
  const projectRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'vre-team-resume-acceptance-')));
  const objectiveId = `${fixture.objectiveIdPrefix}-${Date.now()}`;

  try {
    const objectiveRecord = await readObjectiveFixture(objectiveId);
    const activation = await activateObjective(projectRoot, objectiveRecord, {
      sessionId: fixture.leadSessionId,
      lockAcquiredAt: fixture.startedAt,
    });
    const validateRoleEnvelope = await loadValidator(repoRoot, 'phase9-role-envelope.schema.json');
    const envelopePaths = [];
    const dispatches = [];

    for (const role of fixture.roles) {
      const artifactPath = path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveId,
        role.artifact.relativePath,
      );
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, role.artifact.content, 'utf8');

      const response = await dispatchRoleAssignment(
        projectRoot,
        buildDispatchRequest(projectRoot, objectiveId, role),
        {
          execute: true,
          skipSurfaceCheck: true,
          spawnParentPid: role.spawnParentPid,
          roleEnvelopeValidator: validateRoleEnvelope,
          lanePolicies: buildLanePolicies(),
          continuityProfile: { runtime: { defaultAllowApiFallback: false } },
          now: role.dispatchedAt,
          invokeLaneBinding: async (_binding, _providerExecutors, payload) => ({
            status: role.resultStatus,
            roleEnvelopeObjectiveId: payload.roleEnvelope.objectiveId,
            handoff: {
              handoffId: role.handoffId,
              toAgentRole: 'lead-researcher',
              artifactPaths: [artifactPath],
              summary: role.handoffSummary,
              openBlockers: role.openBlockers ?? [],
              closesHandoffId: role.closesHandoffId ?? null,
            },
          }),
        },
      );

      envelopePaths.push(response.envelopePath);
      dispatches.push(response);
      await appendObjectiveEvent(
        projectRoot,
        objectiveId,
        'handoff',
        {
          handoffId: response.handoff.handoffId,
          roleId: role.roleId,
          taskId: role.taskId,
        },
        role.dispatchedAt,
      );
      await appendObjectiveQueueRecord(projectRoot, objectiveId, {
        objectiveId,
        taskId: role.taskId,
        taskKind: role.taskKind,
        taskAttemptId: role.taskAttemptId,
        status: role.queueStatus,
        createdAt: role.dispatchedAt,
        updatedAt: role.queueUpdatedAt,
        sessionId: role.generatedBySession,
        wakeId: role.wakeId,
        handoffId: response.handoff.handoffId,
        sourceArtifactPaths: role.queueSourceArtifactPaths,
        resultArtifactPaths: [repoRelative(projectRoot, artifactPath)],
        resumeCursor: {
          queueRecordSeq: null,
          roleEnvelopePath: repoRelative(projectRoot, response.envelopePath),
        },
      });
    }

    await writeObjectiveBlockerFlag(projectRoot, objectiveId, {
      code: fixture.unresolvedBlocker.code,
      message: fixture.unresolvedBlocker.message,
      writtenAt: fixture.unresolvedBlocker.openedAt,
    });
    await appendObjectiveEvent(
      projectRoot,
      objectiveId,
      'blocker-open',
      fixture.unresolvedBlocker,
      fixture.unresolvedBlocker.openedAt,
    );

    const snapshotResult = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
      writtenReason: 'manual',
      writtenAt: fixture.resumeAt,
      activePointer: activation.activeObjectivePointer,
      notes: 'T4.5.4 acceptance: lead reconstructs role work from artifacts only.',
    });
    const queueRecords = await readObjectiveQueueRecords(projectRoot, objectiveId);
    const digest = await writeObjectiveDigest(projectRoot, objectiveId, {
      writtenAt: fixture.resumeAt,
      wakeId: fixture.resumeWakeId,
      status: 'resumed',
      queueCursor: queueRecords.at(-1).recordSeq,
      lastTaskId: queueRecords.at(-1).taskId,
      snapshotPath: repoRelative(projectRoot, snapshotResult.snapshotPath),
      eventLogPath: repoRelative(projectRoot, objectiveEventsPath(projectRoot, objectiveId)),
      handoffLedgerPath: repoRelative(projectRoot, objectiveHandoffsPath(projectRoot, objectiveId)),
      queuePath: repoRelative(projectRoot, objectiveQueuePath(projectRoot, objectiveId)),
      handoffId: fixture.unresolvedBlocker.handoffId,
      digestKind: 'team-resume-acceptance',
      notes: 'Artifact-only reconstruction succeeded without lead chat history.',
    });
    const leadTranscriptPath = path.join(projectRoot, 'lead-chat-transcript.md');
    await writeFile(
      leadTranscriptPath,
      '# Lead transcript\nThis file intentionally contains enough prose to be tempting, but acceptance must ignore it.\n',
      'utf8',
    );

    const handoffs = await readObjectiveHandoffs(projectRoot, objectiveId);
    const events = JSON.parse(
      `[${(await readFile(objectiveEventsPath(projectRoot, objectiveId), 'utf8')).trim().split(/\r?\n/u).join(',')}]`,
    );
    const snapshotRead = await readResumeSnapshot(projectRoot, objectiveId);
    const digestText = await readFile(digest.latestPath, 'utf8');

    assert.equal(dispatches.length, 3);
    assert.equal(handoffs.length, 3);
    assert.ok(dispatches.every((entry) => entry.envelope.schemaVersion === 'phase9.role-envelope.v1'));
    assert.ok(handoffs.every((entry) => entry.objectiveId === objectiveId));
    assert.ok(queueRecords.every((entry) => entry.objectiveId === objectiveId));
    assert.ok(events.every((entry) => entry.objectiveId === objectiveId));
    assert.equal(snapshotRead.snapshot.objectiveId, objectiveId);
    assert.match(digestText, new RegExp(`- Objective: ${objectiveId}`, 'u'));
    assert.equal(snapshotRead.snapshot.openHandoffs.includes(fixture.resolvedHandoffId), false);
    assert.equal(snapshotRead.snapshot.openHandoffs.includes(fixture.unresolvedBlocker.handoffId), true);
    assert.equal(snapshotRead.snapshot.openBlockers[0].code, fixture.unresolvedBlocker.code);

    const { stdout } = await runFreshProcessProbe([
      '--schema-root',
      repoRoot,
      '--project-root',
      projectRoot,
      '--objective',
      objectiveId,
      '--envelopes',
      JSON.stringify(envelopePaths),
      '--lead-transcript',
      leadTranscriptPath,
    ]);
    const probe = JSON.parse(stdout);

    assert.equal(probe.resumeRole, 'lead-researcher');
    assert.equal(probe.objectiveId, objectiveId);
    assert.equal(probe.validatedEnvelopeCount, 3);
    assert.deepEqual(probe.roleIds, fixture.roles.map((role) => role.roleId));
    assert.equal(probe.usedLeadChatHistory, false);
    assert.equal(probe.artifactOnlyReconstruction, true);
    assert.deepEqual(probe.openBlockerCodes, [fixture.unresolvedBlocker.code]);
    assert.equal(probe.openHandoffs.includes(fixture.resolvedHandoffId), false);
    assert.equal(probe.openHandoffs.includes(fixture.unresolvedBlocker.handoffId), true);

    await rm(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'results'), {
      recursive: true,
      force: true,
    });
    await assert.rejects(
      runFreshProcessProbe([
        '--schema-root',
        repoRoot,
        '--project-root',
        projectRoot,
        '--objective',
        objectiveId,
        '--envelopes',
        JSON.stringify(envelopePaths),
        '--lead-transcript',
        leadTranscriptPath,
      ]),
      (error) => {
        assert.match(error.stderr, /E_ARTIFACTS_REQUIRED/u);
        return true;
      },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
