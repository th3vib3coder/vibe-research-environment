import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createClaimEdge,
  readClaimEdges
} from '../../claims/edges.js';

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-claim-edges-'));
  try {
    await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function validEdge(overrides = {}) {
  return {
    schemaVersion: 'phase9.claim-edge.v1',
    edgeId: 'EDGE-test-001',
    fromId: 'CLAIM-from-001',
    toId: 'CLAIM-to-001',
    relation: 'supports',
    createdAt: '2026-04-29T08:00:00.000Z',
    ...overrides
  };
}

function acceptingResolver() {
  return true;
}

async function readRawEdges(projectRoot) {
  const edgesPath = path.join(projectRoot, '.vibe-science-environment', 'claims', 'edges.jsonl');
  const raw = await readFile(edgesPath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

async function expectClaimEdgeError(thunk, code) {
  try {
    await thunk();
    assert.fail(`expected claim-edge error ${code}`);
  } catch (error) {
    assert.equal(error.code, code, `expected error.code ${code}, got ${error.code}`);
    return error;
  }
}

test('createClaimEdge writes a resolver-verified edge to edges.jsonl', async () => {
  await withTempProject(async (projectRoot) => {
    const edge = validEdge();
    const result = await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });

    assert.deepEqual(result, { ok: true, status: 'written' });
    assert.deepEqual(await readRawEdges(projectRoot), [edge]);
  });
});

test('createClaimEdge rejects schema-invalid edges', async () => {
  await withTempProject(async (projectRoot) => {
    await expectClaimEdgeError(
      () => createClaimEdge(projectRoot, validEdge({ schemaVersion: 'wrong-version' }), {
        claimResolver: acceptingResolver
      }),
      'E_CLAIM_EDGE_INVALID'
    );
  });
});

test('createClaimEdge rejects self-loops even though the schema accepts them', async () => {
  await withTempProject(async (projectRoot) => {
    await expectClaimEdgeError(
      () => createClaimEdge(projectRoot, validEdge({ toId: 'CLAIM-from-001' }), {
        claimResolver: acceptingResolver
      }),
      'E_CLAIM_EDGE_SELF_LOOP'
    );
  });
});

test('createClaimEdge rejects unknown relations with the consumer guard', async () => {
  await withTempProject(async (projectRoot) => {
    await expectClaimEdgeError(
      () => createClaimEdge(projectRoot, validEdge({ relation: 'made_up' }), {
        claimResolver: acceptingResolver
      }),
      'E_CLAIM_EDGE_RELATION_UNKNOWN'
    );
  });
});

test('createClaimEdge treats identical duplicate writes as a no-op', async () => {
  await withTempProject(async (projectRoot) => {
    const edge = validEdge();
    const first = await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });
    const second = await createClaimEdge(projectRoot, {
      ...edge,
      createdAt: '2026-04-29T08:01:00.000Z'
    }, {
      claimResolver: acceptingResolver
    });

    assert.deepEqual(first, { ok: true, status: 'written' });
    assert.deepEqual(second, { ok: true, status: 'duplicate-no-op' });
    assert.deepEqual(await readRawEdges(projectRoot), [edge]);
  });
});

test('createClaimEdge rejects conflicting duplicates on the same tuple', async () => {
  await withTempProject(async (projectRoot) => {
    const edge = validEdge({ confidence: 0.4 });
    await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });

    await expectClaimEdgeError(
      () => createClaimEdge(projectRoot, validEdge({ confidence: 0.7 }), {
        claimResolver: acceptingResolver
      }),
      'E_CLAIM_EDGE_DUPLICATE_CONFLICT'
    );
  });
});

test('readClaimEdges filters by relation', async () => {
  await withTempProject(async (projectRoot) => {
    await createClaimEdge(projectRoot, validEdge({ edgeId: 'EDGE-supports-001', fromId: 'CLAIM-a', toId: 'CLAIM-b' }), {
      claimResolver: acceptingResolver
    });
    await createClaimEdge(projectRoot, validEdge({ edgeId: 'EDGE-supports-002', fromId: 'CLAIM-c', toId: 'CLAIM-d' }), {
      claimResolver: acceptingResolver
    });
    await createClaimEdge(projectRoot, validEdge({
      edgeId: 'EDGE-contradicts-001',
      fromId: 'CLAIM-e',
      toId: 'CLAIM-f',
      relation: 'contradicts'
    }), {
      claimResolver: acceptingResolver
    });

    const contradicted = await readClaimEdges(projectRoot, { relation: 'contradicts' });
    assert.equal(contradicted.length, 1);
    assert.equal(contradicted[0].edgeId, 'EDGE-contradicts-001');
  });
});

test('createClaimEdge fails closed when no claimResolver is supplied', async () => {
  await withTempProject(async (projectRoot) => {
    await expectClaimEdgeError(
      () => createClaimEdge(projectRoot, validEdge()),
      'E_CLAIM_EDGE_RESOLVER_UNAVAILABLE'
    );
  });
});
