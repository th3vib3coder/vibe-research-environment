import assert from 'node:assert/strict';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  validateManualRelayDryRun
} from './phase12-manual-relay-dry-run.js';

const FIXTURE_ROOT = 'environment/tests/fixtures/phase12/manual-relay-dry-run';

async function withTempFixture(mutate) {
  const root = path.join(
    tmpdir(),
    `phase12-manual-relay-dry-run-${Date.now()}-${Math.random()}`
  );
  await cp(FIXTURE_ROOT, root, { recursive: true });
  try {
    await mutate(root);
    return await validateManualRelayDryRun({ rootPath: root });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function expectCode(result, code) {
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('accepts the complete manual relay dry-run fixture', async () => {
  assert.deepEqual(await validateManualRelayDryRun(), { ok: true, issues: [] });
});

test('rejects a dry run without an ACCEPT path', async () => {
  const result = await withTempFixture(async (root) => {
    await rm(path.join(root, 'accept'), { recursive: true });
  });
  expectCode(result, 'E_PHASE12_DRY_RUN_ACCEPT_PATH_REQUIRED');
});

test('rejects a dry run without a REDIRECT path', async () => {
  const result = await withTempFixture(async (root) => {
    await rm(path.join(root, 'redirect'), { recursive: true });
  });
  expectCode(result, 'E_PHASE12_DRY_RUN_REDIRECT_PATH_REQUIRED');
});

test('rejects a hash mismatch by recomputing file SHA-256 from disk', async () => {
  const result = await withTempFixture(async (root) => {
    await writeFile(path.join(root, 'accept', 'candidate.md'), '# Tampered\n');
  });
  expectCode(result, 'E_PHASE12_DRY_RUN_HASH_MISMATCH');
});

test('rejects reviewer self-ACCEPT through T12.1 semantics', async () => {
  const result = await withTempFixture(async (root) => {
    const reviewPath = path.join(root, 'accept', 'review.json');
    const review = await readJson(reviewPath);
    review.reviewer = 'codex';
    await writeJson(reviewPath, review);
  });
  expectCode(result, 'E_PHASE12_SELF_ACCEPT_FORBIDDEN');
});

test('rejects review verdicts used as provenance', async () => {
  const result = await withTempFixture(async (root) => {
    const bundlePath = path.join(root, 'accept', 'evidence-bundle.json');
    const bundle = await readJson(bundlePath);
    bundle.tracking.provenanceRefs = [
      { kind: 'phase12-relay-verdict', verdictId: 'VERDICT-ACCEPT' }
    ];
    await writeJson(bundlePath, bundle);
  });
  expectCode(result, 'E_PHASE12_REVIEW_NOT_PROVENANCE');
});

test('rejects query output used as provenance', async () => {
  const result = await withTempFixture(async (root) => {
    const bundlePath = path.join(root, 'accept', 'evidence-bundle.json');
    const bundle = await readJson(bundlePath);
    bundle.tracking.provenanceRefs = [
      { kind: 'query-output', path: 'queries/q1.json' }
    ];
    await writeJson(bundlePath, bundle);
  });
  expectCode(result, 'E_PHASE12_QUERY_OUTPUT_NOT_PROVENANCE');
});

test('rejects Graphify output as implementation evidence', async () => {
  const result = await withTempFixture(async (root) => {
    const bundlePath = path.join(root, 'accept', 'evidence-bundle.json');
    const bundle = await readJson(bundlePath);
    bundle.artifacts.push({
      path: 'graphify/navigation.json',
      sha256: 'a'.repeat(64),
      type: 'graphify-output'
    });
    await writeJson(bundlePath, bundle);
  });
  expectCode(result, 'E_PHASE12_GRAPHIFY_NOT_EVIDENCE');
});

test('rejects raw chat as authoritative source', async () => {
  const result = await withTempFixture(async (root) => {
    const candidatePath = path.join(root, 'accept', 'candidate.json');
    const candidate = await readJson(candidatePath);
    candidate.sourceRefs = ['raw-chat:codex-thread'];
    await writeJson(candidatePath, candidate);
  });
  expectCode(result, 'E_PHASE12_RAW_CHAT_NOT_AUTHORITY');
});

test('rejects clipboard relay substrate', async () => {
  const result = await withTempFixture(async (root) => {
    const runPath = path.join(root, 'accept', 'run.json');
    const run = await readJson(runPath);
    run.relaySubstrate = 'clipboard';
    await writeJson(runPath, run);
  });
  expectCode(result, 'E_PHASE12_GUI_CLIPBOARD_FORBIDDEN');
});

test('rejects provider automation authorization', async () => {
  const result = await withTempFixture(async (root) => {
    const runPath = path.join(root, 'accept', 'run.json');
    const run = await readJson(runPath);
    run.providerAutomationAllowed = true;
    await writeJson(runPath, run);
  });
  expectCode(result, 'E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN');
});

test('rejects an accepted stale run', async () => {
  const result = await withTempFixture(async (root) => {
    const runPath = path.join(root, 'accept', 'run.json');
    const run = await readJson(runPath);
    run.state = 'STALE';
    await writeJson(runPath, run);
  });
  expectCode(result, 'E_PHASE12_STALE_RUN_ACCEPTED');
});

test('rejects missing budget caps', async () => {
  const result = await withTempFixture(async (root) => {
    const runPath = path.join(root, 'accept', 'run.json');
    const run = await readJson(runPath);
    delete run.budget;
    await writeJson(runPath, run);
  });
  expectCode(result, 'E_PHASE12_CAPS_REQUIRED');
});

test('rejects REDIRECT without required actions', async () => {
  const result = await withTempFixture(async (root) => {
    const reviewPath = path.join(root, 'redirect', 'review.json');
    const review = await readJson(reviewPath);
    review.requiredActions = [];
    await writeJson(reviewPath, review);
  });
  expectCode(result, 'E_PHASE12_REDIRECT_ACTION_REQUIRED');
});
