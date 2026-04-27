import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runnerPath = path.join(repoRoot, 'environment', 'orchestrator', 'reviewed-role-runner.js');

const MIN_RUNNER_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'TEMP', 'TMP'];

function buildMinimalEnv(extra = {}) {
  const env = {};
  for (const key of MIN_RUNNER_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...extra };
}

async function buildEnvelopeFile({
  envelopeDir,
  workspaceRoot,
  dispatchParentPid,
  objectiveId = 'OBJ-RUNNER-TEST',
  taskId = 'TASK-RUNNER',
  roleId = 'continuity-agent',
}) {
  const envelopePath = path.join(envelopeDir, 'phase9-role-envelope.json');
  const envelope = {
    schemaVersion: 'phase9.role-envelope.v1',
    objectiveId,
    stageId: 'analysis',
    roleId,
    taskId,
    dispatchParentPid,
    sessionIsolation: {
      childSessionId: 'sess-runner-child',
      workspaceRoot,
      scratchRoot: null,
      inheritChatHistory: false,
    },
    handshakeSubset: {},
    handoffCursor: null,
    allowedActions: ['propose-handoff'],
    activeGates: [],
    stopConditions: { onBudgetExhausted: 'pause' },
    expectedOutputShape: { kind: 'phase9.handoff.v1' },
    generatedAt: '2026-04-27T08:00:00Z',
    generatedBySession: 'sess-runner-parent',
  };
  await writeFile(envelopePath, JSON.stringify(envelope, null, 2), 'utf8');
  return { envelopePath, envelope };
}

async function spawnRunner({
  envelopePath,
  cwd,
  env,
  preloadModulePath = null,
}) {
  const args = preloadModulePath
    ? ['--require', preloadModulePath, runnerPath, '--envelope', envelopePath]
    : [runnerPath, '--envelope', envelopePath];
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd,
      env,
      encoding: 'utf8',
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code ?? null,
    };
  }
}

function parseLastJsonLine(text) {
  const lines = text.trim().split(/\r?\n/u).filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

test('reviewed-role-runner exits 0 with cold-child-severance-verified when all axes pass', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-ok-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: process.pid,
    });
    const { stdout, stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
      }),
    });
    assert.equal(exitCode, 0, `expected exit 0, got ${exitCode}; stderr=${stderr}`);
    const payload = parseLastJsonLine(stdout);
    assert.equal(payload.status, 'cold-child-severance-verified');
    assert.equal(payload.objectiveId, 'OBJ-RUNNER-TEST');
    assert.equal(payload.dispatchParentPid, process.pid);
    assert.equal(payload.axes.length, 6);
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 2 with E_ORPHANED_SPAWN_PARENT when dispatchParentPid mismatches', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-orphan-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: 999_999, // intentionally wrong; child's real ppid will be process.pid
    });
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
      }),
    });
    assert.equal(exitCode, 2);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-severance-failed');
    assert.equal(payload.code, 'E_ORPHANED_SPAWN_PARENT');
    assert.equal(payload.axis, 'process-identity');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 2 with E_INHERITED_SESSION_TOKEN when env carries CLAUDE_API_KEY', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-token-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: process.pid,
    });
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
        CLAUDE_API_KEY: 'sk-test-leak', // forbidden token
      }),
    });
    assert.equal(exitCode, 2);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-severance-failed');
    assert.equal(payload.code, 'E_INHERITED_SESSION_TOKEN');
    assert.equal(payload.axis, 'environment');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 2 with E_ENV_ALLOWLIST_VIOLATED when env carries a foreign key', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-foreign-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: process.pid,
    });
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
        SOMETHING_UNEXPECTED: 'value', // outside allowlist, not deny-regex
      }),
    });
    assert.equal(exitCode, 2);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-severance-failed');
    assert.equal(payload.code, 'E_ENV_ALLOWLIST_VIOLATED');
    assert.equal(payload.axis, 'environment');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 2 with E_CWD_ESCAPE when cwd does not match workspaceRoot', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-cwd-ws-')));
  const otherDir = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-cwd-other-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: process.pid,
    });
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: otherDir, // intentionally wrong cwd
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
      }),
    });
    assert.equal(exitCode, 2);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-severance-failed');
    assert.equal(payload.code, 'E_CWD_ESCAPE');
    assert.equal(payload.axis, 'working-directory');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(otherDir, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 2 with E_INHERITED_SESSION_TOKEN when preload sets a forbidden global', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-rt-state-')));
  try {
    const { envelopePath } = await buildEnvelopeFile({
      envelopeDir: tempWorkspace,
      workspaceRoot: tempWorkspace,
      dispatchParentPid: process.pid,
    });
    const preloadPath = path.join(tempWorkspace, 'preload.cjs');
    await writeFile(
      preloadPath,
      `globalThis.__VRE_SKILL_CACHE__ = { inherited: true };\n`,
      'utf8',
    );
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv({
        VRE_ROOT: tempWorkspace,
        PHASE9_OBJECTIVE_ID: 'OBJ-RUNNER-TEST',
        PHASE9_TASK_ID: 'TASK-RUNNER',
        PHASE9_ENVELOPE_PATH: envelopePath,
      }),
      preloadModulePath: preloadPath,
    });
    assert.equal(exitCode, 2);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-severance-failed');
    assert.equal(payload.code, 'E_INHERITED_SESSION_TOKEN');
    assert.equal(payload.axis, 'runtime-state');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 1 with E_RUNNER_USAGE when --envelope is missing', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-usage-')));
  try {
    const result = await execFileAsync(process.execPath, [runnerPath], {
      cwd: tempWorkspace,
      env: buildMinimalEnv(),
      encoding: 'utf8',
      windowsHide: true,
    }).catch((error) => ({
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.code ?? null,
    }));
    assert.equal(result.exitCode, 1);
    const payload = parseLastJsonLine(result.stderr);
    assert.equal(payload.status, 'cold-child-runner-error');
    assert.equal(payload.code, 'E_RUNNER_USAGE');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('reviewed-role-runner exits 1 with E_RUNNER_ENVELOPE_INVALID when envelope schema is wrong', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'runner-bad-env-')));
  try {
    const envelopePath = path.join(tempWorkspace, 'envelope.json');
    await writeFile(envelopePath, JSON.stringify({ schemaVersion: 'wrong.v0' }), 'utf8');
    const { stderr, exitCode } = await spawnRunner({
      envelopePath,
      cwd: tempWorkspace,
      env: buildMinimalEnv(),
    });
    assert.equal(exitCode, 1);
    const payload = parseLastJsonLine(stderr);
    assert.equal(payload.status, 'cold-child-runner-error');
    assert.equal(payload.code, 'E_RUNNER_ENVELOPE_INVALID');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});
