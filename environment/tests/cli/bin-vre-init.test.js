/**
 * Dogfood-pass 2026-04-18: bin/vre init is the onboarding entrypoint.
 *
 * It must:
 *   1. Succeed from a fresh fixture (exit 0).
 *   2. Create `.vibe-science-environment/` + `control/` + `orchestrator/`.
 *   3. Report kernel state explicitly on stdout (OK or degraded with a hint).
 *   4. List the three wired subcommands + the agent-only markdown set.
 *   5. Reject unexpected positional arguments (exit 3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCliFixtureProject,
  cleanupCliFixtureProject,
  runVre,
} from './_fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeKernelRoot = path.resolve(here, '..', 'fixtures', 'fake-kernel-sibling');

async function dirExists(target) {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

test('vre init creates the runtime state tree and reports kernel state', async () => {
  const projectRoot = await createCliFixtureProject('vre-cli-init-');
  try {
    const result = await runVre(projectRoot, ['init'], {
      env: { VRE_KERNEL_PATH: '' },
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.match(result.stdout, /vre init:/u);
    assert.match(result.stdout, /state root:.*\.vibe-science-environment/u);
    assert.match(result.stdout, /kernel:\s+(OK|degraded)/u);
    assert.match(result.stdout, /next steps:/u);
    assert.match(result.stdout, /vre flow-status/u);
    assert.match(result.stdout, /flow-literature.*flow-experiment/u);

    assert.ok(
      await dirExists(path.join(projectRoot, '.vibe-science-environment', 'control')),
      'control/ subdir must exist after init',
    );
    assert.ok(
      await dirExists(path.join(projectRoot, '.vibe-science-environment', 'orchestrator')),
      'orchestrator/ subdir must exist after init',
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('vre init with VRE_KERNEL_PATH pointing at a real CLI reports kernel OK', async () => {
  const projectRoot = await createCliFixtureProject('vre-cli-init-wired-');
  try {
    const result = await runVre(projectRoot, ['init'], {
      env: { VRE_KERNEL_PATH: fakeKernelRoot },
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.match(result.stdout, /kernel:\s+OK/u);
    assert.match(result.stdout, /env at/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('vre init rejects positional arguments with exit 3', async () => {
  const projectRoot = await createCliFixtureProject('vre-cli-init-badargs-');
  try {
    const result = await runVre(projectRoot, ['init', 'unexpected'], {
      env: { VRE_KERNEL_PATH: '' },
    });
    assert.equal(result.code, 3);
    assert.match(result.stderr, /unexpected arguments/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
