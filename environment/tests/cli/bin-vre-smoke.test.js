import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from './_fixture.js';

test('bin/vre flow-status publishes one middleware snapshot', async () => {
  const projectRoot = await createCliFixtureProject('vre-flow-status-');
  try {
    const result = await runVre(projectRoot, ['flow-status']);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    const fields = result.stdout.trim().split('\t');
    assert.equal(fields[0], 'flow-status');
    assert.match(fields[1], /^ATT-/u);
    assert.equal(fields[2], '.vibe-science-environment/control/session.json');
    assert.match(fields[3], /^\d+$/u);

    const snapshot = JSON.parse(
      await readFile(path.join(projectRoot, '.vibe-science-environment', 'control', 'session.json'), 'utf8')
    );
    assert.equal(snapshot.lastCommand, '/flow-status');
    assert.equal(snapshot.lastAttemptId, fields[1]);
    assert.equal(snapshot.signals.provenance.sourceMode, 'degraded');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre sync-memory refreshes memory mirrors through middleware', async () => {
  const projectRoot = await createCliFixtureProject('vre-sync-memory-');
  try {
    const result = await runVre(projectRoot, ['sync-memory']);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    const syncState = JSON.parse(
      await readFile(path.join(projectRoot, '.vibe-science-environment', 'memory', 'sync-state.json'), 'utf8')
    );
    assert.equal(syncState.status, 'partial');
    assert(syncState.warnings.length > 0);

    const snapshot = JSON.parse(
      await readFile(path.join(projectRoot, '.vibe-science-environment', 'control', 'session.json'), 'utf8')
    );
    assert.equal(snapshot.lastCommand, '/sync-memory');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('bin/vre orchestrator-status calls the already-wrapped runtime once', async () => {
  const projectRoot = await createCliFixtureProject('vre-orchestrator-status-');
  try {
    const result = await runVre(projectRoot, ['orchestrator-status']);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /objective=none/u);

    const attempts = (await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'control', 'attempts.jsonl'),
      'utf8'
    )).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(attempts.filter((attempt) => attempt.status === 'preparing').length, 1);
    assert.equal(attempts.at(-1).scope, 'orchestrator-status');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
