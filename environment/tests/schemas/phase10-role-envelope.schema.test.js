import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase10-role-envelope.schema.json';

const validRoleEnvelope = {
  schemaVersion: 'phase10.role-envelope.v1',
  roleEnvelopeId: 'ROLEENV-001',
  domainId: 'KDOM-001',
  roleId: 'curator-agent',
  canMutateClaimLedger: true,
  writeScope: 'claim-ledger',
  budgetCategory: 'curation',
  expectedOutputShape: {
    type: 'curation-review'
  },
  createdAt: ISO_TIME
};

test('phase10-role-envelope.schema accepts explicit curator contract fields', async () => {
  await expectValid(SCHEMA_FILE, validRoleEnvelope);
});

test('phase10-role-envelope.schema requires canMutateClaimLedger', async () => {
  const fixture = clone(validRoleEnvelope);
  delete fixture.canMutateClaimLedger;

  await expectInvalid(SCHEMA_FILE, fixture, /required/u);
});

test('phase10-role-envelope.schema rejects runtime role-matrix fields', async () => {
  const fixture = clone(validRoleEnvelope);
  fixture.runtimeRole = 'enabled';

  await expectInvalid(SCHEMA_FILE, fixture, /additional/u);
});
