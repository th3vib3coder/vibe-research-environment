import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COLD_CHILD_DENY_REGEX,
  COLD_CHILD_ENV_ALLOWLIST,
  COLD_CHILD_FORBIDDEN_GLOBAL_KEYS,
  ColdChildSeveranceError,
  validateAllSeveranceAxes,
  validateArgv,
  validateEnvironment,
  validateProcessIdentity,
  validateRuntimeState,
  validateStdioAndFds,
  validateWorkingDirectory,
} from '../../orchestrator/cold-child-validator.js';

function expectColdChildError(thunk, code, axis) {
  try {
    thunk();
    assert.fail(`expected ColdChildSeveranceError ${code} on axis ${axis} but call returned`);
  } catch (error) {
    if (!(error instanceof ColdChildSeveranceError)) {
      throw error;
    }
    assert.equal(error.code, code, `expected error.code ${code}, got ${error.code}`);
    assert.equal(error.axis, axis, `expected error.axis ${axis}, got ${error.axis}`);
    return error;
  }
}

async function expectColdChildErrorAsync(thunk, code, axis) {
  try {
    await thunk();
    assert.fail(`expected ColdChildSeveranceError ${code} on axis ${axis} but call returned`);
  } catch (error) {
    if (!(error instanceof ColdChildSeveranceError)) {
      throw error;
    }
    assert.equal(error.code, code, `expected error.code ${code}, got ${error.code}`);
    assert.equal(error.axis, axis, `expected error.axis ${axis}, got ${error.axis}`);
    return error;
  }
}

