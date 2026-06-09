import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createObjectiveStore } from '../../objectives/store.js';
import { validateWithSchema } from '../ci/_helpers.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from './_fixture.js';

const DOMAIN_RECORD_RELATIVE_PATH = '.vibe-science-environment/phase10/knowledge-domains/active-knowledge-domain.json';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function writeJson(targetPath, value) {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readFixtureJson(section, fileName) {
  return JSON.parse(
    await readFile(
      path.join(repoRoot, 'environment', 'tests', 'fixtures', 'phase9', section, fileName),
      'utf8'
    )
  );
}

async function installObjective(projectRoot, objectiveId = 'OBJ-001') {
  const record = {
    ...await readFixtureJson('objective', 'valid-active.json'),
    objectiveId,
    title: `objective ${objectiveId}`
  };
  await createObjectiveStore(projectRoot, record);
  return record;
}

function domainRecordPath(projectRoot) {
  return path.join(projectRoot, ...DOMAIN_RECORD_RELATIVE_PATH.split('/'));
}

function objectiveRecordPath(projectRoot, objectiveId) {
  return path.join(
    projectRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'objective.json'
  );
}

async function createDomain(projectRoot, extraArgs = []) {
  return runVre(projectRoot, [
    'domain',
    'create',
    '--domain',
    'KDOM-001',
    '--name',
    'Oncology Knowledge Domain',
    '--objective',
    'OBJ-001',
    ...extraArgs
  ]);
}

test('domain create writes one active domain under gitignored runtime state and links the objective', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-create-');
  try {
    await installObjective(projectRoot, 'OBJ-001');

    const result = await createDomain(projectRoot);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'domain create');
    assert.equal(payload.phase10, true);
    assert.equal(payload.domainId, 'KDOM-001');
    assert.equal(payload.domainRecordPath, DOMAIN_RECORD_RELATIVE_PATH);
    assert.match(payload.domainRecordPath, /^\.vibe-science-environment\//u);

    const domain = await readJson(domainRecordPath(projectRoot));
    assert.equal(domain.schemaVersion, 'phase10.knowledge-domain.v1');
    assert.equal(domain.domainId, 'KDOM-001');
    assert.equal(domain.lifecycleStatus, 'active');
    assert.deepEqual(domain.objectiveLinks, ['OBJ-001']);

    const objective = await readJson(objectiveRecordPath(projectRoot, 'OBJ-001'));
    assert.equal(objective.domainId, 'KDOM-001');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain create rejects a second active domain in v1', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-second-active-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const result = await runVre(projectRoot, [
      'domain',
      'create',
      '--domain',
      'KDOM-002',
      '--name',
      'Second Domain',
      '--objective',
      'OBJ-002'
    ]);
    assert.equal(result.code, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_PHASE10_ACTIVE_DOMAIN_EXISTS');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('phase10 knowledge-domain and domain-config schemas reject each other', async () => {
  const knowledgeDomain = {
    schemaVersion: 'phase10.knowledge-domain.v1',
    domainId: 'KDOM-001',
    name: 'Oncology Knowledge Domain',
    lifecycleStatus: 'active',
    objectiveLinks: ['OBJ-001'],
    active: true,
    createdAt: '2026-06-09T00:00:00Z',
    updatedAt: '2026-06-09T00:00:00Z'
  };
  const domainConfig = {
    schemaVersion: 'vibe-env.domain-config.v1',
    activePackId: 'oncology',
    displayName: 'Oncology',
    updatedAt: '2026-06-09T00:00:00Z',
    authorityBoundary: 'presets-only',
    literatureSources: [],
    workflowPresets: {
      defaultExperimentFields: [],
      commonConfounders: []
    },
    deliverablePresets: {
      reportTemplate: null,
      writingPackTemplate: null
    }
  };

  assert.equal((await validateWithSchema('environment/schemas/domain-config.schema.json', knowledgeDomain)).ok, false);
  assert.equal((await validateWithSchema('environment/schemas/phase10-knowledge-domain.schema.json', domainConfig)).ok, false);
});

