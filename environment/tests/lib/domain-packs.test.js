import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { listPapers } from '../../flows/literature.js';
import { listExperiments } from '../../flows/experiment.js';
import { getResultsOverview } from '../../flows/results-discovery.js';
import { getWritingOverview } from '../../flows/writing-overview.js';
import { getDomainPackRegistry } from '../../domain-packs/index.js';
import {
  activateDomainPack,
  getDomainPackOverview,
} from '../../domain-packs/resolver.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

test('domain-pack registry discovers the built-in omics pack and activation writes a project-scoped snapshot', async () => {
  const projectRoot = await createFixtureProject('vre-domain-packs-registry-');

  try {
    await writeInstallState(projectRoot);

    const registry = await getDomainPackRegistry(projectRoot);
    assert.equal(registry.runtimeInstalled, true);
    assert.deepEqual(
      registry.packs.map((entry) => entry.packId),
      ['omics'],
    );

    const activation = await activateDomainPack(projectRoot, 'omics', {
      updatedAt: '2026-04-04T17:00:00Z',
    });
    const persisted = JSON.parse(
      await readFile(
        path.join(projectRoot, '.vibe-science-environment', 'domain-config.json'),
        'utf8',
      ),
    );

    assert.equal(activation.activePackId, 'omics');
    assert.equal(activation.configState, 'resolved');
    assert.equal(activation.manifestPath, 'environment/domain-packs/omics/pack.domain-pack.json');
    assert.equal(persisted.activePackId, 'omics');
    assert.equal(persisted.deliverablePresets.reportTemplate, 'omics-standard');
    assert.equal(persisted.deliverablePresets.writingPackTemplate, 'omics-advisor-pack');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('domain-pack resolver falls back cleanly on missing, invalid, and unknown activation config', async () => {
  const projectRoot = await createFixtureProject('vre-domain-packs-fallback-');

  try {
    await writeInstallState(projectRoot);

    const missing = await getDomainPackOverview(projectRoot);
    assert.equal(missing.activePackId, null);
    assert.equal(missing.configState, 'inactive');

    const configPath = path.join(projectRoot, '.vibe-science-environment', 'domain-config.json');
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, '{"schemaVersion":"vibe-env.domain-config.v1","activePackId":"omics"', 'utf8');

    const invalid = await getDomainPackOverview(projectRoot);
    assert.equal(invalid.activePackId, null);
    assert.equal(invalid.configState, 'invalid');
    assert.match(invalid.warnings.join('\n'), /Ignoring invalid domain config/u);

    await writeFile(
      configPath,
      `${JSON.stringify({
        schemaVersion: 'vibe-env.domain-config.v1',
        activePackId: 'unknown-pack',
        displayName: 'Unknown Pack',
        updatedAt: '2026-04-04T17:05:00Z',
        authorityBoundary: 'presets-only',
        literatureSources: [],
        workflowPresets: {
          defaultExperimentFields: [],
          commonConfounders: [],
        },
        deliverablePresets: {
          reportTemplate: null,
          writingPackTemplate: null,
        },
        expectedConnectors: [],
      }, null, 2)}\n`,
      'utf8',
    );

    const unknown = await getDomainPackOverview(projectRoot);
    assert.equal(unknown.activePackId, null);
    assert.equal(unknown.configState, 'unknown-pack');
    assert.match(unknown.warnings.join('\n'), /Ignoring unknown active domain pack unknown-pack/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('flow helpers surface pack-aware presets without changing authority semantics', async () => {
  const projectRoot = await createFixtureProject('vre-domain-packs-flows-');

  try {
    await writeInstallState(projectRoot);
    await activateDomainPack(projectRoot, 'omics', {
      updatedAt: '2026-04-04T17:10:00Z',
    });

    const literature = await listPapers(projectRoot);
    const experiment = await listExperiments(projectRoot);
    const results = await getResultsOverview(projectRoot);
    const writing = await getWritingOverview(projectRoot);

    assert.deepEqual(literature.domain.literatureSources, ['PubMed', 'bioRxiv', 'GEO']);
    assert.ok(literature.domain.advisoryHints.some((hint) => hint.includes('batch handling')));

    assert.deepEqual(
      experiment.domain.defaultExperimentFields,
      ['organism', 'tissue', 'cell_count', 'sequencing_platform', 'library_chemistry'],
    );
    assert.ok(experiment.domain.commonConfounders.includes('doublet_rate'));

    assert.equal(results.domain.reportTemplate, 'omics-standard');
    assert.equal(writing.domain.writingPackTemplate, 'omics-advisor-pack');
    assert.ok(writing.domain.commonConfounders.includes('batch_effect'));
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

async function writeInstallState(projectRoot) {
  const installStatePath = path.join(
    projectRoot,
    '.vibe-science-environment',
    '.install-state.json',
  );
  await mkdir(path.dirname(installStatePath), { recursive: true });
  await writeFile(
    installStatePath,
    `${JSON.stringify({
      schemaVersion: 'vibe-env.install.v1',
      installedAt: '2026-04-04T16:50:00Z',
      bundles: ['governance-core', 'control-plane', 'domain-packs-core'],
      bundleManifestVersion: '1.0.0',
      operations: [],
      source: {
        version: '0.1.0',
        commit: 'domain-pack-test',
      },
    }, null, 2)}\n`,
    'utf8',
  );
}
