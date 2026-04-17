import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { registerExperiment, updateExperiment } from '../../flows/experiment.js';
import { packageExperimentResults } from '../../flows/results.js';
import { buildWritingHandoff } from '../../flows/writing.js';
import { exportEligibility } from '../../lib/export-eligibility.js';

function buildExperiment() {
  return {
    experimentId: 'EXP-401',
    title: 'Middleware writing handoff experiment',
    objective: 'Verify snapshot-first writing export through middleware',
    status: 'planned',
    createdAt: '2026-04-03T09:00:00Z',
    executionPolicy: {
      timeoutSeconds: 3600,
      unresponsiveSeconds: 300,
      maxAttempts: 2,
    },
    latestAttemptId: null,
    parameters: {
      seed: 41,
    },
    codeRef: {
      entrypoint: 'scripts/run_writing_handoff.py',
      gitCommit: 'wave4abc',
    },
    inputArtifacts: ['data/input.h5ad'],
    outputArtifacts: ['plots/handoff.png'],
    relatedClaims: ['C-401'],
    blockers: [],
    notes: '',
  };
}

test('flow-writing handoff through middleware stays blocked for default-mode claims until fresh validation exists', async () => {
  const projectRoot = await createFixtureProject('vre-int-writing-handoff-');

  try {
    await registerExperiment(projectRoot, buildExperiment());
    await updateExperiment(projectRoot, 'EXP-401', {
      status: 'active',
      latestAttemptId: 'ATT-2026-04-03-401',
    });
    await updateExperiment(projectRoot, 'EXP-401', {
      status: 'completed',
    });

    await mkdir(path.join(projectRoot, 'plots'), { recursive: true });
    await writeFile(path.join(projectRoot, 'plots', 'handoff.png'), 'png-data', 'utf8');

    const defaultReader = createReader({
      heads: [{
        claimId: 'C-401',
        currentStatus: 'PROMOTED',
        confidence: 0.87,
        narrative: 'The default-mode claim needs fresh validation before safe export.',
        governanceProfileAtCreation: 'default',
      }],
      citations: [{
        claimId: 'C-401',
        citationId: 'CIT-401',
        verificationStatus: 'VERIFIED',
      }],
    });

    const packagedBeforeValidation = await packageExperimentResults(projectRoot, 'EXP-401', {
      now: '2026-04-03T09:10:00Z',
      artifactMetadata: {
        'plots/handoff.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support middleware writing handoff coverage.',
          caption: 'Handoff figure for EXP-401.',
          interpretation: 'The figure remains available even when export policy is still blocked.',
        },
      },
      claimExportStatuses: [await exportEligibility('C-401', defaultReader, {
        projectPath: projectRoot,
        requiredValidatedAfter: '2026-04-03T09:10:00Z',
      })],
    });

    assert.equal(packagedBeforeValidation.claimExportStatuses[0].eligible, false);
    assert.match(
      packagedBeforeValidation.claimExportStatuses[0].reasons.join(','),
      /needs_fresh_schema_validation/u,
    );

    const blockedRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-writing',
      scope: 'flow-writing',
      reader: { dbAvailable: true, ...defaultReader },
      commandFn: async () => ({
        summary: 'writing handoff blocked until validation exists',
        payload: await buildWritingHandoff(projectRoot, {
          now: '2026-04-03T09:20:00Z',
          snapshotId: 'WEXP-2026-04-03-401A',
          reader: defaultReader,
        }),
      }),
    });

    assert.equal(blockedRun.attempt.status, 'succeeded');
    assert.equal(blockedRun.snapshot.activeFlow, 'writing');
    assert.equal(blockedRun.snapshot.currentStage, 'writing-handoff');
    assert.equal(blockedRun.result.payload.snapshot.snapshotId, 'WEXP-2026-04-03-401A');
    assert.equal(blockedRun.result.payload.seeds.length, 0);
    assert.equal(blockedRun.result.payload.blockedClaims.length, 1);
    assert.match(
      blockedRun.result.payload.blockedClaims[0].reasons.join(','),
      /needs_fresh_schema_validation/u,
    );

    await assert.rejects(
      () => readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'writing',
          'exports',
          'seeds',
          'WEXP-2026-04-03-401A',
          'C-401.md',
        ),
        'utf8',
      ),
      /ENOENT/u,
    );

    await writeSchemaValidationArtifact(projectRoot, {
      claimId: 'C-401',
      validatedAt: '2026-04-03T09:30:00Z',
      validatorVersion: 'v1',
      ok: true,
      compatibilityMode: 'full',
      notes: null,
    });

    const packagedAfterValidation = await packageExperimentResults(projectRoot, 'EXP-401', {
      now: '2026-04-03T09:30:00Z',
      artifactMetadata: {
        'plots/handoff.png': {
          type: 'figure',
          role: 'main-result',
          purpose: 'Support middleware writing handoff coverage.',
          caption: 'Handoff figure for EXP-401.',
          interpretation: 'Fresh validation now makes the claim export-safe.',
        },
      },
      claimExportStatuses: [await exportEligibility('C-401', defaultReader, {
        projectPath: projectRoot,
        requiredValidatedAfter: '2026-04-03T09:30:00Z',
      })],
    });

    assert.equal(packagedAfterValidation.claimExportStatuses[0].eligible, true);

    const allowedRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-writing',
      scope: 'flow-writing',
      reader: { dbAvailable: true, ...defaultReader },
      commandFn: async () => ({
        summary: 'writing handoff assembled',
        payload: await buildWritingHandoff(projectRoot, {
          now: '2026-04-03T09:30:00Z',
          snapshotId: 'WEXP-2026-04-03-401B',
          reader: defaultReader,
        }),
      }),
    });

    assert.equal(allowedRun.attempt.status, 'succeeded');
    assert.equal(allowedRun.result.payload.snapshot.snapshotId, 'WEXP-2026-04-03-401B');
    assert.equal(allowedRun.result.payload.seeds.length, 1);
    assert.equal(allowedRun.result.payload.seeds[0].snapshotId, 'WEXP-2026-04-03-401B');
    assert.equal(allowedRun.result.payload.seeds[0].claimId, 'C-401');

    const snapshot = JSON.parse(
      await readFile(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'writing',
          'exports',
          'snapshots',
          'WEXP-2026-04-03-401B.json',
        ),
        'utf8',
      ),
    );
    const seed = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'writing',
        'exports',
        'seeds',
        'WEXP-2026-04-03-401B',
        'C-401.md',
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
    )).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

    assert.equal(snapshot.snapshotId, 'WEXP-2026-04-03-401B');
    assert.equal(snapshot.claims[0].eligible, true);
    assert.equal(snapshot.claims[0].hasFreshSchemaValidation, true);
    assert.match(seed, /Snapshot ID: WEXP-2026-04-03-401B/u);
    assert.match(seed, /Claim ID: C-401/u);
    assert.equal(exportLog.length, 1);
    assert.equal(exportLog[0].snapshotId, 'WEXP-2026-04-03-401B');
    assert.equal(exportLog[0].claimId, 'C-401');
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

async function writeSchemaValidationArtifact(projectPath, payload) {
  const targetPath = path.join(
    projectPath,
    '.vibe-science-environment',
    'governance',
    'schema-validation',
    `${payload.claimId}.json`,
  );
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
