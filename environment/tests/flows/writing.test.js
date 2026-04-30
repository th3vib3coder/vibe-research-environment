import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { KernelBridgeContractMismatchError } from '../../lib/kernel-bridge.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

const GOVERNANCE_CAPTURE_STUB = path.join(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'governance-log-capture-stub.js',
);

async function readGovernanceEvents(capturePath) {
  try {
    const raw = await readFile(capturePath, 'utf8');
    return raw
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function withGovernanceCapture(capturePath, fn, overrides = {}) {
  const previousCapturePath = process.env.VRE_GOVERNANCE_CAPTURE_PATH;
  const previousPluginCli = process.env.VIBE_SCIENCE_PLUGIN_CLI;
  process.env.VRE_GOVERNANCE_CAPTURE_PATH = capturePath;
  process.env.VIBE_SCIENCE_PLUGIN_CLI = overrides.pluginCliPath ?? GOVERNANCE_CAPTURE_STUB;
  try {
    return await fn();
  } finally {
    if (previousCapturePath == null) {
      delete process.env.VRE_GOVERNANCE_CAPTURE_PATH;
    } else {
      process.env.VRE_GOVERNANCE_CAPTURE_PATH = previousCapturePath;
    }
    if (previousPluginCli == null) {
      delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
    } else {
      process.env.VIBE_SCIENCE_PLUGIN_CLI = previousPluginCli;
    }
  }
}

async function captureStderr(fn) {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  try {
    return {
      result: await fn(),
      stderr,
    };
  } finally {
    process.stderr.write = originalWrite;
  }
}

function assertKernelTruthMismatchEvent(event, projectionName) {
  assert.equal(event.event_type, 'kernel_vre_truth_mismatch');
  assert.equal(event.source_component, 'vre/flows/writing');
  assert.equal(event.objective_id, null);
  assert.equal(event.severity, 'critical');
  assert.deepEqual(event.details, {
    projectionName,
    errorClass: 'KernelBridgeContractMismatchError',
  });
}

function assertNoDetailsLeak(event, forbiddenValues) {
  const serialized = JSON.stringify(event.details);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `governance details leaked ${value}`);
  }
}

