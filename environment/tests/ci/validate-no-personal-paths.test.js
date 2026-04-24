import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { collectFiles, repoRoot } from './_helpers.js';
import validateNoPersonalPaths from './validate-no-personal-paths.js';

async function withRepoTempFixture(prefix, fn) {
  const fixtureRoot = await mkdtemp(path.join(repoRoot, `.tmp-${prefix}`));
  try {
    await fn(fixtureRoot);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test('collectFiles skips repo-root .tmp fixture directories', async () => {
  await withRepoTempFixture('collect-files-', async (fixtureRoot) => {
    await mkdir(path.join(fixtureRoot, 'environment', 'schemas'), { recursive: true });
    await writeFile(path.join(fixtureRoot, 'environment', 'schemas', 'shadow.schema.json'), '{}\n', 'utf8');

    const files = await collectFiles('.', {
      include: (file) => file.endsWith('.schema.json')
    });

    assert.equal(files.some((file) => file.includes(path.basename(fixtureRoot))), false);
    assert.equal(files.some((file) => file === 'environment/schemas/phase9-objective.schema.json'), true);
  });
});

test('validate-no-personal-paths ignores forbidden content inside repo-root .tmp fixture directories', async () => {
  await withRepoTempFixture('no-personal-paths-', async (fixtureRoot) => {
    await mkdir(path.join(fixtureRoot, 'environment', 'schemas'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'environment', 'schemas', 'phase9-shadow.schema.json'),
      JSON.stringify({
        leakedPath: 'C:\\Users\\Fixture\\shadow'
      }, null, 2),
      'utf8'
    );

    await assert.doesNotReject(validateNoPersonalPaths());
  });
});
