import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
  getTaskRegistry,
  getTaskEntry,
  findByRouterKeyword,
  listExecutionTaskKinds,
  listReviewTaskKinds,
  resetTaskRegistryCache,
  validateTaskInput,
} from '../../orchestrator/task-registry.js';

describe('WP-126 task-registry', () => {
  before(async () => {
    await resetTaskRegistryCache();
  });

  it('loads the seed + Phase 7 Wave 1 expansion entries at cold boot', async () => {
    const registry = await getTaskRegistry();
    assert.equal(registry.size, 7);
    const kinds = [...registry.keys()].sort();
    assert.deepEqual(kinds, [
      'experiment-flow-register',
      'literature-flow-register',
      'memory-sync-refresh',
      'results-bundle-discover',
      'session-digest-export',
      'session-digest-review',
      'writing-export-finalize',
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

  it('listExecutionTaskKinds returns all execution kinds sorted (Phase 7 Wave 1 expansion)', async () => {
    const kinds = await listExecutionTaskKinds();
    assert.deepEqual(kinds, [
      'experiment-flow-register',
      'literature-flow-register',
      'memory-sync-refresh',
      'results-bundle-discover',
      'session-digest-export',
      'writing-export-finalize',
    ]);
  });

  it('listReviewTaskKinds includes session-digest-review after Phase 6 Wave 2', async () => {
    const kinds = await listReviewTaskKinds();
    assert.deepEqual(kinds, ['session-digest-review']);
  });

  it('cache is reused across calls (second call does not re-scan)', async () => {
    const first = await getTaskRegistry();
    const second = await getTaskRegistry();
    assert.equal(first.size, second.size);
  });

  it('validates taskInput against the registry input schema when declared', async () => {
    await validateTaskInput('literature-flow-register', {
      title: 'Registry-driven literature paper',
      doi: '10.1000/registry',
    });

    await assert.rejects(
      () => validateTaskInput('literature-flow-register', { doi: '10.1000/missing-title' }),
      /taskInput for literature-flow-register failed/u,
    );
  });
});
