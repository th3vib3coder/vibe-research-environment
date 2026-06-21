import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { ISO_DATE, ISO_DATE_LATER } from './schema-test-helper.js';

const schemaUrl = new URL('../../schemas/direction-record.schema.json', import.meta.url);

async function loadValidator() {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

function validRecord(overrides = {}) {
  return {
    schemaVersion: 'vibe-env.direction-record.v1',
    directionId: 'DIR-HGSOC-CXCL13-CD8',
    summary: 'Track CXCL13-positive CD8 signals in HGSOC public datasets',
    state: 'killed',
    reason: 'Repeated analysis showed batch-driven signal',
    evidenceRefs: [
      'claim:C-001',
      'event:EV-0001'
    ],
    doNotRepeatUnless: {
      kind: 'new-dataset',
      detail: 'A new independent HGSOC cohort is available'
    },
    createdAt: ISO_DATE,
    updatedAt: ISO_DATE_LATER,
    history: [
      {
        state: 'tried',
        reason: 'Initial literature and GEO scan',
        at: ISO_DATE
      }
    ],
    ...overrides
  };
}

async function assertValid(record) {
  const validate = await loadValidator();
  assert.equal(validate(record), true, JSON.stringify(validate.errors ?? []));
}

async function assertInvalid(record) {
  const validate = await loadValidator();
  assert.equal(validate(record), false, 'record unexpectedly validated');
}

describe('direction-record.schema', () => {
  it('accepts a valid killed direction with a no-repeat condition', async () => {
    await assertValid(validRecord());
  });

  it('rejects state values outside the reviewed lifecycle enum', async () => {
    await assertInvalid(validRecord({ state: 'ignored' }));
  });

  it('requires doNotRepeatUnless for killed and contradicted directions', async () => {
    const killed = validRecord();
    delete killed.doNotRepeatUnless;
    await assertInvalid(killed);

    const contradicted = validRecord({ state: 'contradicted' });
    delete contradicted.doNotRepeatUnless;
    await assertInvalid(contradicted);
  });

  it('constrains the no-repeat condition kind and detail', async () => {
    await assertInvalid(validRecord({
      doNotRepeatUnless: {
        kind: 'maybe-later',
        detail: 'unsupported condition kind'
      }
    }));

    await assertInvalid(validRecord({
      doNotRepeatUnless: {
        kind: 'operator-go',
        detail: ''
      }
    }));
  });

  it('requires evidenceRefs to be an array of strings', async () => {
    await assertInvalid(validRecord({ evidenceRefs: 'claim:C-001' }));
    await assertInvalid(validRecord({ evidenceRefs: ['claim:C-001', 42] }));
  });

  it('rejects undeclared root properties', async () => {
    await assertInvalid(validRecord({ runtimeOpened: true }));
  });

  it('validates history states and timestamps', async () => {
    await assertInvalid(validRecord({
      history: [
        {
          state: 'forgotten',
          reason: 'invalid history state',
          at: ISO_DATE
        }
      ]
    }));

    await assertInvalid(validRecord({
      history: [
        {
          state: 'tried',
          reason: 'invalid timestamp',
          at: '2026-03-31'
        }
      ]
    }));
  });
});
