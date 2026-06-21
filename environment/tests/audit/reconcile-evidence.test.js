import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createClaimEdge
} from '../../claims/edges.js';
import {
  buildEvidenceExcerpt,
  reconcileEvidenceExcerpt
} from '../../audit/query.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const GOLD_CORPUS_ROOT = path.join(
  REPO_ROOT,
  'environment',
  '__fixtures__',
  'acceptance',
  'gold-corpus'
);
const EMPTY_RANGE = Object.freeze({
  from: '2026-06-21T00:00:00.000Z',
  to: '2026-06-21T23:59:59.999Z'
});

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-reconcile-evidence-'));
  try {
    await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function withEnv(overrides, fn) {
  const previous = new Map();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    if (overrides[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
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

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    counts[row[field]] = (counts[row[field]] ?? 0) + 1;
  }
  return counts;
}

async function writeAuditCliStub(projectRoot, rows) {
  const cliPath = path.join(projectRoot, 'audit-query-cli-stub.js');
  await writeFile(cliPath, [
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    `  const rows = ${JSON.stringify(rows)};`,
    "  process.stdout.write(JSON.stringify({ ok: true, rows }) + '\\n');",
    '});',
    ''
  ].join('\n'), 'utf8');
  return cliPath;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonl(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

async function loadGoldCorpusFixture() {
  const expected = await readJson(path.join(GOLD_CORPUS_ROOT, 'expected-counts.json'));
  const governanceEvents = await readJsonl(
    path.join(GOLD_CORPUS_ROOT, 'governance-events.jsonl')
  );
  const edges = await readJsonl(path.join(GOLD_CORPUS_ROOT, 'edges.jsonl'));
  const r2Verdicts = await readJsonl(path.join(GOLD_CORPUS_ROOT, 'r2-verdicts.jsonl'));
  return { governanceEvents, edges, r2Verdicts, expected };
}

function acceptingResolver() {
  return true;
}

async function seedGoldCorpusProject(projectRoot, fixture) {
  for (const edge of fixture.edges) {
    await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });
  }

  const governanceRows = Object.entries(countBy(fixture.governanceEvents, 'event_type'))
    .map(([eventType, count]) => ({
      event_type: eventType,
      source_component: 'fixture/gold-corpus',
      count
    }));
  return writeAuditCliStub(projectRoot, governanceRows);
}

async function buildGoldCorpusExcerpt(projectRoot, fixture, overrides = {}) {
  const cliPath = await seedGoldCorpusProject(projectRoot, fixture);
  return withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
    const excerpt = await buildEvidenceExcerpt(projectRoot, {
      ...EMPTY_RANGE,
      objectiveId: fixture.expected.objectiveId
    });
    return {
      ...excerpt,
      r2_verdicts_by_status: countBy(fixture.r2Verdicts, 'status'),
      ...overrides
    };
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectReconcileError(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('reconciliation returns ok for the accepted gold corpus excerpt', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    assert.deepEqual(reconcileEvidenceExcerpt(excerpt, fixture.expected), {
      ok: true
    });
  });
});

test('governance count divergence fails closed', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.governance_events_aggregated[0].count += 1;
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_DIVERGENCE'
    );
  });
});

test('edge relation count divergence fails closed', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.edges_by_relation.supports.push(clone(excerpt.edges_by_relation.supports[0]));
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_DIVERGENCE'
    );
  });
});

test('r2 verdict count divergence fails closed', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.r2_verdicts_by_status.accepted += 1;
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_DIVERGENCE'
    );
  });
});

test('governance false-zero has a dedicated failure code', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.governance_events_aggregated = excerpt.governance_events_aggregated
      .map((row) => row.event_type === 'claim.seeded'
        ? { ...row, count: 0 }
        : row);
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_FALSE_ZERO'
    );
  });
});

test('edge false-zero has a dedicated failure code', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.edges_by_relation.supports = [];
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_FALSE_ZERO'
    );
  });
});

test('r2 false-zero has a dedicated failure code', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    excerpt.r2_verdicts_by_status = { accepted: 0, redirected: 0 };
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_FALSE_ZERO'
    );
  });
});

test('missing relation keys fail closed even for zero-count relations', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    delete excerpt.edges_by_relation.supersedes;
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING'
    );
  });
});

test('missing explicit r2 source fails closed', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture);
    delete excerpt.r2_verdicts_by_status;
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING'
    );
  });
});

test('r2 request governance event cannot satisfy r2 verdict count', async () => {
  const fixture = await loadGoldCorpusFixture();
  await withTempProject(async (projectRoot) => {
    const excerpt = await buildGoldCorpusExcerpt(projectRoot, fixture, {
      r2_verdicts_by_status: { accepted: 1, redirected: 0 }
    });
    assert.equal(fixture.expected.governanceEventsByType['r2.review.requested'], 1);
    assert.equal(fixture.expected.r2Verdicts.total, 2);
    expectReconcileError(
      () => reconcileEvidenceExcerpt(excerpt, fixture.expected),
      'E_EVIDENCE_RECONCILE_FALSE_ZERO'
    );
  });
});