test('domain link adds both domain objectiveLinks and objective domainId', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-link-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const result = await runVre(projectRoot, [
      'domain',
      'link',
      '--domain',
      'KDOM-001',
      '--objective',
      'OBJ-002'
    ]);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const domain = await readJson(domainRecordPath(projectRoot));
    assert.deepEqual(domain.objectiveLinks, ['OBJ-001', 'OBJ-002']);
    const objective = await readJson(objectiveRecordPath(projectRoot, 'OBJ-002'));
    assert.equal(objective.domainId, 'KDOM-001');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain link fails closed on domain-side-only stale links', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-domain-side-stale-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    await installObjective(projectRoot, 'OBJ-003');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const domainPath = domainRecordPath(projectRoot);
    const domain = await readJson(domainPath);
    await writeJson(domainPath, {
      ...domain,
      objectiveLinks: ['OBJ-001', 'OBJ-002']
    });

    const result = await runVre(projectRoot, [
      'domain',
      'link',
      '--domain',
      'KDOM-001',
      '--objective',
      'OBJ-003'
    ]);
    assert.equal(result.code, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE10_DOMAIN_LINK_INCONSISTENT');

    const after = await readJson(objectiveRecordPath(projectRoot, 'OBJ-003'));
    assert.equal(after.domainId, undefined);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain link fails closed on objective-side-only stale links', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-objective-side-stale-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    await installObjective(projectRoot, 'OBJ-003');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const objectivePath = objectiveRecordPath(projectRoot, 'OBJ-002');
    const objective = await readJson(objectivePath);
    await writeJson(objectivePath, {
      ...objective,
      domainId: 'KDOM-001'
    });

    const result = await runVre(projectRoot, [
      'domain',
      'link',
      '--domain',
      'KDOM-001',
      '--objective',
      'OBJ-003'
    ]);
    assert.equal(result.code, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE10_DOMAIN_LINK_INCONSISTENT');

    const domain = await readJson(domainRecordPath(projectRoot));
    assert.deepEqual(domain.objectiveLinks, ['OBJ-001']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain unlink removes both sides atomically', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-unlink-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    assert.equal((await createDomain(projectRoot)).code, 0);
    assert.equal((await runVre(projectRoot, ['domain', 'link', '--domain', 'KDOM-001', '--objective', 'OBJ-002'])).code, 0);

    const result = await runVre(projectRoot, [
      'domain',
      'unlink',
      '--domain',
      'KDOM-001',
      '--objective',
      'OBJ-002'
    ]);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const domain = await readJson(domainRecordPath(projectRoot));
    assert.deepEqual(domain.objectiveLinks, ['OBJ-001']);
    const objective = await readJson(objectiveRecordPath(projectRoot, 'OBJ-002'));
    assert.equal(objective.domainId, undefined);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain status is read-only and does not mutate domain or objective files', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-status-readonly-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const beforeDomain = await readFile(domainRecordPath(projectRoot), 'utf8');
    const beforeObjective = await readFile(objectiveRecordPath(projectRoot, 'OBJ-001'), 'utf8');
    const result = await runVre(projectRoot, ['domain', 'status', '--domain', 'KDOM-001', '--json']);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.domainId, 'KDOM-001');
    assert.deepEqual(payload.objectiveLinks, ['OBJ-001']);
    assert.equal(await readFile(domainRecordPath(projectRoot), 'utf8'), beforeDomain);
    assert.equal(await readFile(objectiveRecordPath(projectRoot, 'OBJ-001'), 'utf8'), beforeObjective);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain archive keeps status readable but blocks lifecycle writes', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-archive-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    await installObjective(projectRoot, 'OBJ-002');
    assert.equal((await createDomain(projectRoot)).code, 0);

    const archive = await runVre(projectRoot, [
      'domain',
      'archive',
      '--domain',
      'KDOM-001',
      '--reason',
      'operator archive'
    ]);
    assert.equal(archive.code, 0, `stderr=${archive.stderr}`);

    const status = await runVre(projectRoot, ['domain', 'status', '--domain', 'KDOM-001', '--json']);
    assert.equal(status.code, 0, `stderr=${status.stderr}`);
    assert.equal(JSON.parse(status.stdout).lifecycleStatus, 'archived');

    const link = await runVre(projectRoot, ['domain', 'link', '--domain', 'KDOM-001', '--objective', 'OBJ-002']);
    assert.equal(link.code, 1);
    assert.equal(JSON.parse(link.stdout).code, 'E_PHASE10_DOMAIN_ARCHIVED');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain status rejects historical phase10.domain.v1 records fail-closed', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-historical-schema-');
  try {
    await installObjective(projectRoot, 'OBJ-001');
    assert.equal((await createDomain(projectRoot)).code, 0);
    const domainPath = domainRecordPath(projectRoot);
    const domain = await readJson(domainPath);
    await writeJson(domainPath, {
      ...domain,
      schemaVersion: 'phase10.domain.v1'
    });

    const result = await runVre(projectRoot, ['domain', 'status', '--domain', 'KDOM-001', '--json']);
    assert.equal(result.code, 1, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).code, 'E_PHASE10_DOMAIN_SCHEMA_INVALID');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('domain create rejects workspace escape through domain id and state-root override', async () => {
  const projectRoot = await createCliFixtureProject('vre-domain-cli-escape-');
  try {
    await installObjective(projectRoot, 'OBJ-001');

    const badId = await runVre(projectRoot, [
      'domain',
      'create',
      '--domain',
      'KDOM-../escape',
      '--name',
      'Bad Domain',
      '--objective',
      'OBJ-001'
    ]);
    assert.equal(badId.code, 1);
    assert.equal(JSON.parse(badId.stdout).code, 'E_PHASE10_DOMAIN_ID_INVALID');

    const outsideRoot = await runVre(projectRoot, [
      'domain',
      'create',
      '--domain',
      'KDOM-001',
      '--name',
      'Bad Root',
      '--objective',
      'OBJ-001',
      '--state-root',
      '..'
    ]);
    assert.equal(outsideRoot.code, 1);
    assert.equal(JSON.parse(outsideRoot.stdout).code, 'E_PHASE10_DOMAIN_STORAGE_ESCAPE');
    assert.equal(await pathExists(path.join(projectRoot, '..', 'phase10', 'knowledge-domains')), false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

