import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { publishSessionSnapshot } from '../../control/session-snapshot.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { buildAdvisorPack, buildRebuttalPack } from '../../flows/writing-packs.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

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

function createReader({
  heads = [],
  unresolvedClaims = [],
  citations = [],
} = {}) {
  return {
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
