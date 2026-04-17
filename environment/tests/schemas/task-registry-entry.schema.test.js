import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { defineSchemaFixtureTests } from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'task-registry-entry.schema.json',
  suiteName: 'task-registry-entry.schema',
  validFixture: {
    schemaVersion: 'vibe-env.task-registry-entry.v1',
    taskKind: 'session-digest-export',
    lane: 'execution',
    requiredCapability: 'programmatic',
    helperModule: 'environment/flows/session-digest.js',
    helperExport: 'exportSessionDigest',
    inputSchema: null,
    outputContract: {
      summary: 'string',
      artifactRefs: ['jsonPath', 'markdownPath'],
      warningCount: 'integer'
    },
    routerKeywords: ['session digest', 'digest export', 'export digest'],
    degradesTo: 'escalate'
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.task-registry-entry.v1',
    taskKind: 'BAD_KIND',
    lane: 'execution',
    requiredCapability: 'programmatic',
    helperModule: 'environment/flows/session-digest.js',
    helperExport: 'exportSessionDigest',
    inputSchema: null,
    outputContract: {
      summary: 'string',
      artifactRefs: [],
      warningCount: 'integer'
    },
    routerKeywords: ['session digest'],
    degradesTo: 'escalate'
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.task-registry-entry.v1',
    taskKind: 'literature-flow-register',
    lane: 'execution',
    requiredCapability: 'programmatic',
    helperModule: 'environment/flows/literature.js',
    helperExport: 'registerPaper',
    inputSchema: 'environment/schemas/literature-register-input.schema.json',
    outputContract: {
      summary: 'string',
      artifactRefs: ['lit-paper/<PAPER_ID>.json'],
      warningCount: 'integer>=0',
      payload: { note: 'paper + flow-state' }
    },
    routerKeywords: ['register paper', 'add paper', 'literature register'],
    degradesTo: 'noop'
  }
});

// --- WP-116 additional constraints ---

const SCHEMA_URL = new URL('../../schemas/task-registry-entry.schema.json', import.meta.url);

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function baseEntry(overrides = {}) {
  return {
    schemaVersion: 'vibe-env.task-registry-entry.v1',
    taskKind: 'session-digest-export',
    lane: 'execution',
    requiredCapability: 'programmatic',
    helperModule: 'environment/flows/session-digest.js',
    helperExport: 'exportSessionDigest',
    inputSchema: null,
    outputContract: {
      summary: 'string',
      artifactRefs: [],
      warningCount: 'integer'
    },
    routerKeywords: ['session digest'],
    degradesTo: 'escalate',
    ...overrides
  };
}

describe('task-registry-entry.schema — WP-116 constraints', () => {
  it('rejects taskKind with uppercase letters', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ taskKind: 'SessionDigest' })), false);
  });

  it('rejects taskKind shorter than 3 chars', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ taskKind: 'ab' })), false);
  });

  it('rejects lane outside {execution, review}', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ lane: 'reporting' })), false);
  });

  it('rejects helperModule not rooted at environment/', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ helperModule: 'lib/foo.js' })), false);
  });

  it('rejects helperModule without .js extension', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ helperModule: 'environment/flows/foo' })), false);
  });

  it('rejects helperExport with invalid JS identifier', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ helperExport: '1bad' })), false);
  });

  it('rejects empty routerKeywords', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ routerKeywords: [] })), false);
  });

  it('rejects routerKeyword shorter than 2 chars', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ routerKeywords: ['a'] })), false);
  });

  it('accepts degradesTo "escalate"', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ degradesTo: 'escalate' })), true);
  });

  it('accepts degradesTo "noop"', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ degradesTo: 'noop' })), true);
  });

  it('accepts degradesTo referencing another task kind (kebab-case)', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ degradesTo: 'memory-sync-refresh' })), true);
  });

  it('rejects degradesTo with uppercase letters', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ degradesTo: 'Escalate' })), false);
  });

  it('requires outputContract to carry summary, artifactRefs, warningCount', async () => {
    const validator = await loadValidator();
    const fixture = baseEntry();
    delete fixture.outputContract.warningCount;
    assert.equal(validator(fixture), false);
  });

  it('rejects additional top-level properties', async () => {
    const validator = await loadValidator();
    assert.equal(validator(baseEntry({ unexpected: true })), false);
  });

  it('accepts inputSchema pointing to a valid schema path', async () => {
    const validator = await loadValidator();
    const fixture = baseEntry({
      inputSchema: 'environment/schemas/literature-register-input.schema.json'
    });
    assert.equal(validator(fixture), true);
  });

  it('rejects inputSchema outside environment/schemas/', async () => {
    const validator = await loadValidator();
    const fixture = baseEntry({
      inputSchema: 'schemas/foo.schema.json'
    });
    assert.equal(validator(fixture), false);
  });
});
