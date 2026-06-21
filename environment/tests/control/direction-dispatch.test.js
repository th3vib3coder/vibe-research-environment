import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const binVrePath = path.join(repoRoot, 'bin', 'vre');
const binVreSourcePath = binVrePath;

async function withTempVreProject(callback) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-dispatch-'));
  try {
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'vibe-research-environment' }),
    );
    await mkdir(path.join(projectRoot, 'environment', 'schemas'), { recursive: true });
    return await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function runVre(projectRoot, args, options = {}) {
  const result = await execFileAsync(process.execPath, [binVrePath, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    json: JSON.parse(result.stdout),
  };
}

async function runVreFailure(projectRoot, args) {
  try {
    await runVre(projectRoot, args);
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
      json: JSON.parse(error.stdout),
    };
  }
  assert.fail(`expected node bin/vre ${args.join(' ')} to fail`);
}

async function directionEventLog(projectRoot) {
  try {
    return await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'directions', 'directions.jsonl'),
      'utf8',
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

test('bin/vre direction list dispatches to the accepted list helper', async () => {
  await withTempVreProject(async (projectRoot) => {
    const result = await runVre(projectRoot, ['direction', 'list', '--json']);

    assert.equal(result.stderr, '');
    assert.equal(result.json.ok, true);
    assert.equal(result.json.command, 'direction list');
    assert.deepEqual(result.json.directions, []);
  });
});

test('bin/vre direction record appends through the accepted store helper', async () => {
  await withTempVreProject(async (projectRoot) => {
    const result = await runVre(projectRoot, [
      'direction',
      'record',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--summary',
      'Test CXCL13-positive CD8 T cells in HGSOC',
      '--reason',
      'Initial reviewed research direction.',
      '--evidence',
      'claim:C-001',
    ]);

    assert.equal(result.json.ok, true);
    assert.equal(result.json.command, 'direction record');
    assert.equal(result.json.directionId, 'DIR-HGSOC-CXCL13-CD8');
    assert.equal(result.json.record.state, 'tried');
    assert.equal((await directionEventLog(projectRoot)).trim().split('\n').length, 1);
  });
});

test('bin/vre direction lifecycle verbs surface durable store guards through dispatch', async () => {
  await withTempVreProject(async (projectRoot) => {
    await runVre(projectRoot, [
      'direction',
      'record',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--summary',
      'Test CXCL13-positive CD8 T cells in HGSOC',
    ]);

    const killed = await runVre(projectRoot, [
      'direction',
      'kill',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--reason',
      'Kill until the independent cohort exists.',
      '--condition-kind',
      'new-dataset',
      '--condition-detail',
      'Independent HGSOC cohort with CXCL13/CD8 annotation',
    ]);
    assert.equal(killed.json.record.state, 'killed');

    const missingCondition = await runVreFailure(projectRoot, [
      'direction',
      'revive',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--reason',
      'Revive without naming the condition.',
    ]);
    assert.equal(missingCondition.code, 1);
    assert.equal(missingCondition.json.command, 'direction revive');
    assert.equal(missingCondition.json.code, 'E_DIRECTION_REVIVE_CONDITION_UNSATISFIED');

    const invalidTransition = await runVreFailure(projectRoot, [
      'direction',
      'park',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--reason',
      'Illegal park from killed without revive.',
    ]);
    assert.equal(invalidTransition.json.code, 'E_DIRECTION_TRANSITION_INVALID');
  });
});

test('bin/vre direction check stays read-only through dispatch', async () => {
  await withTempVreProject(async (projectRoot) => {
    await runVre(projectRoot, [
      'direction',
      'record',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--summary',
      'Test CXCL13-positive CD8 T cells in HGSOC',
    ]);
    await runVre(projectRoot, [
      'direction',
      'kill',
      '--json',
      '--direction',
      'DIR-HGSOC-CXCL13-CD8',
      '--reason',
      'Kill until the independent cohort exists.',
      '--condition-kind',
      'new-dataset',
      '--condition-detail',
      'Independent HGSOC cohort with CXCL13/CD8 annotation',
    ]);

    const before = await directionEventLog(projectRoot);
    const result = await runVre(projectRoot, [
      'direction',
      'check',
      '--json',
      '--summary',
      'Test CXCL13-positive CD8 T cells in HGSOC',
      '--satisfies-kind',
      'new-dataset',
      '--satisfies-detail',
      'Independent HGSOC cohort with CXCL13/CD8 annotation',
    ]);
    const after = await directionEventLog(projectRoot);

    assert.equal(result.json.command, 'direction check');
    assert.equal(result.json.verdict, 'allow-with-condition');
    assert.equal(result.json.written, false);
    assert.equal(after, before);
  });
});

test('bin/vre direction rejects unknown verbs and missing --json as structured JSON', async () => {
  await withTempVreProject(async (projectRoot) => {
    const unknown = await runVreFailure(projectRoot, ['direction', 'unknown', '--json']);
    assert.equal(unknown.code, 2);
    assert.equal(unknown.json.command, 'direction unknown');
    assert.equal(unknown.json.code, 'E_DIRECTION_UNKNOWN_ACTION');

    const missingJson = await runVreFailure(projectRoot, ['direction', 'list']);
    assert.equal(missingJson.code, 3);
    assert.equal(missingJson.json.command, 'direction list');
    assert.equal(missingJson.json.code, 'E_DIRECTION_JSON_REQUIRED');
  });
});

test('bin/vre direction dispatch delegates instead of reimplementing direction logic', async () => {
  const source = await readFile(binVreSourcePath, 'utf8');

  assert.match(source, /recordDirectionCommand/u);
  assert.match(source, /listDirectionsCommand/u);
  assert.match(source, /checkDirectionCommand/u);
  assert.match(source, /killDirectionCommand/u);
  assert.match(source, /parkDirectionCommand/u);
  assert.match(source, /reviveDirectionCommand/u);
  assert.match(source, /contradictDirectionCommand/u);
  assert.doesNotMatch(source, /readDirectionProjection|recordDirection\(/u);
});
