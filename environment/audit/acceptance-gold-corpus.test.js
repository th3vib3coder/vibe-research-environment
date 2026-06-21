import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createClaimEdge } from '../claims/edges.js';
import {
  buildEvidenceExcerpt,
  reconcileEvidenceExcerpt
} from './query.js';
import { writeWakeProof } from './wake-proof.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const FIXTURE_ROOT = path.join(
  REPO_ROOT,
  'environment',
  '__fixtures__',
  'acceptance',
  'gold-corpus'
);
const VALIDATOR_PATH = path.join(REPO_ROOT, 'tools', 'validate-wake-proof.mjs');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const TEST_KEY = 'unit-test-w6-acceptance-wake-proof-secret';
const ACCEPTANCE_RANGE = Object.freeze({
  from: '2026-06-21T00:00:00.000Z',
  to: '2026-06-21T23:59:59.999Z'
});

class AcceptanceScenarioError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AcceptanceScenarioError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new AcceptanceScenarioError(code, message, extra);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, 'utf8');
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

async function writeJsonl(filePath, rows) {
  await writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : ''),
    'utf8'
  );
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const value = row?.[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail('E_ACCEPTANCE_COUNT_FIELD_MISSING', `${field} is missing.`);
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
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

async function withTempProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-w6-acceptance-'));
  try {
    return await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function writeAuditCliStub(projectRoot, governancePath) {
  const cliPath = path.join(projectRoot, 'audit-query-cli.mjs');
  await writeFile(cliPath, [
    "import { readFileSync } from 'node:fs';",
    `const governancePath = ${JSON.stringify(governancePath)};`,
    "const stdin = readFileSync(0, 'utf8');",
    "const payload = stdin.trim() === '' ? {} : JSON.parse(stdin);",
    "const rows = readFileSync(governancePath, 'utf8')",
    "  .split(/\\r?\\n/u)",
    "  .filter((line) => line.trim() !== '')",
    "  .map((line) => JSON.parse(line));",
    'const byKey = new Map();',
    'for (const row of rows) {',
    '  if (payload.objectiveId && row.objectiveId !== payload.objectiveId) continue;',
    "  const key = `${row.event_type}\\u0000${row.source_component ?? null}`;",
    '  byKey.set(key, (byKey.get(key) ?? 0) + 1);',
    '}',
    'const aggregated = [...byKey.entries()].map(([key, count]) => {',
    "  const [event_type, source_component] = key.split('\\u0000');",
    '  return { event_type, source_component, count };',
    '});',
    "process.stdout.write(`${JSON.stringify({ ok: true, rows: aggregated })}\\n`);",
    ''
  ].join('\n'), 'utf8');
  return cliPath;
}

function acceptingResolver() {
  return true;
}

async function materializeGoldCorpus(projectRoot, mutateCorpus = null) {
  const corpusRoot = path.join(projectRoot, 'gold-corpus');
  await cp(FIXTURE_ROOT, corpusRoot, { recursive: true });

  const expectedPath = path.join(corpusRoot, 'expected-counts.json');
  const governancePath = path.join(corpusRoot, 'governance-events.jsonl');
  const edgesPath = path.join(corpusRoot, 'edges.jsonl');
  const r2Path = path.join(corpusRoot, 'r2-verdicts.jsonl');
  const expected = await readJson(expectedPath);

  if (mutateCorpus != null) {
    await mutateCorpus({ corpusRoot, expected, governancePath, edgesPath, r2Path });
  }

  const edges = await readJsonl(edgesPath);
  for (const edge of edges) {
    await createClaimEdge(projectRoot, edge, {
      claimResolver: acceptingResolver
    });
  }

  const cliPath = await writeAuditCliStub(projectRoot, governancePath);
  return { corpusRoot, expected, governancePath, edgesPath, r2Path, cliPath };
}

async function buildDiskGroundedExcerpt(projectRoot, materialized) {
  return withEnv({ VIBE_SCIENCE_AUDIT_QUERY_CLI: materialized.cliPath }, async () => {
    const excerpt = await buildEvidenceExcerpt(projectRoot, {
      ...ACCEPTANCE_RANGE,
      objectiveId: materialized.expected.objectiveId
    });
    const r2Verdicts = await readJsonl(materialized.r2Path);
    return {
      ...excerpt,
      r2_verdicts_by_status: countBy(r2Verdicts, 'status')
    };
  });
}

function assertTimestampedBundlePath(bundleDir) {
  assert.match(
    bundleDir,
    /evidence-bundles[\\/]+OBJ-W6-GOLD-CORPUS-SYNTHETIC[\\/]+20260621T110000Z$/u,
    'E_ACCEPTANCE_BUNDLE_PATH_NOT_TIMESTAMPED'
  );
}

function assertSharedObjective({ expected, excerpt, proof }) {
  if (
    excerpt.summary.objective_id !== expected.objectiveId ||
    proof.objectiveId !== expected.objectiveId
  ) {
    fail('E_ACCEPTANCE_OBJECTIVE_MISMATCH', 'bundle artifacts do not share objectiveId.', {
      expected: expected.objectiveId,
      excerpt: excerpt.summary.objective_id,
      proof: proof.objectiveId
    });
  }
}

async function runWakeProofValidator(filePath, key = TEST_KEY) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [VALIDATOR_PATH, filePath], {
      cwd: REPO_ROOT,
      env: { ...process.env, VRE_WAKE_PROOF_KEY: key },
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function runGoldCorpusAcceptanceScenario({
  mutateCorpus = null,
  signingKey = TEST_KEY,
  tamperWakeProof = null,
  wakeInputOverrides = {}
} = {}) {
  return withTempProject(async (projectRoot) => {
    const materialized = await materializeGoldCorpus(projectRoot, mutateCorpus);
    const excerpt = await buildDiskGroundedExcerpt(projectRoot, materialized);
    const reconciliation = reconcileEvidenceExcerpt(excerpt, materialized.expected);

    const bundleDir = path.join(
      projectRoot,
      'evidence-bundles',
      materialized.expected.objectiveId,
      '20260621T110000Z'
    );
    await mkdir(bundleDir, { recursive: true });
    assertTimestampedBundlePath(bundleDir);

    const wakeInput = {
      objectiveId: materialized.expected.objectiveId,
      wakeId: 'WAKE-W6-6-GOLD-001',
      scheduled: '2026-06-21T11:00:00.000Z',
      actual: '2026-06-21T11:00:10.000Z',
      wakeReason: 'heartbeat',
      leaseState: {
        status: 'acquired',
        ownerWakeId: 'WAKE-W6-6-GOLD-001',
        expiresAt: '2026-06-21T11:05:00.000Z'
      },
      ...wakeInputOverrides
    };
    const wakeProof = await writeWakeProof(bundleDir, wakeInput, {
      key: signingKey,
      timestampSegment: '20260621T110010Z'
    });

    if (tamperWakeProof != null) {
      const tampered = {
        ...wakeProof.proof,
        ...tamperWakeProof(wakeProof.proof)
      };
      await writeFile(wakeProof.filePath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    }

    const validatorResult = await runWakeProofValidator(wakeProof.filePath);
    if (validatorResult.status !== 0) {
      fail('E_ACCEPTANCE_WAKE_PROOF_INVALID', 'offline validator rejected proof', {
        stdout: validatorResult.stdout,
        stderr: validatorResult.stderr
      });
    }

    const storedProof = await readJson(wakeProof.filePath);
    assertSharedObjective({
      expected: materialized.expected,
      excerpt,
      proof: storedProof
    });

    return {
      projectRoot,
      materialized,
      excerpt,
      reconciliation,
      proofPath: wakeProof.filePath,
      validatorResult
    };
  });
}

async function expectScenarioError(options, code) {
  await assert.rejects(
    () => runGoldCorpusAcceptanceScenario(options),
    (error) => error?.code === code || error?.message?.includes(code)
  );
}

test('gold corpus acceptance scenario passes end-to-end', async () => {
  const result = await runGoldCorpusAcceptanceScenario();
  assert.deepEqual(result.reconciliation, { ok: true });
  assert.equal(result.validatorResult.status, 0);
  assert.match(result.validatorResult.stdout, /wake-proof valid/u);
  assert.equal(result.excerpt.summary.objective_id, result.materialized.expected.objectiveId);
  assert.ok(result.proofPath.endsWith('wake-proof-20260621T110010Z.json'));
});

test('r2 verdict counts are derived from materialized disk rows', async () => {
  await expectScenarioError({
    mutateCorpus: async ({ r2Path }) => {
      const r2Verdicts = await readJsonl(r2Path);
      await writeJsonl(r2Path, r2Verdicts.slice(0, 1));
    }
  }, 'E_EVIDENCE_RECONCILE_FALSE_ZERO');
});

test('governance r2 request events cannot satisfy r2 verdict counts', async () => {
  await expectScenarioError({
    mutateCorpus: async ({ r2Path }) => {
      await writeJsonl(r2Path, []);
    }
  }, 'E_EVIDENCE_RECONCILE_FALSE_ZERO');
});

test('governance and edge divergence fail closed', async () => {
  await expectScenarioError({
    mutateCorpus: async ({ governancePath }) => {
      const governanceRows = await readJsonl(governancePath);
      governanceRows[0].event_type = 'objective.changed-after-expected-loaded';
      await writeJsonl(governancePath, governanceRows);
    }
  }, 'E_EVIDENCE_RECONCILE_DIVERGENCE');

  await expectScenarioError({
    mutateCorpus: async ({ edgesPath }) => {
      const edgeRows = await readJsonl(edgesPath);
      await writeJsonl(edgesPath, edgeRows.slice(1));
    }
  }, 'E_EVIDENCE_RECONCILE_FALSE_ZERO');
});

test('objective mismatch and tampered wake proof fail closed', async () => {
  await expectScenarioError({
    wakeInputOverrides: { objectiveId: 'OBJ-W6-GOLD-CORPUS-OTHER' }
  }, 'E_ACCEPTANCE_OBJECTIVE_MISMATCH');

  await expectScenarioError({
    tamperWakeProof: () => ({ wakeReason: 'manual' })
  }, 'E_ACCEPTANCE_WAKE_PROOF_INVALID');
});

test('missing signing key fails closed before an unsigned proof exists', async () => {
  await assert.rejects(
    () => runGoldCorpusAcceptanceScenario({ signingKey: '' }),
    (error) => error?.code === 'E_WAKE_PROOF_KEY_MISSING'
  );
});

test('package script and source stay wired to reviewed surfaces', async () => {
  const packageJson = await readJson(PACKAGE_JSON_PATH);
  assert.equal(
    packageJson.scripts['test:accept:gold-corpus'],
    'node --test environment/audit/acceptance-gold-corpus.test.js'
  );

  const source = await readFile(fileURLToPath(import.meta.url), 'utf8');
  assert.match(source, /from '\.\/query\.js'/u);
  assert.match(source, /from '\.\/wake-proof\.js'/u);
  assert.match(source, /r2-verdicts\.jsonl/u);
  assert.match(source, /runWakeProofValidator/u);
  assert.doesNotMatch(source, /r2_verdicts_by_status:\s*materialized\.expected\.r2Verdicts\.byStatus/u);
  for (const token of [
    'signWakeProof' + 'Payload',
    'canonicalizeFor' + 'WakeProof',
    'node:' + 'http',
    'node:' + 'https',
    'clip' + 'board',
    'cla' + 'ude',
    'prov' + 'ider'
  ]) {
    assert.equal(source.includes(token), false, `${token} must not appear in capstone source.`);
  }
});
