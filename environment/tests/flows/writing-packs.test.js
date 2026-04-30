import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { buildAdvisorPack, buildRebuttalPack } from '../../flows/writing-packs.js';
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
  assert.equal(event.source_component, 'vre/flows/writing-packs');
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
    experimentId: 'EXP-201',
    title: 'Advisor pack experiment',
    objective: 'Collect Phase 3 pack evidence',
    status: 'planned',
    createdAt: '2026-04-02T17:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 17,
    },
    codeRef: {
      entrypoint: 'scripts/run_pack.py',
      gitCommit: 'pack1234',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/pack.png'],
    relatedClaims: ['C-201'],
    blockers: [],
    notes: '',
    ...overrides,
  };
}

test('buildAdvisorPack assembles derived status files and figure copies', async () => {
  const projectRoot = await createFixtureProject('vre-advisor-pack-');

  try {
    await publishSessionSnapshot(projectRoot, {
      schemaVersion: 'vibe-env.session.v1',
      activeFlow: 'writing',
      currentStage: 'writing-handoff',
      nextActions: ['review frozen snapshot'],
      blockers: [],
      kernel: { dbAvailable: true, degradedReason: null },
      capabilities: {
        claimHeads: true,
        citationChecks: true,
        governanceProfileAtCreation: true,
        claimSearch: false,
      },
      budget: {
        state: 'ok',
        toolCalls: 0,
        estimatedCostUsd: 0,
        countingMode: 'unknown',
      },
      signals: {
        staleMemory: false,
        unresolvedClaims: 0,
        blockedExperiments: 0,
        exportAlerts: 0,
      },
      lastCommand: '/flow-writing',
      lastAttemptId: 'ATT-2026-04-02-201',
      updatedAt: '2026-04-02T17:10:00Z',
    });

    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-201', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-201',
    });
    await updateExperiment(projectRoot, 'EXP-201', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'pack.png'), 'png-data', 'utf8');

    const reader = createReader({
      heads: [{
        claimId: 'C-201',
        currentStatus: 'PROMOTED',
        confidence: 0.93,
        narrative: 'The main packaged experiment supports the advisor-facing result.',
        governanceProfileAtCreation: 'strict',
      }],
      citations: [{
        claimId: 'C-201',
        citationId: 'CIT-201',
        verificationStatus: 'VERIFIED',
      }],
    });

    await packageExperimentResults(projectRoot, 'EXP-201', {
      now: '2026-04-02T17:20:00Z',
      artifactMetadata: {
        'plots/pack.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support the advisor pack figure copy.',
          caption: 'Advisor pack figure for EXP-201.',
          interpretation: 'Signal remains stable enough for discussion with the advisor.',
        },
      },
      reader,
    });

    await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T17:25:00Z',
      snapshotId: 'WEXP-2026-04-02-201',
      reader,
    });

    const pack = await buildAdvisorPack(projectRoot, {
      date: '2026-04-03',
      now: '2026-04-02T17:30:00Z',
    });

    const statusSummary = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'advisor-packs',
        '2026-04-03',
        'status-summary.md',
      ),
      'utf8',
    );

    assert.equal(pack.packType, 'advisor');
    assert.equal(pack.index.currentStage, 'advisor-pack');
    assert.equal(pack.copiedFigures.length, 1);
    assert.match(statusSummary, /Recent writing snapshots: 1/u);
    assert.match(statusSummary, /WEXP-2026-04-02-201/u);
    await assert.doesNotReject(() => readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'advisor-packs',
        '2026-04-03',
        'figures',
        'EXP-201',
        'figures',
        'plots',
        'pack.png',
      ),
    ));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildRebuttalPack assembles imported comments and live claim status honestly', async () => {
  const projectRoot = await createFixtureProject('vre-rebuttal-pack-');

  try {
    const reader = createReader({
      heads: [{
        claimId: 'C-202',
        currentStatus: 'DISPUTED',
        confidence: 0.42,
        governanceProfileAtCreation: 'strict',
      }],
      citations: [{
        claimId: 'C-202',
        citationId: 'CIT-202',
        verificationStatus: 'VERIFIED',
      }],
    });

    await registerExperiment(projectRoot, buildExperiment({
      experimentId: 'EXP-202',
      relatedClaims: ['C-202'],
      outputArtifacts: [],
    }));
    await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T18:00:00Z',
      snapshotId: 'WEXP-2026-04-02-202',
      reader: createReader({
        heads: [{
          claimId: 'C-202',
          currentStatus: 'PROMOTED',
          confidence: 0.88,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-202',
          citationId: 'CIT-202',
          verificationStatus: 'VERIFIED',
        }],
      }),
    });
    await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T18:05:00Z',
      snapshotId: 'WEXP-2026-04-02-203',
      reader: createReader({
        heads: [{
          claimId: 'C-202',
          currentStatus: 'PROMOTED',
          confidence: 0.90,
          governanceProfileAtCreation: 'strict',
        }],
        citations: [{
          claimId: 'C-202',
          citationId: 'CIT-202',
          verificationStatus: 'VERIFIED',
        }],
      }),
    });

    const pack = await buildRebuttalPack(projectRoot, 'submission-202', {
      now: '2026-04-02T18:10:00Z',
      claimIds: ['C-202'],
      reviewerComments: [
        'Reviewer 1: clarify whether the claim still holds under the disputed control condition.',
      ],
      reader,
    });

    const claimStatus = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'rebuttal',
        'submission-202',
        'claim-status.md',
      ),
      'utf8',
    );
    const responseDraft = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'rebuttal',
        'submission-202',
        'response-draft.md',
      ),
      'utf8',
    );

    assert.equal(pack.packType, 'rebuttal');
    assert.equal(pack.index.currentStage, 'rebuttal-pack');
    assert.deepEqual(pack.claimIds, ['C-202']);
    assert.match(claimStatus, /Current status: DISPUTED/u);
    assert.match(claimStatus, /Latest export snapshot: WEXP-2026-04-02-203/u);
    assert.match(responseDraft, /does not fabricate resolved answers/u);
    assert.match(responseDraft, /Reviewer concern: \[summarize/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildRebuttalPack emits kernel truth mismatch while preserving silent pack fallback', async () => {
  const projectRoot = await createFixtureProject('vre-rebuttal-pack-truth-mismatch-');
  const capturePath = path.join(projectRoot, 'writing-pack-governance.jsonl');
  const sentinel = 'SECRET-seq127-flow-mismatch C:/private/path';

  try {
    const pack = await withGovernanceCapture(capturePath, () => buildRebuttalPack(projectRoot, 'submission-127', {
      now: '2026-04-02T18:20:00Z',
      claimIds: ['C-127'],
      reviewerComments: ['Reviewer: verify the kernel-backed claim status.'],
      reader: createReader({
        throwOn: {
          listClaimHeads: () => new KernelBridgeContractMismatchError(
            `writing pack mismatch ${sentinel}`,
            { projection: 'listClaimHeads' },
          ),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 1);
    assertKernelTruthMismatchEvent(events[0], 'listClaimHeads');
    assertNoDetailsLeak(events[0], [sentinel, 'SECRET-seq127-flow-mismatch', 'C:/private/path']);
    assert.equal(pack.packType, 'rebuttal');
    assert.deepEqual(pack.claimIds, ['C-127']);
    assert.equal(pack.warnings.join('\n').includes('SECRET-seq127'), false);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildRebuttalPack preserves silent pack fallback when kernel truth telemetry fails', async () => {
  const projectRoot = await createFixtureProject('vre-rebuttal-pack-truth-fail-soft-');
  const capturePath = path.join(projectRoot, 'writing-pack-missing-bridge.jsonl');
  const missingCli = path.join(projectRoot, 'missing-governance-cli.js');

  try {
    const { result: pack, stderr } = await captureStderr(() => withGovernanceCapture(
      capturePath,
      () => buildRebuttalPack(projectRoot, 'submission-128', {
        now: '2026-04-02T18:25:00Z',
        claimIds: ['C-128'],
        reviewerComments: ['Reviewer: check the citation status.'],
        reader: createReader({
          throwOn: {
            listCitationChecks: () => new KernelBridgeContractMismatchError(
              'writing pack citation mismatch',
              { projection: 'listCitationChecks' },
            ),
          },
        }),
      }),
      { pluginCliPath: missingCli },
    ));

    assert.match(stderr, /kernel_vre_truth_mismatch telemetry failed/u);
    assert.equal(pack.packType, 'rebuttal');
    assert.deepEqual(pack.claimIds, ['C-128']);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('buildRebuttalPack preserves ordinary pack reader errors without governance emission', async () => {
  const projectRoot = await createFixtureProject('vre-rebuttal-pack-ordinary-error-');
  const capturePath = path.join(projectRoot, 'writing-pack-ordinary-error.jsonl');

  try {
    const pack = await withGovernanceCapture(capturePath, () => buildRebuttalPack(projectRoot, 'submission-129', {
      now: '2026-04-02T18:30:00Z',
      claimIds: ['C-129'],
      reviewerComments: ['Reviewer: keep fallback behavior silent.'],
      reader: createReader({
        throwOn: {
          listClaimHeads: () => new Error('ordinary pack reader failure'),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 0);
    assert.equal(pack.packType, 'rebuttal');
    assert.deepEqual(pack.claimIds, ['C-129']);
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
