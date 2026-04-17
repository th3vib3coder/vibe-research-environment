import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
  getTaskRegistry,
  getTaskEntry,
  findByRouterKeyword,
  listExecutionTaskKinds,
  listReviewTaskKinds,
  resetTaskRegistryCache,
} from '../../orchestrator/task-registry.js';

describe('WP-126 task-registry', () => {
  before(async () => {
    await resetTaskRegistryCache();
  });

  it('loads the three seed entries at cold boot', async () => {
    const registry = await getTaskRegistry();
    assert.equal(registry.size, 3);
    const kinds = [...registry.keys()].sort();
    assert.deepEqual(kinds, [
      'literature-flow-register',
      'memory-sync-refresh',
      'session-digest-export',
    ]);
  });

  it('getTaskEntry resolves by taskKind and returns null for unknown kinds', async () => {
    const entry = await getTaskEntry('session-digest-export');
    assert.equal(entry?.taskKind, 'session-digest-export');
    assert.equal(entry?.lane, 'execution');
    assert.equal(entry?.helperExport, 'exportSessionDigest');

    const missing = await getTaskEntry('no-such-task');
    assert.equal(missing, null);
  });

  it('findByRouterKeyword matches unambiguous keywords (case-insensitive)', async () => {
    const match = await findByRouterKeyword('Please EXPORT DIGEST for me');
    assert.deepEqual(match, { ambiguous: false, taskKind: 'session-digest-export' });
  });

  it('findByRouterKeyword flags ambiguous matches with candidates sorted', async () => {
    const match = await findByRouterKeyword('refresh memory and export digest now');
    assert.equal(match?.ambiguous, true);
    assert.deepEqual(match?.candidates, ['memory-sync-refresh', 'session-digest-export']);
  });

  it('findByRouterKeyword returns null for unmatched text', async () => {
    const match = await findByRouterKeyword('totally unrelated objective');
    assert.equal(match, null);
  });

  it('listExecutionTaskKinds returns all three execution kinds sorted', async () => {
    const kinds = await listExecutionTaskKinds();
    assert.deepEqual(kinds, [
      'literature-flow-register',
      'memory-sync-refresh',
      'session-digest-export',
    ]);
  });

  it('listReviewTaskKinds is empty in Phase 5.5 Wave 2 scope', async () => {
    const kinds = await listReviewTaskKinds();
    assert.deepEqual(kinds, []);
  });

  it('cache is reused across calls (second call does not re-scan)', async () => {
    const first = await getTaskRegistry();
    const second = await getTaskRegistry();
    assert.equal(first.size, second.size);
  });
});
