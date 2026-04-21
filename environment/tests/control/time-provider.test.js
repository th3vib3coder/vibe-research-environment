import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  TEST_CLOCK_OFFSET_SCHEMA_VERSION,
  nowIso,
  nowMs,
  statMtimeMs
} from '../../control/time-provider.js';

const execFileAsync = promisify(execFile);
const CHILD_SCRIPT = path.resolve(
  process.cwd(),
  'environment/tests/control/_time-provider-child.mjs'
);
const OFFSET_MS = 72 * 60 * 60 * 1000;

function offsetPath(projectRoot) {
  return path.join(
    projectRoot,
    '.vibe-science-environment',
    'control',
    'test-clock-offset.json'
  );
}

async function writeOffset(projectRoot, offsetMs) {
  const targetPath = offsetPath(projectRoot);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    `${JSON.stringify(
      {
        schemaVersion: TEST_CLOCK_OFFSET_SCHEMA_VERSION,
        offsetMs
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function assertNear(actual, expected, toleranceMs, label) {
  assert.ok(
    Math.abs(actual - expected) <= toleranceMs,
    `${label}: expected ${actual} to be within ${toleranceMs}ms of ${expected}`
  );
}

describe('time-provider', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-time-provider-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('parent and child process observe the same reviewed clock offset', async () => {
    await writeOffset(projectRoot, OFFSET_MS);

    const realBefore = Date.now();
    const parentNowMs = await nowMs(projectRoot);
    const parentNowIso = await nowIso(projectRoot);
    const { stdout } = await execFileAsync(process.execPath, [CHILD_SCRIPT, projectRoot], {
      encoding: 'utf8'
    });
    const childPayload = JSON.parse(stdout);

    assertNear(parentNowMs - realBefore, OFFSET_MS, 2_500, 'parent offset');
    assertNear(childPayload.nowMs - realBefore, OFFSET_MS, 2_500, 'child offset');
    assertNear(parentNowMs, childPayload.nowMs, 2_000, 'parent/child nowMs');
    assertNear(Date.parse(parentNowIso), parentNowMs, 2_000, 'parent nowIso');
    assertNear(Date.parse(childPayload.nowIso), childPayload.nowMs, 2_000, 'child nowIso');
  });

  it('removing the offset file restores real time', async () => {
    await writeOffset(projectRoot, OFFSET_MS);

    const shiftedNowMs = await nowMs(projectRoot);
    assertNear(shiftedNowMs - Date.now(), OFFSET_MS, 2_500, 'shifted clock');

    await unlink(offsetPath(projectRoot));

    const restoredNowMs = await nowMs(projectRoot);
    assertNear(restoredNowMs, Date.now(), 2_000, 'restored clock');
  });

  it('statMtimeMs reports file mtimes without applying the synthetic offset', async () => {
    const samplePath = path.join(projectRoot, 'sample.txt');
    await writeFile(samplePath, 'sample\n', 'utf8');
    await writeOffset(projectRoot, OFFSET_MS);

    const directStat = await statMtimeMs(projectRoot, samplePath);
    const relativeStat = await statMtimeMs(projectRoot, 'sample.txt');

    assertNear(directStat, relativeStat, 5, 'absolute vs relative mtime');
    assert.ok(directStat <= Date.now() + 2_000, 'mtime must remain real filesystem time');
  });
});