function buildExperiment(overrides = {}) {
  return {
    experimentId: 'EXP-101',
    title: 'Writing handoff experiment',
    objective: 'Ground writing in registered experiment outputs',
    status: 'planned',
    createdAt: '2026-04-02T15:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 11,
    },
    codeRef: {
      entrypoint: 'scripts/run_writing.py',
      gitCommit: 'abc1234',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/summary.png'],
    relatedClaims: ['C-101'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}

test('buildWritingHandoff writes a snapshot-first seed, export record, and writing index', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-101', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-101',
    });
    await updateExperiment(projectRoot, 'EXP-101', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'summary.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-101', {
      now: '2026-04-02T15:10:00Z',
      datasetHash: 'sha256:writing-101',
      artifactMetadata: {
        'plots/summary.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support the claim-backed writing seed.',
          caption: 'Summary plot for EXP-101.',
          interpretation: 'The effect remains stable across the packaged comparison.',
        },
      },
      reader: createReader({
        heads: [{
          claimId: 'C-101',
          currentStatus: 'PROMOTED',
          confidence: 0.91,
          narrative: 'The packaged experiment supports the primary effect.',
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-101',
          citationId: 'CIT-101',
          verificationStatus: 'VERIFIED',
        }],
      }),
    });

    const handoff = await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T15:20:00Z',
      snapshotId: 'WEXP-2026-04-02-101',
      reader: createReader({
        heads: [{
          claimId: 'C-101',
          currentStatus: 'PROMOTED',
          confidence: 0.91,
          narrative: 'The packaged experiment supports the primary effect.',
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-101',
          citationId: 'CIT-101',
          verificationStatus: 'VERIFIED',
        }],
      }),
    });

    const snapshot = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'writing',
          'exports',
          'snapshots',
          'WEXP-2026-04-02-101.json',
        ),
        'utf8',
      ),
    );
    const seedContents = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'exports',
        'seeds',
        'WEXP-2026-04-02-101',
        'C-101.md',
      ),
      'utf8',
    );
    const exportLog = (await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'exports',
        'export-log.jsonl',
      ),
      'utf8',
    )).trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(snapshot.snapshotId, 'WEXP-2026-04-02-101');
    assert.equal(snapshot.claims[0].eligible, true);
    assert.equal(handoff.seeds.length, 1);
    assert.equal(handoff.index.activeFlow, 'writing');
    assert.equal(handoff.index.currentStage, 'writing-handoff');
    assert.match(seedContents, /Snapshot ID: WEXP-2026-04-02-101/u);
    assert.match(seedContents, /Claim ID: C-101/u);
    assert.match(seedContents, /The packaged experiment supports the primary effect/u);
    assert.match(seedContents, /result bundle: \.vibe-science-environment\/results\/experiments\/EXP-101/u);
    assert.equal(exportLog.length, 1);
    assert.equal(exportLog[0].claimId, 'C-101');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff keeps blocked claims out of claim-backed seeds', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-blocked-');

  try {
    const handoff = await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T15:30:00Z',
      snapshotId: 'WEXP-2026-04-02-102',
      reader: createReader({
        heads: [{
          claimId: 'C-102',
          currentStatus: 'PROMOTED',
          confidence: 0.61,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-102',
          citationId: 'CIT-102',
          verificationStatus: 'PENDING',
        }],
      }),
    });

    await assert.rejects(
      () => readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'writing',
          'exports',
          'seeds',
          'WEXP-2026-04-02-102',
          'C-102.md',
        ),
        'utf8',
      ),
      /ENOENT/u,
    );
    assert.equal(handoff.seeds.length, 0);
    assert.equal(handoff.blockedClaims.length, 1);
    assert.match(handoff.index.blockers.join('\n'), /unverified_citations/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff degrades honestly when the kernel reader is unavailable', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-degraded-');

  try {
    const handoff = await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T15:35:00Z',
      snapshotId: 'WEXP-2026-04-02-103',
    });

    const snapshot = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'writing',
          'exports',
          'snapshots',
          'WEXP-2026-04-02-103.json',
        ),
        'utf8',
      ),
    );

    assert.equal(snapshot.claims.length, 0);
    assert.equal(snapshot.capabilities.governanceProfileAtCreationAvailable, false);
    assert.equal(handoff.seeds.length, 0);
    assert.match(handoff.warnings.join('\n'), /Kernel reader unavailable/u);
    assert.match(handoff.index.blockers.join('\n'), /Kernel reader unavailable/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff replays post-export alerts once per observed drift state', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-replay-');

  try {
    await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T15:40:00Z',
      snapshotId: 'WEXP-2026-04-02-104A',
      reader: createReader({
        heads: [{
          claimId: 'C-104',
          currentStatus: 'PROMOTED',
          confidence: 0.91,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-104',
          citationId: 'CIT-104',
          verificationStatus: 'VERIFIED',
          retractionStatus: 'CLEAR',
        }],
      }),
    });

    const secondRun = await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T16:00:00Z',
      snapshotId: 'WEXP-2026-04-02-104B',
      reader: createReader({
        heads: [{
          claimId: 'C-104',
          currentStatus: 'KILLED',
          confidence: 0.50,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-104',
          citationId: 'CIT-104',
          verificationStatus: 'RETRACTED',
          retractionStatus: 'RETRACTED',
        }],
      }),
    });

    const alertsAfterSecondRun = (await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'exports',
        'export-alerts.jsonl',
      ),
      'utf8',
    )).trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(secondRun.alerts.length, 3);
    assert.equal(alertsAfterSecondRun.length, 3);
    assert.match(secondRun.alerts.map((entry) => entry.kind).join(','), /claim_killed/u);
    assert.match(secondRun.alerts.map((entry) => entry.kind).join(','), /citation_invalidated/u);
    assert.match(secondRun.alerts.map((entry) => entry.kind).join(','), /confidence_changed/u);

    const thirdRun = await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T16:05:00Z',
      snapshotId: 'WEXP-2026-04-02-104C',
      reader: createReader({
        heads: [{
          claimId: 'C-104',
          currentStatus: 'KILLED',
          confidence: 0.50,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-104',
          citationId: 'CIT-104',
          verificationStatus: 'RETRACTED',
          retractionStatus: 'RETRACTED',
        }],
      }),
    });

    const alertsAfterThirdRun = (await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'exports',
        'export-alerts.jsonl',
      ),
      'utf8',
    )).trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(thirdRun.alerts.length, 0);
    assert.equal(alertsAfterThirdRun.length, 3);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff emits kernel truth mismatch and sanitizes writing warnings', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-truth-mismatch-');
  const capturePath = path.join(projectRoot, 'writing-governance.jsonl');
  const sentinel = 'SECRET-seq127-flow-mismatch C:/private/path';

  try {
    const handoff = await withGovernanceCapture(capturePath, () => buildWritingHandoff(projectRoot, {
      now: '2026-04-02T16:10:00Z',
      snapshotId: 'WEXP-2026-04-02-127',
      reader: createReader({
        throwOn: {
          listClaimHeads: () => new KernelBridgeContractMismatchError(
            `writing mismatch ${sentinel}`,
            { projection: 'listClaimHeads' },
          ),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 1);
    assertKernelTruthMismatchEvent(events[0], 'listClaimHeads');
    assertNoDetailsLeak(events[0], [sentinel, 'SECRET-seq127-flow-mismatch', 'C:/private/path']);
    assert.match(handoff.warnings.join('\n'), /Unable to read claim heads: kernel truth mismatch/u);
    assert.equal(handoff.warnings.join('\n').includes('SECRET-seq127'), false);
    assert.equal(handoff.seeds.length, 0);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff preserves writing fallback when kernel truth telemetry fails', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-truth-fail-soft-');
  const capturePath = path.join(projectRoot, 'writing-missing-bridge.jsonl');
  const missingCli = path.join(projectRoot, 'missing-governance-cli.js');

  try {
    const { result: handoff, stderr } = await captureStderr(() => withGovernanceCapture(
      capturePath,
      () => buildWritingHandoff(projectRoot, {
        now: '2026-04-02T16:11:00Z',
        snapshotId: 'WEXP-2026-04-02-128',
        reader: createReader({
          throwOn: {
            listUnresolvedClaims: () => new KernelBridgeContractMismatchError(
              'writing unresolved mismatch',
              { projection: 'listUnresolvedClaims' },
            ),
          },
        }),
      }),
      { pluginCliPath: missingCli },
    ));

    assert.match(stderr, /kernel_vre_truth_mismatch telemetry failed/u);
    assert.match(handoff.warnings.join('\n'), /Unable to read unresolved claims: kernel truth mismatch/u);
    assert.equal(handoff.seeds.length, 0);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildWritingHandoff preserves ordinary writing reader error warnings without governance emission', async () => {
  const projectRoot = await createFixtureProject('vre-writing-flow-ordinary-error-');
  const capturePath = path.join(projectRoot, 'writing-ordinary-error.jsonl');

  try {
    const handoff = await withGovernanceCapture(capturePath, () => buildWritingHandoff(projectRoot, {
      now: '2026-04-02T16:12:00Z',
      snapshotId: 'WEXP-2026-04-02-129',
      reader: createReader({
        throwOn: {
          listCitationChecks: () => new Error('ordinary citation reader failure'),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 0);
    assert.match(handoff.warnings.join('\n'), /Unable to read citation checks: ordinary citation reader failure/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

function createReader({
  heads = [],
  unresolvedClaims = [],
  citations = [],
  throwOn = {},
} = {}) {
  return {
    async listClaimHeads() {
      if (throwOn.listClaimHeads != null) {
        throw throwOn.listClaimHeads();
      }
      return heads;
    },
    async listUnresolvedClaims() {
      if (throwOn.listUnresolvedClaims != null) {
        throw throwOn.listUnresolvedClaims();
      }
      return unresolvedClaims;
    },
    async listCitationChecks(options = {}) {
      if (throwOn.listCitationChecks != null) {
        throw throwOn.listCitationChecks();
      }
      if (typeof options.claimId !== 'string') {
        return citations;
      }

      return citations.filter((entry) => entry.claimId === options.claimId);
    },
  };
}
