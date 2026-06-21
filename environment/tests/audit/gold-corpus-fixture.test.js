import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CLAIM_EDGE_RELATIONS } from '../../claims/edges.js';
import { assertValid, loadValidator } from '../../control/_io.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  'environment',
  '__fixtures__',
  'acceptance',
  'gold-corpus'
);
const EXPECTED_SCHEMA_VERSION = 'phase14.w6.gold-corpus.expected-counts.v1';
const SYNTHETIC_OBJECTIVE_ID = 'OBJ-W6-GOLD-CORPUS-SYNTHETIC';
const PRIVATE_DATA_MARKERS = [
  /GSE\d{3,}/u,
  /C:[\\/]/u,
  /\/Users\//u,
  /PATIENT-/iu,
  /SAMPLE-/iu,
  /\.h5ad/iu
];

class GoldCorpusFixtureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GoldCorpusFixtureError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GoldCorpusFixtureError(code, message);
}

function assertSyntheticText(text, label) {
  for (const marker of PRIVATE_DATA_MARKERS) {
    if (marker.test(text)) {
      fail('E_GOLD_CORPUS_PRIVATE_DATA_MARKER', `${label} contains ${marker}`);
    }
  }
}

async function readJson(filePath, label) {
  const text = await readFile(filePath, 'utf8');
  assertSyntheticText(text, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail('E_GOLD_CORPUS_JSON_INVALID', `${label} is invalid JSON: ${error.message}`);
  }
}

async function readJsonl(filePath, label) {
  const text = await readFile(filePath, 'utf8');
  assertSyntheticText(text, label);
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    fail('E_GOLD_CORPUS_JSONL_EMPTY', `${label} must contain at least one row.`);
  }
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(
        'E_GOLD_CORPUS_JSONL_INVALID',
        `${label}:${index + 1} is invalid JSONL: ${error.message}`
      );
    }
  });
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const value = row?.[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail('E_GOLD_CORPUS_COUNT_FIELD_MISSING', `${field} is missing.`);
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function assertCountsEqual(actual, expected, code, label) {
  assert.deepEqual(
    actual,
    expected,
    `${code}: ${label} mismatch`
  );
}

function assertObjective(rows, label, objectiveId) {
  for (const row of rows) {
    if (row?.objectiveId !== objectiveId) {
      fail('E_GOLD_CORPUS_OBJECTIVE_MISMATCH', `${label} has wrong objectiveId.`);
    }
  }
}

export async function validateGoldCorpusFixture(root = FIXTURE_ROOT) {
  const expected = await readJson(
    path.join(root, 'expected-counts.json'),
    'expected-counts.json'
  );
  if (expected.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    fail('E_GOLD_CORPUS_EXPECTED_SCHEMA_VERSION', 'Unexpected expected-counts schema.');
  }
  if (expected.objectiveId !== SYNTHETIC_OBJECTIVE_ID) {
    fail('E_GOLD_CORPUS_OBJECTIVE_MISMATCH', 'Expected objectiveId is not synthetic.');
  }

  const governanceEvents = await readJsonl(
    path.join(root, 'governance-events.jsonl'),
    'governance-events.jsonl'
  );
  const edges = await readJsonl(path.join(root, 'edges.jsonl'), 'edges.jsonl');
  const r2Verdicts = await readJsonl(
    path.join(root, 'r2-verdicts.jsonl'),
    'r2-verdicts.jsonl'
  );

  assertObjective(governanceEvents, 'governance-events.jsonl', expected.objectiveId);
  assertObjective(edges, 'edges.jsonl', expected.objectiveId);
  assertObjective(r2Verdicts, 'r2-verdicts.jsonl', expected.objectiveId);

  const validateClaimEdge = await loadValidator(REPO_ROOT, 'phase9-claim-edge.schema.json');
  for (const edge of edges) {
    try {
      assertValid(validateClaimEdge, edge, 'gold-corpus claim edge');
    } catch (error) {
      fail('E_GOLD_CORPUS_EDGE_SCHEMA_INVALID', error.message);
    }
  }

  for (const relation of CLAIM_EDGE_RELATIONS) {
    if (!Object.hasOwn(expected.claimEdgesByRelation ?? {}, relation)) {
      fail('E_GOLD_CORPUS_RELATION_COUNT_MISSING', `Missing relation ${relation}.`);
    }
  }
  if (!edges.some((edge) => edge.relation === 'contradicts')) {
    fail('E_GOLD_CORPUS_CONTRADICTION_REQUIRED', 'Missing contradicts edge.');
  }

  const actualGovernance = countBy(governanceEvents, 'event_type');
  const actualRelations = Object.fromEntries(
    CLAIM_EDGE_RELATIONS.map((relation) => [
      relation,
      edges.filter((edge) => edge.relation === relation).length
    ])
  );
  const actualR2ByStatus = countBy(r2Verdicts, 'status');

  assertCountsEqual(
    actualGovernance,
    expected.governanceEventsByType,
    'E_GOLD_CORPUS_GOVERNANCE_COUNT_MISMATCH',
    'governance events'
  );
  assertCountsEqual(
    actualRelations,
    expected.claimEdgesByRelation,
    'E_GOLD_CORPUS_EDGE_COUNT_MISMATCH',
    'claim edges'
  );
  assert.equal(
    edges.length,
    expected.claimEdgesTotal,
    'E_GOLD_CORPUS_EDGE_TOTAL_MISMATCH: total edge mismatch'
  );
  assert.equal(
    r2Verdicts.length,
    expected.r2Verdicts.total,
    'E_GOLD_CORPUS_R2_TOTAL_MISMATCH: total r2 verdict mismatch'
  );
  assertCountsEqual(
    actualR2ByStatus,
    expected.r2Verdicts.byStatus,
    'E_GOLD_CORPUS_R2_STATUS_COUNT_MISMATCH',
    'r2 verdicts'
  );

  for (const verdict of r2Verdicts) {
    assert.equal(verdict.fixtureOnly, true, 'r2 verdict rows must be fixture-only.');
    assert.equal(
      verdict.provenanceClass,
      'fixture-only-not-law13-provenance',
      'r2 verdict rows must not masquerade as LAW 13 provenance.'
    );
  }

  return { governanceEvents, edges, r2Verdicts, expected };
}

async function cloneFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-w6-gold-corpus-'));
  await cp(FIXTURE_ROOT, root, { recursive: true });
  return root;
}

