import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createClaimEdge
} from '../../claims/edges.js';
import {
  buildEvidenceExcerpt,
  EVIDENCE_EDGE_RELATIONS,
  reconcileEvidenceExcerpt
} from '../../audit/query.js';

const PROPERTY_SEED = 'TW6.3-CROSS-SOURCE-PROPERTY-SEED-2026-06-21-V1';
const CASE_COUNT = 6;
const REVIEWED_RELATIONS = Object.freeze([
  'contradicts',
  'supports',
  'supersedes',
  'depends_on',
  'evolved_into',
  'related_to'
]);
const RANGE = Object.freeze({
  from: '2026-06-21T00:00:00.000Z',
  to: '2026-06-21T23:59:59.999Z'
});

function seedToNumber(seed) {
  let hash = 0x811c9dc5;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function createPrng(seed) {
  let state = seedToNumber(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function boundedInt(prng, maxInclusive) {
  return Math.floor(prng() * (maxInclusive + 1));
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    counts[row[field]] = (counts[row[field]] ?? 0) + 1;
  }
  return counts;
}

function countEdgesByRelation(edges) {
  const counts = Object.fromEntries(REVIEWED_RELATIONS.map((relation) => [
    relation,
    0
  ]));
  for (const edge of edges) {
    counts[edge.relation] += 1;
  }
  return counts;
}

function total(values) {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function buildCases() {
  const prng = createPrng(PROPERTY_SEED);
  return Array.from({ length: CASE_COUNT }, (_, caseIndex) => {
    const objectiveId = `OBJ-W6-PROPERTY-${caseIndex + 1}`;
    const governanceEvents = [];
    const eventTypes = [
      'objective.created',
      'claim.seeded',
      'r2.review.requested'
    ];
    for (const eventType of eventTypes) {
      const count = eventType === 'objective.created'
        ? 1
        : boundedInt(prng, 3);
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        governanceEvents.push({
          event_id: `GOV-${caseIndex + 1}-${eventType}-${rowIndex + 1}`,
          event_type: eventType,
          source_component: 'tw6.3-property-generator',
          objectiveId
        });
      }
    }

    const edges = [];
    for (const relation of REVIEWED_RELATIONS) {
      const maxEdges = relation === 'supersedes' || relation === 'evolved_into'
        ? 1
        : 2;
      const relationCount = caseIndex === 0 && relation === 'supersedes'
        ? 0
        : boundedInt(prng, maxEdges);
      for (let rowIndex = 0; rowIndex < relationCount; rowIndex += 1) {
        edges.push({
          schemaVersion: 'phase9.claim-edge.v1',
          edgeId: `EDGE-W6-PROP-${caseIndex + 1}-${relation}-${rowIndex + 1}`,
          fromId: `CLAIM-W6-PROP-${caseIndex + 1}-${relation}-A-${rowIndex + 1}`,
          toId: `CLAIM-W6-PROP-${caseIndex + 1}-${relation}-B-${rowIndex + 1}`,
          relation,
          createdAt: `2026-06-21T00:${String(caseIndex + rowIndex).padStart(2, '0')}:00.000Z`,
          confidence: 0.5 + (boundedInt(prng, 40) / 100),
          sourceR2EventId: `EV-${String((caseIndex * 100) + edges.length + 1).padStart(4, '0')}`,
          objectiveId
        });
      }
    }

    const r2Statuses = caseIndex === 0
      ? []
      : ['accepted', 'redirected', 'accepted'].slice(0, 1 + boundedInt(prng, 2));
    const r2Verdicts = r2Statuses.map((status, rowIndex) => ({
      verdictId: `R2V-W6-PROP-${caseIndex + 1}-${rowIndex + 1}`,
      status,
      objectiveId
    }));

    return { objectiveId, governanceEvents, edges, r2Verdicts };
  });
}

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-tw6-property-'));
  try {
    return await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeJsonl(filePath, rows) {
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8'
  );
}

async function readJsonl(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

async function writeAuditCliStub(projectRoot, eventsPath) {
  const cliPath = path.join(projectRoot, 'audit-query-cli-stub.js');
  await writeFile(cliPath, [
    "import { readFile } from 'node:fs/promises';",
    `const eventsPath = ${JSON.stringify(eventsPath)};`,
    "const rows = (await readFile(eventsPath, 'utf8'))",
    "  .split(/\\r?\\n/u)",
    "  .filter((line) => line.trim() !== '')",
    "  .map((line) => JSON.parse(line));",
    'const byKey = new Map();',
    'for (const row of rows) {',
    "  const source = row.source_component ?? 'tw6.3-property-generator';",
    "  const key = `${row.event_type}\\u0000${source}`;",
    "  byKey.set(key, (byKey.get(key) ?? 0) + 1);",
    '}',
    'const aggregated = [...byKey.entries()].map(([key, count]) => {',
    "  const [event_type, source_component] = key.split('\\u0000');",
    '  return { event_type, source_component, count };',
    '});',
    "process.stdout.write(JSON.stringify({ ok: true, rows: aggregated }) + '\\n');",
    ''
  ].join('\n'), 'utf8');
  return cliPath;
}

function acceptingResolver() {
  return true;
}

async function materializeCase(projectRoot, propertyCase) {
  const corpusRoot = path.join(projectRoot, 'tw6-property-corpus');
  const governancePath = path.join(corpusRoot, 'governance-events.jsonl');
  const edgePath = path.join(corpusRoot, 'edges.jsonl');
  const r2Path = path.join(corpusRoot, 'r2-verdicts.jsonl');

  await rm(corpusRoot, { recursive: true, force: true });
  await mkdir(corpusRoot, { recursive: true });

  await writeJsonl(governancePath, propertyCase.governanceEvents);
  await writeJsonl(edgePath, propertyCase.edges);
  await writeJsonl(r2Path, propertyCase.r2Verdicts);

  for (const edge of propertyCase.edges) {
    await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });
  }

  const cliPath = await writeAuditCliStub(projectRoot, governancePath);
  return { governancePath, edgePath, r2Path, cliPath };
}

async function deriveExpectedFromMaterialized({ governancePath, edgePath, r2Path }, objectiveId) {
  const governanceEvents = await readJsonl(governancePath);
  const edges = await readJsonl(edgePath);
  const r2Verdicts = await readJsonl(r2Path);
  const claimEdgesByRelation = countEdgesByRelation(edges);
  const r2ByStatus = countBy(r2Verdicts, 'status');
  return {
    schemaVersion: 'phase14.w6.property.expected-counts.v1',
    propertySeed: PROPERTY_SEED,
    propertyCaseCount: CASE_COUNT,
    objectiveId,
    governanceEventsByType: countBy(governanceEvents, 'event_type'),
    claimEdgesByRelation,
    claimEdgesTotal: total(claimEdgesByRelation),
    r2Verdicts: {
      total: r2Verdicts.length,
      byStatus: r2ByStatus
    }
  };
}

async function buildExcerptFromProduction(projectRoot, materialized, objectiveId) {
  return withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: materialized.cliPath }, async () => {
    const excerpt = await buildEvidenceExcerpt(projectRoot, {
      ...RANGE,
      objectiveId
    });
    const r2Verdicts = await readJsonl(materialized.r2Path);
    return {
      ...excerpt,
      r2_verdicts_by_status: countBy(r2Verdicts, 'status')
    };
  });
}

