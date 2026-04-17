import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  createNonRepoCwd,
  repoRoot,
  runVre
} from './_fixture.js';

test('bin/vre exits 3 when subcommand is missing', async () => {
  const projectRoot = await createCliFixtureProject('vre-missing-sub-');
  try {
    const result = await runVre(projectRoot, []);
    assert.equal(result.code, 3);
    assert.match(result.stderr, /usage/u);
    assert.equal(result.stdout, '');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre exits 2 for unknown subcommands and lists the allowlist', async () => {
  const projectRoot = await createCliFixtureProject('vre-unknown-sub-');
  try {
    const result = await runVre(projectRoot, ['nonexistent']);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /flow-status/u);
    assert.match(result.stderr, /sync-memory/u);
    assert.match(result.stderr, /orchestrator-status/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre exits 3 for unexpected args', async () => {
  const projectRoot = await createCliFixtureProject('vre-extra-args-');
  try {
    const result = await runVre(projectRoot, ['flow-status', '--bogus']);
    assert.equal(result.code, 3);
    assert.match(result.stderr, /unexpected arguments/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre exits 3 outside a VRE repo root without writing attempts', async () => {
  const projectRoot = await createCliFixtureProject('vre-not-root-source-');
  const nonRepoCwd = await createNonRepoCwd();
  try {
    const result = await runVre(projectRoot, ['flow-status'], { cwd: nonRepoCwd });
    assert.equal(result.code, 3);
    assert.match(result.stderr, /not inside a VRE repository/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
    await rm(nonRepoCwd, { recursive: true, force: true });
  }
});

test('bin/vre maps middleware budget hard stop to exit 4', async () => {
  const projectRoot = await createCliFixtureProject('vre-hard-stop-');
  try {
    const result = await runVre(projectRoot, ['flow-status'], {
      env: {
        VRE_BUDGET_MAX_USD: '10',
        VRE_BUDGET_ESTIMATED_COST_USD: '11'
      }
    });
    assert.equal(result.code, 4);
    assert.match(result.stderr, /Budget exceeded/u);
    assert.equal(result.stdout, '');

    const attempts = (await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'attempts.jsonl'),
      'utf8'
    )).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(attempts.at(-1).status, 'blocked');
    assert.equal(attempts.at(-1).errorCode, 'BUDGET_HARD_STOP');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre can be invoked from a nested directory inside the repo root', async () => {
  const projectRoot = await createCliFixtureProject('vre-nested-cwd-');
  try {
    const nested = path.join(projectRoot, 'environment', 'tests');
    const result = await runVre(projectRoot, ['flow-status'], { cwd: nested });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^flow-status\tATT-/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre fixture helper does not accidentally run against the source repo', () => {
  assert.match(repoRoot, /vibe-research-environment$/u);
});
