import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from './_fixture.js';
import { validateCommandContract } from '../ci/validate-commands-to-js.js';

test('bin/vre summary paths use forward slashes', async () => {
  const projectRoot = await createCliFixtureProject('vre-forward-slashes-');
  try {
    const result = await runVre(projectRoot, ['flow-status']);
    assert.equal(result.code, 0);
    const fields = result.stdout.trim().split('\t');
    assert.equal(fields[2], '.vibe-science-environment/control/session.json');
    assert.equal(fields[2].includes('\\'), false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('commands-to-js validator accepts a clean fixture', async () => {
  const markdown = await readFile(
    path.join(repoRoot, 'environment', 'tests', 'ci', 'fixtures', 'commands-to-js', 'clean.md'),
    'utf8'
  );
  await validateCommandContract('fixtures/clean.md', markdown);
});

test('commands-to-js validator rejects a drifted fixture', async () => {
  const markdown = await readFile(
    path.join(repoRoot, 'environment', 'tests', 'ci', 'fixtures', 'commands-to-js', 'drifted.md'),
    'utf8'
  );
  await assert.rejects(
    () => validateCommandContract('fixtures/drifted.md', markdown),
    /not exported as a function/u
  );
});