test('validateProcessIdentity: matching PPID returns ok', () => {
  const result = validateProcessIdentity({
    processPpid: 1234,
    dispatchParentPid: 1234,
    parentAlive: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.axis, 'process-identity');
});

test('validateProcessIdentity: mismatched PPID raises E_ORPHANED_SPAWN_PARENT', () => {
  expectColdChildError(
    () => validateProcessIdentity({
      processPpid: 9999,
      dispatchParentPid: 1234,
      parentAlive: true,
    }),
    'E_ORPHANED_SPAWN_PARENT',
    'process-identity',
  );
});

test('validateProcessIdentity: parent reported not alive raises E_ORPHANED_SPAWN_PARENT', () => {
  expectColdChildError(
    () => validateProcessIdentity({
      processPpid: 1234,
      dispatchParentPid: 1234,
      parentAlive: false,
    }),
    'E_ORPHANED_SPAWN_PARENT',
    'process-identity',
  );
});

test('validateProcessIdentity: invalid PPID type raises E_ORPHANED_SPAWN_PARENT', () => {
  expectColdChildError(
    () => validateProcessIdentity({
      processPpid: 'not-a-number',
      dispatchParentPid: 1234,
      parentAlive: true,
    }),
    'E_ORPHANED_SPAWN_PARENT',
    'process-identity',
  );
});

test('validateEnvironment: only allowlist keys is ok', () => {
  const result = validateEnvironment({
    PATH: '/usr/bin',
    VRE_ROOT: '/repo',
    PHASE9_OBJECTIVE_ID: 'OBJ-1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.allowedKeys.sort(), ['PATH', 'PHASE9_OBJECTIVE_ID', 'VRE_ROOT']);
});

test('validateEnvironment: deny-regex env key raises E_INHERITED_SESSION_TOKEN', () => {
  expectColdChildError(
    () => validateEnvironment({ CLAUDE_API_KEY: 'sk-leak' }),
    'E_INHERITED_SESSION_TOKEN',
    'environment',
  );
});

test('validateEnvironment: foreign allowlist key raises E_ENV_ALLOWLIST_VIOLATED', () => {
  expectColdChildError(
    () => validateEnvironment({ PATH: '/usr/bin', SOMETHING_UNEXPECTED: 'value' }),
    'E_ENV_ALLOWLIST_VIOLATED',
    'environment',
  );
});

test('validateEnvironment: deny-regex value on allowlisted key raises E_INHERITED_SESSION_TOKEN', () => {
  expectColdChildError(
    () => validateEnvironment(
      { PATH: 'CLAUDE_API_KEY=sk-leak' },
      { denyValueRegex: COLD_CHILD_DENY_REGEX },
    ),
    'E_INHERITED_SESSION_TOKEN',
    'environment',
  );
});

test('validateArgv: clean argv returns ok', () => {
  const result = validateArgv([
    '/usr/bin/node',
    '/repo/environment/orchestrator/reviewed-role-runner.js',
    '--envelope',
    '/tmp/envelope.json',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.argvLength, 4);
});

test('validateArgv: deny-regex token raises E_ARGV_LEAK', () => {
  expectColdChildError(
    () => validateArgv([
      '/usr/bin/node',
      '/repo/runner.js',
      'CLAUDE_API_KEY=sk-leak',
    ]),
    'E_ARGV_LEAK',
    'argv',
  );
});

test('validateArgv: non-array raises E_ARGV_LEAK', () => {
  expectColdChildError(
    () => validateArgv('not-an-array'),
    'E_ARGV_LEAK',
    'argv',
  );
});

test('validateWorkingDirectory: matching cwd and workspaceRoot returns ok', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cold-child-cwd-'));
  try {
    const result = await validateWorkingDirectory({
      cwd: tempDir,
      workspaceRoot: tempDir,
    });
    assert.equal(result.ok, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('validateWorkingDirectory: mismatched cwd raises E_CWD_ESCAPE', async () => {
  const tempDirA = await mkdtemp(path.join(tmpdir(), 'cold-child-cwd-a-'));
  const tempDirB = await mkdtemp(path.join(tmpdir(), 'cold-child-cwd-b-'));
  try {
    await expectColdChildErrorAsync(
      () => validateWorkingDirectory({
        cwd: tempDirA,
        workspaceRoot: tempDirB,
      }),
      'E_CWD_ESCAPE',
      'working-directory',
    );
  } finally {
    await rm(tempDirA, { recursive: true, force: true });
    await rm(tempDirB, { recursive: true, force: true });
  }
});

test('validateWorkingDirectory: lexical-inside / canonical-outside via symlink raises E_CWD_ESCAPE', async () => {
  const tempRealRoot = await mkdtemp(path.join(tmpdir(), 'cold-child-real-'));
  const tempLinkParent = await mkdtemp(path.join(tmpdir(), 'cold-child-link-parent-'));
  const linkPath = path.join(tempLinkParent, 'workspace-symlink');
  try {
    // Junction mode is the cross-platform-safe directory link: works on Linux/Mac
    // (treated as 'dir' symlink) and on Windows without admin privilege.
    await symlink(tempRealRoot, linkPath, 'junction');
    // The symlink target resolves to tempRealRoot (canonical), but the lexical
    // path (tempLinkParent/workspace-symlink) is inside tempLinkParent. If we
    // pass cwd=tempLinkParent and workspaceRoot=linkPath, canonical cwd is
    // tempLinkParent and canonical workspace is tempRealRoot — they differ.
    await expectColdChildErrorAsync(
      () => validateWorkingDirectory({
        cwd: tempLinkParent,
        workspaceRoot: linkPath,
      }),
      'E_CWD_ESCAPE',
      'working-directory',
    );
  } finally {
    await rm(tempRealRoot, { recursive: true, force: true });
    await rm(tempLinkParent, { recursive: true, force: true });
  }
});

test('validateStdioAndFds: piped stdio with no extra fds returns ok', () => {
  const result = validateStdioAndFds({ isTTY: false, extraFdsDetected: [] });
  assert.equal(result.ok, true);
});

test('validateStdioAndFds: TTY inherited raises E_FD_LEAK', () => {
  expectColdChildError(
    () => validateStdioAndFds({ isTTY: true, extraFdsDetected: [] }),
    'E_FD_LEAK',
    'stdio-fd',
  );
});

test('validateStdioAndFds: extra fds detected raises E_FD_LEAK', () => {
  expectColdChildError(
    () => validateStdioAndFds({ isTTY: false, extraFdsDetected: [3, 4] }),
    'E_FD_LEAK',
    'stdio-fd',
  );
});

test('validateStdioAndFds: null extraFdsDetected (Windows best-effort) returns ok', () => {
  const result = validateStdioAndFds({ isTTY: false, extraFdsDetected: null });
  assert.equal(result.ok, true);
});

test('validateRuntimeState: empty globals returns ok', () => {
  const result = validateRuntimeState({});
  assert.equal(result.ok, true);
});

test('validateRuntimeState: any forbidden global key raises E_INHERITED_SESSION_TOKEN', () => {
  for (const forbidden of COLD_CHILD_FORBIDDEN_GLOBAL_KEYS) {
    expectColdChildError(
      () => validateRuntimeState({ [forbidden]: 'inherited' }),
      'E_INHERITED_SESSION_TOKEN',
      'runtime-state',
    );
  }
});

test('validateAllSeveranceAxes: all axes pass with clean inputs', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cold-child-all-'));
  try {
    const result = await validateAllSeveranceAxes({
      processPpid: 4242,
      dispatchParentPid: 4242,
      parentAlive: true,
      env: { PATH: '/usr/bin', VRE_ROOT: tempDir },
      argv: ['/usr/bin/node', '/repo/runner.js', '--envelope', '/tmp/x.json'],
      cwd: tempDir,
      workspaceRoot: tempDir,
      isTTY: false,
      extraFdsDetected: [],
      globals: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.axes.length, 6);
    assert.deepEqual(
      result.axes.map((axis) => axis.axis),
      ['process-identity', 'environment', 'argv', 'working-directory', 'stdio-fd', 'runtime-state'],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('validateAllSeveranceAxes: short-circuits on first failing axis', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cold-child-short-'));
  try {
    await expectColdChildErrorAsync(
      () => validateAllSeveranceAxes({
        processPpid: 1, // mismatch — fails first
        dispatchParentPid: 9999,
        parentAlive: true,
        env: { CLAUDE_API_KEY: 'leak' }, // would also fail, but axis 1 fires first
        argv: [],
        cwd: tempDir,
        workspaceRoot: tempDir,
        isTTY: false,
        extraFdsDetected: [],
        globals: {},
      }),
      'E_ORPHANED_SPAWN_PARENT',
      'process-identity',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('COLD_CHILD_ENV_ALLOWLIST matches the spec file 07 line 57-59 list', () => {
  assert.deepEqual([...COLD_CHILD_ENV_ALLOWLIST].sort(), [
    'HOME',
    'PATH',
    'PHASE9_ENVELOPE_PATH',
    'PHASE9_OBJECTIVE_ID',
    'PHASE9_TASK_ID',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'VRE_ROOT',
  ]);
});

test('COLD_CHILD_DENY_REGEX matches the spec file 07 line 61 deny prefixes', () => {
  for (const prefix of ['CLAUDE_', 'ANTHROPIC_', 'SESSION_', 'VRE_SESSION_', 'SKILL_CACHE_']) {
    assert.equal(COLD_CHILD_DENY_REGEX.test(`${prefix}KEY`), true, `expected ${prefix}KEY to match`);
  }
  for (const safe of ['VRE_ROOT', 'PHASE9_OBJECTIVE_ID', 'PATH', 'HOME']) {
    assert.equal(COLD_CHILD_DENY_REGEX.test(safe), false, `expected ${safe} not to match`);
  }
});
