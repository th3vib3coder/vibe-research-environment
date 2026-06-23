import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'environment',
  'schemas',
  'phase14-adversarial-verdict.schema.json'
);

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

function validVerdict(overrides = {}) {
  return {
    schemaVersion: 'phase14.adversarial-verdict.v1',
    'event-record': {
      eventId: 'EV-TL4-2-001',
      kind: 'phase14-adversarial-verdict',
      verdict: 'ACCEPT',
      claimProfile: {
        claimId: 'CLAIM-HGSOC-ENDO-001',
        quantitative: true
      },
      details: {
        counterEvidenceSearched: true,
        sfiInjected: true,
        confounderHarnessChecked: true,
        salvagenteSeedProduced: false
      },
      metadata: {
        provenanceClass: 'adversarial-verdict',
        provenanceUse: 'review-survival-metadata',
        law13Provenance: false,
        scientificEvidence: false,
        confidenceDelta: 0,
        runtimeOpened: false
      },
      runtimeOpened: false,
      providerAutomationInvoked: false,
      obdkUsed: false,
      realDataRead: false,
      reviewedApiUsed: false,
      claimExportOpened: false,
      graphifyOpened: false,
      unattendedRuntimeOpened: false
    },
    ...overrides
  };
}

function validationDetails(validator) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

test('phase14-adversarial-verdict.schema accepts a complete U1 verdict record', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();

  assert.equal(validator(verdict), true, validationDetails(validator));
});

test('phase14-adversarial-verdict.schema requires all four U1 booleans under event-record.details', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();
  delete verdict['event-record'].details.sfiInjected;

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /required/u);
});

test('phase14-adversarial-verdict.schema rejects U1 booleans outside details', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict({
    counterEvidenceSearched: true
  });

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /additional properties/u);
});

test('phase14-adversarial-verdict.schema pins closed runtime and automation flags', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();
  verdict['event-record'].providerAutomationInvoked = true;

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /constant|const/u);
});

test('phase14-adversarial-verdict.schema keeps adversarial verdict metadata out of LAW13 provenance', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();
  verdict['event-record'].metadata.law13Provenance = true;

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /constant|const/u);
});

test('phase14-adversarial-verdict.schema rejects scientific-evidence or confidence authority', async () => {
  const validator = await loadValidator();
  const scientific = validVerdict();
  scientific['event-record'].metadata.scientificEvidence = true;

  assert.equal(validator(scientific), false);
  assert.match(validationDetails(validator), /constant|const/u);

  const confidence = validVerdict();
  confidence['event-record'].metadata.confidenceDelta = 0.1;

  assert.equal(validator(confidence), false);
  assert.match(validationDetails(validator), /constant|const/u);
});

test('phase14-adversarial-verdict.schema rejects metadata runtime opening', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();
  verdict['event-record'].metadata.runtimeOpened = true;

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /constant|const/u);
});

test('phase14-adversarial-verdict.schema requires a seed reference when present', async () => {
  const validator = await loadValidator();
  const verdict = validVerdict();
  verdict['event-record'].details.serendipitySeedRef = '';

  assert.equal(validator(verdict), false);
  assert.match(validationDetails(validator), /must NOT have fewer than 1 characters|minLength/u);
});
