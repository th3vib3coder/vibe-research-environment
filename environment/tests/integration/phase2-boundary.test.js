import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';

test('F-06: results flow no longer imports Phase 3 export eligibility helper', async () => {
  const source = await readFile(
    new URL('../../flows/results.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /export-eligibility/u);
});

test('F-06: claim-linked packaging without caller statuses emits unavailable warning', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-results-boundary-');

  try {
    await registerExperiment(projectRoot, experiment());
    await updateExperiment(projectRoot, 'EXP-552', {
      status: 'active',
      latestAttemptId: 'ATT-PHASE55-552',
    });
    await updateExperiment(projectRoot, 'EXP-552', { status: 'completed' });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'boundary.png'), 'png-data', 'utf8');

    const packaged = await packageExperimentResults(projectRoot, 'EXP-552', {
      now: '2026-04-17T11:00:00Z',
      artifactMetadata: {
        'plots/boundary.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Exercise Phase 2 boundary warnings.',
          caption: 'Boundary figure.',
          interpretation: 'The artifact is packageable without export policy.',
        },
      },
    });

    assert.equal(packaged.claimExportStatuses.length, 0);
    assert.match(packaged.warnings.join('\n'), /Claim eligibility unavailable/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('F-06: caller-supplied claim statuses render without Phase 2 coupling', async () => {
  const projectRoot = await createFixtureProject('vre-phase55-results-statuses-');

  try {
    await registerExperiment(projectRoot, experiment());
    await updateExperiment(projectRoot, 'EXP-552', {
      status: 'active',
      latestAttemptId: 'ATT-PHASE55-552',
    });
    await updateExperiment(projectRoot, 'EXP-552', { status: 'completed' });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'boundary.png'), 'png-data', 'utf8');

    const packaged = await packageExperimentResults(projectRoot, 'EXP-552', {
      now: '2026-04-17T11:05:00Z',
      claimExportStatuses: [{
        claimId: 'C-552',
        eligible: false,
        reasons: ['unverified_citations'],
      }],
      artifactMetadata: {
        'plots/boundary.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Exercise caller-supplied claim status rendering.',
          caption: 'Boundary figure.',
          interpretation: 'The artifact is packageable while claim export is blocked.',
        },
      },
    });

    const report = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'results',
        'experiments',
        'EXP-552',
        'analysis-report.md',
      ),
      'utf8',
    );
    assert.match(packaged.warnings.join('\n'), /not export-eligible/u);
    assert.match(report, /Claim Export Readiness/u);
    assert.match(report, /unverified_citations/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

function experiment() {
  return {
    experimentId: 'EXP-552',
    title: 'Phase 2 boundary experiment',
    objective: 'Keep results packaging free of export eligibility coupling',
    status: 'planned',
    createdAt: '2026-04-17T10:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {},
    codeRef: {
      entrypoint: 'scripts/run_boundary.py',
      gitCommit: 'phase55',
    },
    inputArtifacts: [],
    outputArtifacts: ['plots/boundary.png'],
    relatedClaims: ['C-552'],
    blockers: [],
    notes: '',
  };
}
