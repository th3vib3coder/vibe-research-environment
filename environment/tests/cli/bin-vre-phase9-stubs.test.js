import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { DISPATCH_TABLE, IMPLEMENTED_PHASE9_COMMANDS } from '../../../bin/vre';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from './_fixture.js';

const HANDSHAKE_ARTIFACT_PATH = '.vibe-science-environment/control/capability-handshake.json';
const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling'
  )
};

const STUB_CASES = [
  { argv: ['capabilities', 'doctor'], command: 'capabilities doctor' },
  { argv: ['objective', 'doctor', '--objective=OBJ-1'], command: 'objective doctor', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['scheduler', 'install', '--objective', 'OBJ-1'], command: 'scheduler install', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['scheduler', 'status', '--objective=OBJ-1'], command: 'scheduler status', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['scheduler', 'doctor', '--objective', 'OBJ-1'], command: 'scheduler doctor', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['scheduler', 'remove', '--objective', 'OBJ-1'], command: 'scheduler remove', optionChecks: { objective: 'OBJ-1' } }
];

test('Phase 9 CLI stubs are invokable and emit structured JSON instead of unknown-command failures', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-stubs-');
  try {
    for (const stubCase of STUB_CASES) {
      const result = await runVre(projectRoot, stubCase.argv);
      assert.equal(result.code, 0, `${stubCase.command} stderr=${result.stderr}`);
      assert.equal(result.stderr, '', `${stubCase.command} should keep stderr quiet while still stubbed`);

      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.code, 'PHASE9_NOT_IMPLEMENTED');
      assert.equal(payload.command, stubCase.command);
      assert.equal(payload.phase9, true);
      assert.equal(payload.status, 'stub');

      for (const [key, expected] of Object.entries(stubCase.optionChecks ?? {})) {
        assert.deepEqual(payload.argv.options[key], expected, `${stubCase.command} should parse option ${key}`);
      }
    }
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json emits JSON only and atomically rewrites the handshake artifact with the same bytes', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-json-');
  const artifactPath = path.join(projectRoot, HANDSHAKE_ARTIFACT_PATH);
  try {
    const result = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 'phase9.capability-handshake.v1');
    assert.equal(payload.vrePresent, true);

    const artifactBytes = await readFile(artifactPath, 'utf8');
    assert.equal(artifactBytes, result.stdout);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json rewrites stale artifact content instead of leaving old bytes behind', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-rewrite-');
  const artifactPath = path.join(projectRoot, HANDSHAKE_ARTIFACT_PATH);
  try {
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, 'STALE-HANDSHAKE-CONTENT\n', 'utf8');

    const first = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(first.code, 0, `stderr=${first.stderr}`);
    assert.equal(await readFile(artifactPath, 'utf8'), first.stdout);

    await writeFile(artifactPath, 'STALE-CONTENT-SHOULD-DISAPPEAR\n', 'utf8');

    const second = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(second.code, 0, `stderr=${second.stderr}`);

    const artifactBytes = await readFile(artifactPath, 'utf8');
    assert.equal(artifactBytes, second.stdout);
    assert.doesNotMatch(artifactBytes, /STALE-CONTENT-SHOULD-DISAPPEAR/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json reports only commands that are actually wired in bin/vre', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-truth-');
  try {
    const result = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.deepEqual(
      payload.vre.executableCommands,
      [...new Set([...Object.keys(DISPATCH_TABLE), ...IMPLEMENTED_PHASE9_COMMANDS])].sort()
    );
    assert.equal(payload.vre.executableCommands.includes('capabilities --json'), true);
    assert.equal(payload.vre.executableCommands.includes('objective start'), true);
    assert.equal(payload.vre.executableCommands.includes('objective pause'), true);
    assert.equal(payload.vre.executableCommands.includes('objective resume'), true);
    assert.equal(payload.vre.executableCommands.includes('objective status'), true);
    assert.equal(payload.vre.executableCommands.includes('objective stop'), true);
    assert.equal(payload.vre.executableCommands.includes('research-loop'), true);
    assert.equal(payload.vre.executableCommands.includes('run-analysis'), true);
    assert.equal(payload.vre.executableCommands.includes('weekly-digest'), false);
    assert.equal(payload.vre.markdownOnlyContracts.includes('weekly-digest'), true);
    assert.equal(payload.vre.missingSurfaces.includes('capabilities --json'), false);
    assert.equal(payload.vre.missingSurfaces.includes('research-loop'), false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 parser does not reject nested stub commands merely because extra args are present', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-args-');
  try {
    const result = await runVre(projectRoot, [
      'scheduler',
      'install',
      '--objective',
      'OBJ-1',
      '--wake-owner=manual',
      '--lease-ttl-seconds',
      '60'
    ]);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.doesNotMatch(result.stderr, /unexpected arguments/u);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, 'scheduler install');
    assert.equal(payload.argv.options.objective, 'OBJ-1');
    assert.equal(payload.argv.options['wake-owner'], 'manual');
    assert.equal(payload.argv.options['lease-ttl-seconds'], '60');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 capability root fails closed when --json or doctor is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-usage-');
  try {
    const result = await runVre(projectRoot, ['capabilities']);
    assert.equal(result.code, 3);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.expected, /--json/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 objective start rejects reviewed-api reasoning mode in v1', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-reasoning-mode-');
  try {
    const result = await runVre(projectRoot, [
      'objective',
      'start',
      '--title',
      'demo',
      '--question',
      'why-now',
      '--reasoning-mode',
      'reviewed-api'
    ]);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_REASONING_MODE_UNSUPPORTED');
    assert.equal(payload.command, 'objective start');
    assert.equal(payload.phase9, true);
    assert.equal(payload.requested, 'reviewed-api');
    assert.deepEqual(payload.supported, ['rule-only']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
