import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  classifyLockOpenError,
  controlLocksDir,
  withLock,
} from '../../control/_io.js';

function makeEpermError() {
  // Mirrors the Windows libuv EPERM transient seen on open(lockPath, 'wx').
  const error = new Error("EPERM: operation not permitted, open 'lock'");
  error.code = 'EPERM';
  error.errno = -4048;
  error.syscall = 'open';
  return error;
}

// classifyLockOpenError decides how acquireLock reacts to an error thrown by
// open(lockPath, 'wx'):
//   'contended' -> the lock file exists (POSIX EEXIST): stale-check + retry
//   'transient' -> Windows EPERM raised by a brief sharing/delete-pending race:
//                  back off and retry, but never stale-remove a possibly-live lock
//   'fatal'     -> everything else, including POSIX EPERM (a real permission error)

test('classifyLockOpenError treats EEXIST as contended on every platform', () => {
  assert.equal(classifyLockOpenError({ code: 'EEXIST' }, 'linux'), 'contended');
  assert.equal(classifyLockOpenError({ code: 'EEXIST' }, 'win32'), 'contended');
});

test('classifyLockOpenError treats Windows EPERM as a transient contention signal', () => {
  assert.equal(classifyLockOpenError({ code: 'EPERM' }, 'win32'), 'transient');
});

test('classifyLockOpenError keeps EPERM fatal off Windows (genuine permission error)', () => {
  assert.equal(classifyLockOpenError({ code: 'EPERM' }, 'linux'), 'fatal');
  assert.equal(classifyLockOpenError({ code: 'EPERM' }, 'darwin'), 'fatal');
});

test('classifyLockOpenError keeps unrelated/ambiguous codes fatal (scoped to EPERM only)', () => {
  assert.equal(classifyLockOpenError({ code: 'ENOENT' }, 'win32'), 'fatal');
  assert.equal(classifyLockOpenError({ code: 'EACCES' }, 'win32'), 'fatal');
  assert.equal(classifyLockOpenError({ code: 'EBUSY' }, 'win32'), 'fatal');
  assert.equal(classifyLockOpenError(null, 'win32'), 'fatal');
  assert.equal(classifyLockOpenError(undefined, 'win32'), 'fatal');
});

test(
  'withLock retries through a Windows EPERM transient and runs the critical section',
  async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'vre-iolock-recover-'));
  try {
    let openCalls = 0;
    const flakyOpen = async (lockPath, flags) => {
      openCalls += 1;
      if (openCalls <= 3) {
        throw makeEpermError();
      }
      return open(lockPath, flags);
    };

    let criticalRuns = 0;
    const result = await withLock(
      project,
      'recover-lock',
      async () => {
        criticalRuns += 1;
        return 'done';
      },
      { openImpl: flakyOpen, platform: 'win32', retryDelayMs: 1, maxRetries: 20 },
    );

    assert.equal(result, 'done');
    assert.equal(criticalRuns, 1);
    assert.equal(openCalls, 4); // 3 EPERM transients + 1 success
    const leftover = await readdir(controlLocksDir(project)).catch(() => []);
    assert.deepEqual(leftover, []); // lock released, nothing stranded
  } finally {
    await rm(project, { recursive: true, force: true });
  }
  },
);

test(
  'withLock keeps a live lock during Windows EPERM backoff and fails bounded',
  async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'vre-iolock-norm-'));
  try {
    // Simulate a peer holding the lock: the lock file already exists on disk.
    const locksDir = controlLocksDir(project);
    await mkdir(locksDir, { recursive: true });
    const heldLockPath = path.join(locksDir, 'held-lock.lock');
    await writeFile(heldLockPath, JSON.stringify({ pid: 999999 }), 'utf8');

    const alwaysEperm = async () => {
      throw makeEpermError();
    };

    await assert.rejects(
      () =>
        withLock(
          project,
          'held-lock',
          async () => {
            throw new Error('critical section must not run while the lock is held');
          },
          { openImpl: alwaysEperm, platform: 'win32', retryDelayMs: 1, maxRetries: 5 },
        ),
      (error) => {
        assert.match(error.message, /Failed to acquire control-plane lock/u);
        assert.equal(error.cause?.code, 'EPERM');
        return true;
      },
    );

    // The peer's lock file MUST survive; transient EPERM must not stale-remove it.
    const survivor = await readFile(heldLockPath, 'utf8');
    assert.match(survivor, /999999/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
  },
);

test(
  'withLock surfaces a POSIX EPERM immediately as a real permission error',
  async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'vre-iolock-posix-'));
  try {
    let openCalls = 0;
    const alwaysEperm = async () => {
      openCalls += 1;
      throw makeEpermError();
    };

    await assert.rejects(
      () =>
        withLock(project, 'posix-lock', async () => {}, {
          openImpl: alwaysEperm,
          platform: 'linux',
          retryDelayMs: 1,
          maxRetries: 20,
        }),
      (error) => {
        assert.equal(error.code, 'EPERM');
        assert.doesNotMatch(error.message, /Failed to acquire/u);
        return true;
      },
    );
    assert.equal(openCalls, 1); // fatal: surfaced on the first attempt, no retry
  } finally {
    await rm(project, { recursive: true, force: true });
  }
  },
);