async function expectMutationFailure(mutator, code) {
  const root = await cloneFixture();
  try {
    await mutator(root);
    await assert.rejects(
      () => validateGoldCorpusFixture(root),
      (error) => error?.code === code || error?.message?.includes(code)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('gold corpus fixture is synthetic and matches pinned counts', async () => {
  const result = await validateGoldCorpusFixture();
  assert.equal(result.expected.objectiveId, SYNTHETIC_OBJECTIVE_ID);
  assert.ok(result.edges.some((edge) => edge.relation === 'contradicts'));
});

test('gold corpus fixture rejects malformed JSONL', async () => {
  await expectMutationFailure(
    (root) => writeFile(path.join(root, 'governance-events.jsonl'), '{bad json}\n', 'utf8'),
    'E_GOLD_CORPUS_JSONL_INVALID'
  );
});

test('gold corpus fixture rejects claim-edge schema violations', async () => {
  await expectMutationFailure(
    async (root) => {
      const edge = {
        schemaVersion: 'phase9.claim-edge.v1',
        edgeId: 'BAD-EDGE',
        fromId: 'CLAIM-W6-GOLD-A',
        toId: 'CLAIM-W6-GOLD-B',
        relation: 'supports',
        createdAt: '2026-06-21T00:00:00.000Z',
        objectiveId: SYNTHETIC_OBJECTIVE_ID
      };
      await writeFile(path.join(root, 'edges.jsonl'), `${JSON.stringify(edge)}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_EDGE_SCHEMA_INVALID'
  );
});

test('gold corpus fixture requires every reviewed relation count key', async () => {
  await expectMutationFailure(
    async (root) => {
      const expectedPath = path.join(root, 'expected-counts.json');
      const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
      delete expected.claimEdgesByRelation.supersedes;
      await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_RELATION_COUNT_MISSING'
  );
});

test('gold corpus fixture requires a known contradiction seed', async () => {
  await expectMutationFailure(
    async (root) => {
      const edgesPath = path.join(root, 'edges.jsonl');
      const edges = (await readFile(edgesPath, 'utf8'))
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line))
        .filter((edge) => edge.relation !== 'contradicts');
      await writeFile(edgesPath, `${edges.map((edge) => JSON.stringify(edge)).join('\n')}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_CONTRADICTION_REQUIRED'
  );
});

test('gold corpus fixture rejects governance count drift', async () => {
  await expectMutationFailure(
    async (root) => {
      const expectedPath = path.join(root, 'expected-counts.json');
      const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
      expected.governanceEventsByType['objective.created'] += 1;
      await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_GOVERNANCE_COUNT_MISMATCH'
  );
});

test('gold corpus fixture rejects relation count drift', async () => {
  await expectMutationFailure(
    async (root) => {
      const expectedPath = path.join(root, 'expected-counts.json');
      const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
      expected.claimEdgesByRelation.supports += 1;
      await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_EDGE_COUNT_MISMATCH'
  );
});

test('gold corpus fixture rejects r2 verdict count drift', async () => {
  await expectMutationFailure(
    async (root) => {
      const expectedPath = path.join(root, 'expected-counts.json');
      const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
      expected.r2Verdicts.byStatus.accepted += 1;
      await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    },
    'E_GOLD_CORPUS_R2_STATUS_COUNT_MISMATCH'
  );
});

test('gold corpus fixture rejects private-data markers', async () => {
  await expectMutationFailure(
    async (root) => {
      const eventsPath = path.join(root, 'governance-events.jsonl');
      const text = await readFile(eventsPath, 'utf8');
      await writeFile(eventsPath, text.replace('synthetic-gold-corpus', 'GSE184880'), 'utf8');
    },
    'E_GOLD_CORPUS_PRIVATE_DATA_MARKER'
  );
});
