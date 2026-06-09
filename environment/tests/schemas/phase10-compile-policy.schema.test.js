import assert from 'node:assert/strict';
import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid, loadPhase10Validator } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-compile-policy.schema.json';
const POLICY_ENUM = ['two-pass', 'three-pass-r2-audited'];

const validCompilePolicy = {
  schemaVersion: 'phase10.compile-policy.v1',
  compilePolicyId: 'CP-001',
  policy: 'two-pass',
  rationale: 'At least two passes are required before wiki page publication.',
  requiredReviewer: 'reviewer-2',
  createdAt: ISO_TIME
};

test('phase10-compile-policy.schema accepts the two-pass floor', async () => {
  await expectValid(SCHEMA_FILE, validCompilePolicy);
});

test('phase10-compile-policy.schema rejects policy values below the floor', async () => {
  const fixture = clone(validCompilePolicy);
  fixture.policy = 'single-pass';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum/u);
});

test('phase10-compile-policy.schema pins reviewed policy enum order', async () => {
  const validator = await loadPhase10Validator(SCHEMA_FILE);
  assert.deepEqual(validator.schema.properties.policy.enum, POLICY_ENUM);
});
