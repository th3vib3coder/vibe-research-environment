import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  ISO_DATE,
  ISO_DATE_LATER,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'lane-run-record.schema.json',
  suiteName: 'lane-run-record.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'ORCH-RUN-2026-04-10-001',
    laneId: 'execution',
    taskId: 'ORCH-TASK-2026-04-10-001',
    providerRef: 'openai/codex',
    integrationKind: 'local-cli',
    fallbackApplied: false,
    supervisionCapability: 'streaming',
    status: 'completed',
    attemptNumber: 1,
    threadId: 'thread-orch-001',
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactRefs: [
      '.vibe-science-environment/results/experiments/EXP-001/'
    ],
    summary: 'Execution lane completed the bounded task successfully.',
    errorCode: null,
    warningCount: 0
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'RUN-2026-04-10-001',
    laneId: 'executor',
    taskId: 'ORCH-TASK-2026-04-10-001',
    providerRef: 'openai/codex',
    integrationKind: 'local-cli',
    fallbackApplied: 'sometimes',
    supervisionCapability: 'realtime',
    status: 'stuck',
    attemptNumber: 0,
    threadId: 'thread-orch-002',
    startedAt: 'now',
    endedAt: ISO_DATE_LATER,
    artifactRefs: [],
    summary: 'This fixture should fail.',
    errorCode: null,
    warningCount: 0
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'ORCH-RUN-2026-04-10-002',
    laneId: 'review',
    taskId: null,
    providerRef: 'anthropic/claude-code',
    integrationKind: 'local-cli',
    fallbackApplied: false,
    supervisionCapability: 'output-only',
    status: 'degraded',
    attemptNumber: 1,
    threadId: null,
    startedAt: ISO_DATE,
    endedAt: null,
    artifactRefs: [],
    summary: null,
    errorCode: 'REVIEW-CONFLICT',
    warningCount: 2
  }
});

// --- WP-169: evidenceMode ↔ integrationKind cross-validation ---

const SCHEMA_URL = new URL('../../schemas/lane-run-record.schema.json', import.meta.url);

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function baseRecord(overrides = {}) {
  return {
    schemaVersion: 'vibe-orch.lane-run-record.v1',
    laneRunId: 'ORCH-RUN-2026-04-18-100',
    laneId: 'review',
    taskId: 'ORCH-TASK-2026-04-18-100',
    providerRef: 'openai/codex',
    integrationKind: 'provider-cli',
    fallbackApplied: false,
    supervisionCapability: 'output-only',
    status: 'completed',
    attemptNumber: 1,
    threadId: null,
    startedAt: ISO_DATE,
    endedAt: ISO_DATE_LATER,
    artifactRefs: [],
    summary: 'WP-169 cross-check fixture',
    errorCode: null,
    warningCount: 0,
    ...overrides,
  };
}

describe('lane-run-record.schema — WP-169 evidenceMode cross-check', () => {
  it('accepts real-cli-binding-codex WITH integrationKind=provider-cli', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: 'real-cli-binding-codex',
      integrationKind: 'provider-cli',
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('accepts real-cli-binding-claude WITH integrationKind=provider-cli', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: 'real-cli-binding-claude',
      integrationKind: 'provider-cli',
      providerRef: 'anthropic/claude',
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('rejects real-cli-binding-codex WITH integrationKind=local-subprocess', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: 'real-cli-binding-codex',
      integrationKind: 'local-subprocess',
    });
    assert.equal(validator(fixture), false, 'cross-check must reject real-cli evidence with non-provider-cli integration');
  });

  it('accepts smoke-real-subprocess with any integrationKind (no allOf constraint)', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: 'smoke-real-subprocess',
      integrationKind: 'local-subprocess',
      providerRef: null,
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('accepts mocked-review with any integrationKind', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: 'mocked-review',
      integrationKind: 'local-cli',
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('accepts legacy record without evidenceMode field (backward-compat)', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      integrationKind: 'local-cli',
      providerRef: 'openai/codex',
    });
    // evidenceMode omitted entirely
    delete fixture.evidenceMode;
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('accepts legacy record with evidenceMode=null', async () => {
    const validator = await loadValidator();
    const fixture = baseRecord({
      evidenceMode: null,
      integrationKind: 'local-cli',
      providerRef: 'openai/codex',
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });
});
