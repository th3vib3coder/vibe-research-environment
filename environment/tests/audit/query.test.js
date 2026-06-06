import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createClaimEdge
} from '../../claims/edges.js';
import {
  aggregateGovernanceEvents,
  buildEvidenceExcerpt,
  listEdgesByRelation
} from '../../audit/query.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'audit',
  'sample-evidence-excerpt.json'
);
const EMPTY_RANGE = Object.freeze({
  from: '2026-04-30T00:00:00.000Z',
  to: '2026-04-30T23:59:59.999Z'
});
const SENTINEL = 'SECRET-seq130-audit-pin';

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-audit-query-'));
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

async function writeAuditCliStub(projectRoot, {
  rows,
  markerPath = null,
  filterByRange = false,
  filterByObjectiveId = false
}) {
  const cliPath = path.join(projectRoot, 'audit-query-cli-stub.js');
  await writeFile(cliPath, [
    "const fs = require('node:fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  const payload = stdin.trim() === '' ? {} : JSON.parse(stdin);",
    markerPath ? `  fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify(payload));` : '',
    `  const rows = ${JSON.stringify(rows)};`,
    filterByObjectiveId
      ? "  const objectiveRows = rows.filter((row) => row.objective_id === payload.objectiveId);"
      : '  const objectiveRows = rows;',
    filterByRange
      ? "  const selected = payload.from === '2026-04-30T10:00:00.000Z' && payload.to === '2026-04-30T11:00:00.000Z' ? rows.slice(0, 1) : rows;"
      : '  const selected = objectiveRows;',
    "  process.stdout.write(JSON.stringify({ ok: true, rows: selected }) + '\\n');",
    '});',
    ''
  ].join('\n'), 'utf8');
  return cliPath;
}

function aggregateRows() {
  return [
    { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 4 },
    { event_type: 'objective_started', source_component: 'vre/objectives/cli', count: 3 },
    { event_type: 'objective_started', source_component: 'vre/orchestrator/autonomy-runtime', count: 3 }
  ];
}

function acceptingResolver() {
  return true;
}

function edgeRecord(overrides = {}) {
  return {
    schemaVersion: 'phase9.claim-edge.v1',
    edgeId: 'EDGE-AUDIT-BASE',
    fromId: 'CLAIM-AUDIT-FROM',
    toId: 'CLAIM-AUDIT-TO',
    relation: 'contradicts',
    createdAt: '2026-04-30T09:00:00.000Z',
    ...overrides
  };
}

async function seedEdge(projectRoot, overrides = {}) {
  await createClaimEdge(projectRoot, edgeRecord(overrides), {
    claimResolver: acceptingResolver
  });
}

async function readFixture() {
  return JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
}

function assertNoDetailsLeak(payload) {
  assert.equal(JSON.stringify(payload).includes(SENTINEL), false);
}

test('aggregateGovernanceEvents aggregates by event type and source component', async () => {
  await withTempProject(async (projectRoot) => {
    const markerPath = path.join(projectRoot, 'audit-query-stdin.json');
    const cliPath = await writeAuditCliStub(projectRoot, {
      rows: aggregateRows(),
      markerPath
    });

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const rows = await aggregateGovernanceEvents(projectRoot, {
        from: 1_700_000_000_000,
        to: 1_700_000_010_000
      });

      assert.deepEqual(rows, aggregateRows());
      assert.equal(rows.reduce((total, row) => total + row.count, 0), 10);
      assert.deepEqual(JSON.parse(await readFile(markerPath, 'utf8')), {
        from: 1_700_000_000_000,
        to: 1_700_000_010_000,
        pluginProjectRoot: null
      });
      assertNoDetailsLeak(rows);
    });
  });
});

test('listEdgesByRelation delegates to readClaimEdges relation filtering', async () => {
  await withTempProject(async (projectRoot) => {
    for (let index = 1; index <= 3; index += 1) {
      await seedEdge(projectRoot, {
        edgeId: `EDGE-AUDIT-CONTRADICTS-${index}`,
        fromId: `CLAIM-AUDIT-C${index}`,
        toId: `CLAIM-AUDIT-D${index}`,
        relation: 'contradicts'
      });
    }
    await seedEdge(projectRoot, {
      edgeId: 'EDGE-AUDIT-SUPPORTS-1',
      fromId: 'CLAIM-AUDIT-S1',
      toId: 'CLAIM-AUDIT-S2',
      relation: 'supports'
    });

    assert.equal((await listEdgesByRelation(projectRoot, 'contradicts')).length, 3);
    assert.equal((await listEdgesByRelation(projectRoot, 'supports')).length, 1);
  });
});

test('buildEvidenceExcerpt returns the empty Wave 6 evidence excerpt shape', async () => {
  await withTempProject(async (projectRoot) => {
    const cliPath = await writeAuditCliStub(projectRoot, { rows: [] });
    const fixture = await readFixture();

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const excerpt = await buildEvidenceExcerpt(projectRoot, {
        ...EMPTY_RANGE,
        objectiveId: 'OBJ-AUDIT-EMPTY'
      });

      assert.deepEqual(excerpt, fixture.empty);
    });
  });
});

test('buildEvidenceExcerpt requires a non-empty objectiveId for Wave 6 evidence bundles', async () => {
  await withTempProject(async (projectRoot) => {
    const cliPath = await writeAuditCliStub(projectRoot, { rows: [] });

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      for (const objectiveId of [undefined, null, '', '   ', 42, { id: 'OBJ-AUDIT' }]) {
        await assert.rejects(
          () => buildEvidenceExcerpt(projectRoot, {
            ...EMPTY_RANGE,
            ...(objectiveId === undefined ? {} : { objectiveId })
          }),
          /objectiveId must be a non-empty string/u
        );
      }
    });
  });
});

