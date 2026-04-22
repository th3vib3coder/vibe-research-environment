import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  expectFixtureValidity,
  loadValidator,
  readFixture
} from './phase9-schema-fixture-helper.js';

const ALLOWLISTED_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'VRE_ROOT',
  'PHASE9_OBJECTIVE_ID',
  'PHASE9_TASK_ID',
  'PHASE9_ENVELOPE_PATH'
]);

const ENV_DENY_REGEX = /^(CLAUDE_|ANTHROPIC_|SESSION_|VRE_SESSION_|SKILL_CACHE_)/u;

async function validateRuntimeSpawnFixture(fixturePath) {
  const fixture = await readFixture(fixturePath);
  const validator = await loadValidator('phase9-role-envelope.schema.json');

  const validEnvelope = validator(fixture.envelope);
  if (!validEnvelope) {
    return {
      ok: false,
      code: 'E_INVALID_ENVELOPE'
    };
  }

  for (const [key, value] of Object.entries(fixture.env ?? {})) {
    if (ENV_DENY_REGEX.test(key) || (typeof value === 'string' && ENV_DENY_REGEX.test(value))) {
      return {
        ok: false,
        code: 'E_ENV_LEAK'
      };
    }

    if (!ALLOWLISTED_ENV_KEYS.has(key)) {
      return {
        ok: false,
        code: 'E_ENV_ALLOWLIST_VIOLATED'
      };
    }
  }

  const expectedCwd = path.resolve(fixture.envelope.sessionIsolation.workspaceRoot);
  const actualCwd = path.resolve(fixture.cwd);
  if (actualCwd !== expectedCwd) {
    return {
      ok: false,
      code: 'E_CWD_ESCAPE'
    };
  }

  return {
    ok: true,
    code: null
  };
}

test('phase9-role-envelope.schema accepts a valid reviewed subprocess envelope', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-role-envelope.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/role-envelope/valid-subprocess.json',
    expectedValid: true
  });
});

test('phase9-role-envelope.schema rejects a fixture missing sessionIsolation', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-role-envelope.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/role-envelope/invalid-missing-session-isolation.json',
    expectedValid: false
  });
});

test('phase9-role-envelope.schema rejects a fixture missing roleId', async () => {
  await expectFixtureValidity({
    schemaFile: 'phase9-role-envelope.schema.json',
    fixturePath: 'environment/tests/fixtures/phase9/role-envelope/invalid-missing-role.json',
    expectedValid: false
  });
});

test('phase9 runtime-spawn fixtures fail closed on env leaks and cwd escape', async () => {
  const envLeak = await validateRuntimeSpawnFixture(
    'environment/tests/fixtures/phase9/runtime-spawn/invalid-env-leak.json'
  );
  assert.equal(envLeak.ok, false);
  assert.equal(envLeak.code, 'E_ENV_LEAK');

  const cwdEscape = await validateRuntimeSpawnFixture(
    'environment/tests/fixtures/phase9/runtime-spawn/invalid-cwd-escape.json'
  );
  assert.equal(cwdEscape.ok, false);
  assert.equal(cwdEscape.code, 'E_CWD_ESCAPE');
});