async function buildActualAndExpected(propertyCase) {
  return withTempProject(async (projectRoot) => {
    const materialized = await materializeCase(projectRoot, propertyCase);
    const expected = await deriveExpectedFromMaterialized(
      materialized,
      propertyCase.objectiveId
    );
    const excerpt = await buildExcerptFromProduction(
      projectRoot,
      materialized,
      propertyCase.objectiveId
    );
    return { excerpt, expected };
  });
}

function expectReconcileError(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('property generator records a deterministic seed and bounded case count', () => {
  const casesA = buildCases();
  const casesB = buildCases();
  assert.equal(PROPERTY_SEED, 'TW6.3-CROSS-SOURCE-PROPERTY-SEED-2026-06-21-V1');
  assert.equal(CASE_COUNT, 6);
  assert.deepEqual(casesA, casesB);
  assert.deepEqual([...EVIDENCE_EDGE_RELATIONS].sort(), [...REVIEWED_RELATIONS].sort());
});

test('seeded materialized corpora reconcile through production surfaces', async () => {
  for (const propertyCase of buildCases()) {
    const { excerpt, expected } = await buildActualAndExpected(propertyCase);
    assert.deepEqual(reconcileEvidenceExcerpt(excerpt, expected), { ok: true });
    assert.equal(expected.propertySeed, PROPERTY_SEED);
    assert.equal(expected.propertyCaseCount, CASE_COUNT);
  }
});

test('zero r2 verdict corpus still requires an explicit r2 source', async () => {
  const zeroR2Case = buildCases()[0];
  const { excerpt, expected } = await buildActualAndExpected(zeroR2Case);
  assert.equal(expected.r2Verdicts.total, 0);
  assert.deepEqual(excerpt.r2_verdicts_by_status, {});
  assert.deepEqual(reconcileEvidenceExcerpt(excerpt, expected), { ok: true });

  delete excerpt.r2_verdicts_by_status;
  expectReconcileError(
    () => reconcileEvidenceExcerpt(excerpt, expected),
    'E_EVIDENCE_RECONCILE_SOURCE_MISSING'
  );
});

test('seeded single-source perturbations fail closed with reviewed codes', async () => {
  const propertyCase = buildCases().find((candidate) => candidate.r2Verdicts.length > 0);
  const { excerpt, expected } = await buildActualAndExpected(propertyCase);

  const governanceDivergence = clone(excerpt);
  governanceDivergence.governance_events_aggregated[0].count += 1;
  expectReconcileError(
    () => reconcileEvidenceExcerpt(governanceDivergence, expected),
    'E_EVIDENCE_RECONCILE_DIVERGENCE'
  );

  const edgeDivergence = clone(excerpt);
  const positiveRelation = REVIEWED_RELATIONS.find(
    (relation) => edgeDivergence.edges_by_relation[relation].length > 0
  );
  assert.equal(typeof positiveRelation, 'string');
  edgeDivergence.edges_by_relation[positiveRelation].push(
    clone(edgeDivergence.edges_by_relation[positiveRelation][0])
  );
  expectReconcileError(
    () => reconcileEvidenceExcerpt(edgeDivergence, expected),
    'E_EVIDENCE_RECONCILE_DIVERGENCE'
  );

  const r2Divergence = clone(excerpt);
  r2Divergence.r2_verdicts_by_status.accepted += 1;
  expectReconcileError(
    () => reconcileEvidenceExcerpt(r2Divergence, expected),
    'E_EVIDENCE_RECONCILE_DIVERGENCE'
  );

  const governanceFalseZero = clone(excerpt);
  governanceFalseZero.governance_events_aggregated[0].count = 0;
  expectReconcileError(
    () => reconcileEvidenceExcerpt(governanceFalseZero, expected),
    'E_EVIDENCE_RECONCILE_FALSE_ZERO'
  );

  const edgeFalseZero = clone(excerpt);
  edgeFalseZero.edges_by_relation[positiveRelation] = [];
  expectReconcileError(
    () => reconcileEvidenceExcerpt(edgeFalseZero, expected),
    'E_EVIDENCE_RECONCILE_FALSE_ZERO'
  );

  const r2FalseZero = clone(excerpt);
  r2FalseZero.r2_verdicts_by_status = Object.fromEntries(
    Object.keys(r2FalseZero.r2_verdicts_by_status).map((status) => [status, 0])
  );
  expectReconcileError(
    () => reconcileEvidenceExcerpt(r2FalseZero, expected),
    'E_EVIDENCE_RECONCILE_FALSE_ZERO'
  );
});

test('missing zero-count relation key fails closed', async () => {
  const propertyCase = buildCases()[0];
  const { excerpt, expected } = await buildActualAndExpected(propertyCase);
  const zeroRelation = REVIEWED_RELATIONS.find(
    (relation) => expected.claimEdgesByRelation[relation] === 0
  );
  assert.equal(typeof zeroRelation, 'string');
  delete excerpt.edges_by_relation[zeroRelation];
  expectReconcileError(
    () => reconcileEvidenceExcerpt(excerpt, expected),
    'E_EVIDENCE_RECONCILE_SOURCE_MISSING'
  );
});

test('r2 request governance event cannot satisfy generated r2 verdict totals', async () => {
  const propertyCase = buildCases().find((candidate) => (
    candidate.governanceEvents.some((row) => row.event_type === 'r2.review.requested') &&
    candidate.r2Verdicts.length >= 2
  ));
  const { excerpt, expected } = await buildActualAndExpected(propertyCase);

  assert.ok(expected.governanceEventsByType['r2.review.requested'] >= 1);
  assert.ok(expected.r2Verdicts.total >= 2);
  excerpt.r2_verdicts_by_status = {
    accepted: expected.governanceEventsByType['r2.review.requested'],
    redirected: 0
  };
  expectReconcileError(
    () => reconcileEvidenceExcerpt(excerpt, expected),
    'E_EVIDENCE_RECONCILE_FALSE_ZERO'
  );
});