test('aggregateGovernanceEvents passes the requested time range to the plugin reader', async () => {
  await withTempProject(async (projectRoot) => {
    const cliPath = await writeAuditCliStub(projectRoot, {
      rows: [
        { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 1 },
        { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 99 }
      ],
      filterByRange: true
    });

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const rows = await aggregateGovernanceEvents(projectRoot, {
        from: '2026-04-30T10:00:00.000Z',
        to: '2026-04-30T11:00:00.000Z'
      });

      assert.deepEqual(rows, [
        { event_type: 'law_violation', source_component: 'plugin/hooks/pre-tool-use', count: 1 }
      ]);
    });
  });
});

test('buildEvidenceExcerpt summary.total_edges matches the relation bucket sum', async () => {
  await withTempProject(async (projectRoot) => {
    const cliPath = await writeAuditCliStub(projectRoot, { rows: aggregateRows() });
    await seedEdge(projectRoot, {
      edgeId: 'EDGE-AUDIT-CONTRADICTS-1',
      fromId: 'CLAIM-AUDIT-A',
      toId: 'CLAIM-AUDIT-B',
      relation: 'contradicts',
      objectiveId: 'OBJ-AUDIT-SUMMARY'
    });
    await seedEdge(projectRoot, {
      edgeId: 'EDGE-AUDIT-SUPPORTS-1',
      fromId: 'CLAIM-AUDIT-C',
      toId: 'CLAIM-AUDIT-D',
      relation: 'supports',
      objectiveId: 'OBJ-AUDIT-SUMMARY'
    });

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const excerpt = await buildEvidenceExcerpt(projectRoot, {
        ...EMPTY_RANGE,
        objectiveId: 'OBJ-AUDIT-SUMMARY'
      });
      const relationTotal = Object.values(excerpt.edges_by_relation)
        .reduce((total, edges) => total + edges.length, 0);

      assert.equal(excerpt.summary.total_edges, relationTotal);
      assert.equal(excerpt.summary.total_edges, 2);
    });
  });
});

test('buildEvidenceExcerpt filters governance events and edges to one objectiveId', async () => {
  await withTempProject(async (projectRoot) => {
    const markerPath = path.join(projectRoot, 'audit-query-stdin.json');
    const cliPath = await writeAuditCliStub(projectRoot, {
      rows: [
        { event_type: 'objective_started', source_component: 'vre/objectives/cli', objective_id: 'OBJ-AUDIT-A', count: 2 },
        { event_type: 'objective_started', source_component: 'vre/objectives/cli', objective_id: 'OBJ-AUDIT-B', count: 99 }
      ],
      markerPath,
      filterByObjectiveId: true
    });

    await seedEdge(projectRoot, {
      edgeId: 'EDGE-AUDIT-A-CONTRADICTS',
      fromId: 'CLAIM-AUDIT-A1',
      toId: 'CLAIM-AUDIT-A2',
      relation: 'contradicts',
      objectiveId: 'OBJ-AUDIT-A'
    });
    await seedEdge(projectRoot, {
      edgeId: 'EDGE-AUDIT-B-CONTRADICTS',
      fromId: 'CLAIM-AUDIT-B1',
      toId: 'CLAIM-AUDIT-B2',
      relation: 'contradicts',
      objectiveId: 'OBJ-AUDIT-B'
    });

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const excerpt = await buildEvidenceExcerpt(projectRoot, {
        ...EMPTY_RANGE,
        objectiveId: 'OBJ-AUDIT-A',
        pluginProjectRoot: path.join(projectRoot, 'fixture-plugin-root')
      });

      assert.deepEqual(JSON.parse(await readFile(markerPath, 'utf8')), {
        ...EMPTY_RANGE,
        objectiveId: 'OBJ-AUDIT-A',
        pluginProjectRoot: path.join(projectRoot, 'fixture-plugin-root')
      });
      assert.deepEqual(excerpt.governance_events_aggregated, [
        { event_type: 'objective_started', source_component: 'vre/objectives/cli', count: 2 }
      ]);
      assert.deepEqual(
        excerpt.edges_by_relation.contradicts.map((edge) => edge.edgeId),
        ['EDGE-AUDIT-A-CONTRADICTS']
      );
      assert.equal(excerpt.summary.objective_id, 'OBJ-AUDIT-A');
      assert.equal(JSON.stringify(excerpt).includes('OBJ-AUDIT-B'), false);
    });
  });
});

test('buildEvidenceExcerpt output is pinned by sample-evidence-excerpt fixture', async () => {
  await withTempProject(async (projectRoot) => {
    const fixture = await readFixture();
    const cliPath = await writeAuditCliStub(projectRoot, {
      rows: fixture.populated.governance_events_aggregated
    });

    await seedEdge(projectRoot, fixture.populated.edges_by_relation.contradicts[0]);
    await seedEdge(projectRoot, fixture.populated.edges_by_relation.supports[0]);

    await withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: cliPath }, async () => {
      const excerpt = await buildEvidenceExcerpt(projectRoot, {
        ...EMPTY_RANGE,
        objectiveId: 'OBJ-AUDIT-130'
      });

      assert.deepEqual(excerpt, fixture.populated);
      assertNoDetailsLeak(excerpt);
    });
  });
});
