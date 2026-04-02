import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { getOperatorStatus } from '../../control/query.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { buildAdvisorPack, buildRebuttalPack } from '../../flows/writing-packs.js';

function buildExperiment() {
  return {
    experimentId: 'EXP-301',
    title: 'Middleware writing pack experiment',
    objective: 'Verify advisor and rebuttal packs through middleware',
    status: 'planned',
    createdAt: '2026-04-02T19:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 23,
    },
    codeRef: {
      entrypoint: 'scripts/run_writing_pack.py',
      gitCommit: 'ghi9012',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/pack.png'],
    relatedClaims: ['C-301'],
    blockers: [],
    notes: '',
  };
}

test('advisor and rebuttal packs can run through middleware and surface in operator status', async () => {
  const projectRoot = await createFixtureProject('vre-int-writing-packs-');

  try {
    const reader = createReader({
      heads: [{
        claimId: 'C-301',
        currentStatus: 'PROMOTED',
        confidence: 0.89,
        governanceProfileAtCreation: 'strict',
      }],
      citations: [{
        claimId: 'C-301',
        citationId: 'CIT-301',
        verificationStatus: 'VERIFIED',
      }],
    });

    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-301', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-02-301',
    });
    await updateExperiment(projectRoot, 'EXP-301', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'pack.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-301', {
      now: '2026-04-02T19:10:00Z',
      artifactMetadata: {
        'plots/pack.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support middleware pack assembly.',
          caption: 'Pack figure for EXP-301.',
          interpretation: 'The packaged result remains available to both pack surfaces.',
        },
      },
      reader,
    });

    await buildWritingHandoff(projectRoot, {
      now: '2026-04-02T19:15:00Z',
      snapshotId: 'WEXP-2026-04-02-301',
      reader,
    });

    const advisor = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-writing',
      scope: 'flow-writing',
      reader: { dbAvailable: true, ...reader },
      commandFn: async () => ({
        summary: 'advisor pack assembled',
        payload: await buildAdvisorPack(projectRoot, {
          date: '2026-04-04',
          now: '2026-04-02T19:20:00Z',
        }),
      }),
    });

    assert.equal(advisor.attempt.status, 'succeeded');
    assert.equal(advisor.snapshot.activeFlow, 'writing');
    assert.equal(advisor.snapshot.currentStage, 'advisor-pack');

    const rebuttal = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-writing',
      scope: 'flow-writing',
      reader: {
        dbAvailable: true,
        ...createReader({
          heads: [{
            claimId: 'C-301',
            currentStatus: 'DISPUTED',
            confidence: 0.51,
            governanceProfileAtCreation: 'strict',
          }],
          citations: [{
            claimId: 'C-301',
            citationId: 'CIT-301',
            verificationStatus: 'VERIFIED',
          }],
        }),
      },
      commandFn: async () => ({
        summary: 'rebuttal pack assembled',
        payload: await buildRebuttalPack(projectRoot, 'submission-301', {
          now: '2026-04-02T19:30:00Z',
          claimIds: ['C-301'],
          reviewerComments: ['Reviewer 1: explain why the status changed after export.'],
          reader: createReader({
            heads: [{
              claimId: 'C-301',
              currentStatus: 'DISPUTED',
              confidence: 0.51,
              governanceProfileAtCreation: 'strict',
            }],
            citations: [{
              claimId: 'C-301',
              citationId: 'CIT-301',
              verificationStatus: 'VERIFIED',
            }],
          }),
        }),
      }),
    });

    assert.equal(rebuttal.attempt.status, 'succeeded');
    assert.equal(rebuttal.snapshot.activeFlow, 'writing');
    assert.equal(rebuttal.snapshot.currentStage, 'rebuttal-pack');

    const status = await getOperatorStatus(projectRoot);
    assert.equal(status.writing.totalAdvisorPacks, 1);
    assert.equal(status.writing.totalRebuttalPacks, 1);
    assert.equal(status.writing.advisorPacks[0].packId, '2026-04-04');
    assert.equal(status.writing.rebuttalPacks[0].packId, 'submission-301');
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
