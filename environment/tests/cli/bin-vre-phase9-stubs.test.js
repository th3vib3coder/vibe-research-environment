import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from './_fixture.js';

const STUB_CASES = [
  { argv: ['capabilities', '--json'], command: 'capabilities --json', optionChecks: { json: true } },
  { argv: ['capabilities', 'doctor'], command: 'capabilities doctor' },
  {
    argv: ['objective', 'start', '--title', 'demo', '--question=why-now'],
    command: 'objective start',
    optionChecks: { title: 'demo', question: 'why-now' }
  },
  { argv: ['objective', 'status', '--objective', 'OBJ-1'], command: 'objective status', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['objective', 'doctor', '--objective=OBJ-1'], command: 'objective doctor', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['objective', 'stop', '--objective', 'OBJ-1'], command: 'objective stop', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['objective', 'pause', '--objective', 'OBJ-1'], command: 'objective pause', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['objective', 'resume', '--objective', 'OBJ-1'], command: 'objective resume', optionChecks: { objective: 'OBJ-1' } },
  { argv: ['run-analysis', '--analysis-id', 'AN-7'], command: 'run-analysis', optionChecks: { 'analysis-id': 'AN-7' } },
  {
    argv: ['research-loop', '--resume', '--objective=OBJ-1', '--max-iterations', '1'],
    command: 'research-loop',
    optionChecks: { resume: true, objective: 'OBJ-1', 'max-iterations': '1' }
  },
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

test('Phase 9 parser does not reject nested commands merely because extra args are present', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-args-');
  try {
    const result = await runVre(projectRoot, [
      'objective',
      'start',
      '--title',
      'demo',
      '--question=why-now',
      '--budget',
      'maxWallSeconds=60'
    ]);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.doesNotMatch(result.stderr, /unexpected arguments/u);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, 'objective start');
    assert.equal(payload.argv.options.title, 'demo');
    assert.equal(payload.argv.options.question, 'why-now');
    assert.equal(payload.argv.options.budget, 'maxWallSeconds=60');
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
