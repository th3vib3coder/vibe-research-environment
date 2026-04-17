import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('F-02: writing seeds are not deleted or rewritten on same snapshot rerun', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-writing-seeds-');

  try {
    await registerExperiment(projectRoot, experiment());
    await updateExperiment(projectRoot, 'EXP-551', {
      status: 'active',
      latestAttemptId: 'ATT-PHASE55-551',
    });
    await updateExperiment(projectRoot, 'EXP-551', { status: 'completed' });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'seed.png'), 'png-data', 'utf8');

    await packageExperimentResults(projectRoot, 'EXP-551', {
      now: '2026-04-17T10:00:00Z',
      claimExportStatuses: [{ claimId: 'C-551', eligible: true, reasons: [] }],
      artifactMetadata: {
        'plots/seed.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support the immutable writing seed.',
          caption: 'Seed figure.',
          interpretation: 'The packaged artifact supports the claim.',
        },
      },
    });

    const reader = claimReader();
    await buildWritingHandoff(projectRoot, {
      now: '2026-04-17T10:05:00Z',
      snapshotId: 'WEXP-PHASE55-SEEDS',
      reader,
    });

    const seedPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'writing',
      'exports',
      'seeds',
      'WEXP-PHASE55-SEEDS',
      'C-551.md',
    );
    const firstSeed = await readFile(seedPath, 'utf8');

    await assert.rejects(
      () => buildWritingHandoff(projectRoot, {
        now: '2026-04-17T10:10:00Z',
        snapshotId: 'WEXP-PHASE55-SEEDS',
        reader,
      }),
      /already exists/u,
    );

    assert.equal(await readFile(seedPath, 'utf8'), firstSeed);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

function experiment() {
  return {
    experimentId: 'EXP-551',
    title: 'Immutable seed experiment',
    objective: 'Protect writing seed reruns',
    status: 'planned',
    createdAt: '2026-04-17T09:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {},
    codeRef: {
      entrypoint: 'scripts/run_seed.py',
      gitCommit: 'phase55',
    },
    inputArtifacts: [],
    outputArtifacts: ['plots/seed.png'],
    relatedClaims: ['C-551'],
    blockers: [],
    notes: '',
  };
}

function claimReader() {
  return {
    async listClaimHeads() {
      return [{
        claimId: 'C-551',
        currentStatus: 'PROMOTED',
        confidence: 0.9,
        narrative: 'Immutable writing seeds preserve the reviewed claim.',
        governanceProfileAtCreation: 'strict',
      }];
    },
    async listUnresolvedClaims() {
      return [];
    },
    async listCitationChecks(options = {}) {
      const citations = [{
        claimId: 'C-551',
        citationId: 'CIT-551',
        verificationStatus: 'VERIFIED',
      }];
      return options.claimId == null
        ? citations
        : citations.filter((entry) => entry.claimId === options.claimId);
    },
  };
}
