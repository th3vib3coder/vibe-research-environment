import assert from 'node:assert/strict';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from './_fixture.js';

const FIXTURE_ROOT = 'environment/tests/fixtures/phase12/manual-relay-dry-run';

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function fixturePath(projectRoot, scenario, fileName) {
  return path.join(projectRoot, ...FIXTURE_ROOT.split('/'), scenario, fileName);
}

async function copyScenario(projectRoot, sourceScenario, targetScenario) {
  const source = path.join(projectRoot, ...FIXTURE_ROOT.split('/'), sourceScenario);
  const target = path.join(projectRoot, ...FIXTURE_ROOT.split('/'), targetScenario);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  return `${FIXTURE_ROOT}/${targetScenario}`;
}

async function listAdversarialState(projectRoot) {
  const stateRoot = path.join(projectRoot, '.vibe-science-environment');
  try {
    return (await readdir(stateRoot)).filter((entry) => entry.startsWith('adversarial'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function parseStdout(result) {
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('adversarial status reads an ACCEPT fixture without creating run state', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-status-');
  try {
    const before = await listAdversarialState(projectRoot);
    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      `${FIXTURE_ROOT}/accept`,
      '--json'
    ]);

    assert.equal(result.code, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseStdout(result);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'adversarial status');
    assert.equal(payload.phase12, true);
    assert.equal(payload.adapterMode, 'manual-read-only');
    assert.equal(payload.runId, 'RUN-20260618-000001-t12-2-accept');
    assert.equal(payload.state, 'ACCEPTED');
    assert.equal(payload.activeAuthor, 'codex');
    assert.equal(payload.counterReviewer, 'claude-code');
    assert.equal(payload.providerIdentity.reviewer, 'claude-code');
    assert.equal(payload.finalVerdict.verdict, 'ACCEPT');
    assert.equal(payload.automation.providerAutomationAllowed, false);
    assert.equal(payload.automation.guiAutomationAllowed, false);
    assert.equal(payload.automation.runStateCreated, false);
    assert.equal(payload.evidence.verified, true);

    const after = await listAdversarialState(projectRoot);
    assert.deepEqual(after, before);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial status reads a REDIRECT fixture', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-redirect-');
  try {
    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      `${FIXTURE_ROOT}/redirect`,
      '--json'
    ]);

    assert.equal(result.code, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseStdout(result);
    assert.equal(payload.ok, true);
    assert.equal(payload.state, 'REDIRECTED');
    assert.equal(payload.finalVerdict.verdict, 'REDIRECT');
    assert.equal(payload.finalVerdict.accepted, false);
    assert.equal(payload.review.requiredActions.length > 0, true);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial packet emits deterministic artifact refs', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-packet-');
  try {
    const result = await runVre(projectRoot, [
      'adversarial',
      'packet',
      '--fixture',
      `${FIXTURE_ROOT}/accept`,
      '--json'
    ]);

    assert.equal(result.code, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    const payload = parseStdout(result);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'adversarial packet');
    assert.equal(payload.packet.schemaVersion, 'phase12.manual-relay-packet.v1');
    assert.equal(payload.packet.runId, 'RUN-20260618-000001-t12-2-accept');
    assert.equal(
      payload.packet.artifacts.some((artifact) => artifact.kind === 'candidate'),
      true
    );
    assert.equal(
      payload.packet.artifacts.some((artifact) => artifact.kind === 'evidence-bundle'),
      true
    );
    assert.equal(payload.packet.automation.providerAutomationAllowed, false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial commands require --json and --fixture', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-usage-');
  try {
    const noJson = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      `${FIXTURE_ROOT}/accept`
    ]);
    assert.equal(noJson.code, 3);
    assert.equal(JSON.parse(noJson.stdout).code, 'E_PHASE12_ADVERSARIAL_JSON_REQUIRED');

    const noFixture = await runVre(projectRoot, ['adversarial', 'packet', '--json']);
    assert.equal(noFixture.code, 3);
    assert.equal(
      JSON.parse(noFixture.stdout).code,
      'E_PHASE12_ADVERSARIAL_FIXTURE_REQUIRED'
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial unknown action fails closed with JSON', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-unknown-');
  try {
    const result = await runVre(projectRoot, ['adversarial', 'run', '--json']);
    assert.equal(result.code, 2);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_PHASE12_ADVERSARIAL_UNKNOWN_ACTION');
    assert.deepEqual(payload.allowed, ['adversarial packet', 'adversarial status']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial fixture paths cannot escape the repo', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-escape-');
  try {
    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      '../outside',
      '--json'
    ]);

    assert.equal(result.code, 3);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE12_ADVERSARIAL_FIXTURE_ESCAPE');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial rejects provider automation options before reading fixtures', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-provider-');
  try {
    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      `${FIXTURE_ROOT}/accept`,
      '--provider',
      'codex',
      '--json'
    ]);

    assert.equal(result.code, 3);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE12_PROVIDER_AUTOMATION_DISABLED');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial rejects fixtures that enable provider automation', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-provider-fixture-');
  try {
    const badFixture = await copyScenario(projectRoot, 'accept', 'provider-enabled');
    const runPath = fixturePath(projectRoot, 'provider-enabled', 'run.json');
    const run = await readJson(runPath);
    await writeJson(runPath, { ...run, providerAutomationAllowed: true });

    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      badFixture,
      '--json'
    ]);

    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE12_ADVERSARIAL_ARTIFACT_INVALID');
    assert.match(JSON.stringify(payload.issues), /E_PHASE12_DRY_RUN_SCHEMA_INVALID|E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial rejects schema-invalid review artifacts', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-schema-');
  try {
    const badFixture = await copyScenario(projectRoot, 'accept', 'schema-invalid');
    const reviewPath = fixturePath(projectRoot, 'schema-invalid', 'review.json');
    const review = await readJson(reviewPath);
    delete review.reviewer;
    await writeJson(reviewPath, review);

    const result = await runVre(projectRoot, [
      'adversarial',
      'status',
      '--fixture',
      badFixture,
      '--json'
    ]);

    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE12_ADVERSARIAL_ARTIFACT_INVALID');
    assert.match(JSON.stringify(payload.issues), /E_PHASE12_DRY_RUN_SCHEMA_INVALID/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial rejects mismatched evidence hashes', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-hash-');
  try {
    const badFixture = await copyScenario(projectRoot, 'accept', 'hash-invalid');
    await writeFile(
      fixturePath(projectRoot, 'hash-invalid', 'candidate.md'),
      '# tampered candidate\n',
      'utf8'
    );

    const result = await runVre(projectRoot, [
      'adversarial',
      'packet',
      '--fixture',
      badFixture,
      '--json'
    ]);

    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'E_PHASE12_ADVERSARIAL_ARTIFACT_INVALID');
    assert.match(JSON.stringify(payload.issues), /E_PHASE12_DRY_RUN_HASH_MISMATCH/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('adversarial does not create runtime state for packet output', async () => {
  const projectRoot = await createCliFixtureProject('vre-adversarial-no-state-');
  try {
    await mkdir(path.join(projectRoot, '.vibe-science-environment'), {
      recursive: true
    });
    const result = await runVre(projectRoot, [
      'adversarial',
      'packet',
      '--fixture',
      `${FIXTURE_ROOT}/accept`,
      '--json'
    ]);

    assert.equal(result.code, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.deepEqual(await listAdversarialState(projectRoot), []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
