import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assert,
  formatErrors,
  isDirectRun,
  repoRoot,
  runValidator,
  validateWithSchema
} from './_helpers.js';
import {
  validatePhase12ArtifactSet
} from '../../phase12/artifact-contracts.js';

const DEFAULT_ROOT = 'environment/tests/fixtures/phase12/manual-relay-dry-run';

const SCENARIOS = Object.freeze([
  ['accept', 'ACCEPT', 'E_PHASE12_DRY_RUN_ACCEPT_PATH_REQUIRED'],
  ['redirect', 'REDIRECT', 'E_PHASE12_DRY_RUN_REDIRECT_PATH_REQUIRED']
]);

const CONTRACT_FILES = Object.freeze({
  run: ['run.json', 'phase12-relay-run.schema.json'],
  candidate: ['candidate.json', 'phase12-relay-candidate.schema.json'],
  review: ['review.json', 'phase12-relay-review.schema.json'],
  rebuttal: ['rebuttal.json', 'phase12-relay-rebuttal.schema.json'],
  finalVerdict: ['final-verdict.json', 'phase12-relay-final-verdict.schema.json'],
  evidenceBundle: [
    'evidence-bundle.json',
    'phase12-relay-evidence-bundle.schema.json'
  ],
  phase10Law13ReviewExtension: [
    'phase10-law13-review-extension.json',
    'phase12-phase10-law13-review-extension.schema.json'
  ],
  phase11GraphReviewExtension: [
    'phase11-graph-review-extension.json',
    'phase12-phase11-graph-review-extension.schema.json'
  ]
});

function issue(code, extra = {}) {
  return { code, ...extra };
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function resolveRoot(rootPath) {
  return rootPath ?? path.join(repoRoot, DEFAULT_ROOT);
}

function resolveInside(basePath, relativePath, issues) {
  const fullPath = path.resolve(basePath, relativePath);
  const relative = path.relative(basePath, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    issues.push(issue('E_PHASE12_DRY_RUN_PATH_ESCAPE', {
      path: relativePath
    }));
    return null;
  }
  return fullPath;
}

async function readJsonFile(filePath, issues, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    issues.push(issue('E_PHASE12_DRY_RUN_FILE_INVALID', {
      file: normalizePath(filePath),
      label,
      message: error.message
    }));
    return null;
  }
}

async function validateContract(schemaFile, value, issues, label) {
  if (value == null) {
    return;
  }

  const result = await validateWithSchema(`environment/schemas/${schemaFile}`, value);
  if (!result.ok) {
    issues.push(issue('E_PHASE12_DRY_RUN_SCHEMA_INVALID', {
      label,
      schemaFile,
      details: formatErrors(result.errors)
    }));
  }
}

function collectEvidenceRefs(evidenceBundle) {
  return [
    ...(evidenceBundle?.artifacts ?? []).map((artifact) => ({
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.reviewArtifacts ?? []).map((artifact) => ({
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.validation ?? []).map((artifact) => ({
      path: artifact.evidenceRef,
      sha256: artifact.sha256
    }))
  ];
}

async function sha256File(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function validateHashes(scenarioPath, evidenceBundle, issues) {
  for (const ref of collectEvidenceRefs(evidenceBundle)) {
    if (typeof ref.path !== 'string' || typeof ref.sha256 !== 'string') {
      continue;
    }

    const fullPath = resolveInside(scenarioPath, ref.path, issues);
    if (fullPath == null) {
      continue;
    }

    let actual;
    try {
      actual = await sha256File(fullPath);
    } catch (error) {
      issues.push(issue('E_PHASE12_DRY_RUN_HASHED_FILE_MISSING', {
        path: ref.path,
        message: error.message
      }));
      continue;
    }

    if (actual !== ref.sha256) {
      issues.push(issue('E_PHASE12_DRY_RUN_HASH_MISMATCH', {
        path: ref.path,
        expected: ref.sha256,
        actual
      }));
    }
  }
}

function validateRunIds(records, issues, scenarioName) {
  const ids = new Set(
    Object.values(records)
      .map((record) => record?.runId)
      .filter((value) => typeof value === 'string')
  );

  if (ids.size > 1) {
    issues.push(issue('E_PHASE12_DRY_RUN_RUN_ID_MISMATCH', {
      scenario: scenarioName,
      runIds: [...ids].sort()
    }));
  }
}

async function validateScenario(rootPath, scenarioName, expectedVerdict, requiredCode) {
  const issues = [];
  const scenarioPath = path.join(rootPath, scenarioName);
  const records = {};

  for (const [label, [fileName, schemaFile]] of Object.entries(CONTRACT_FILES)) {
    const filePath = path.join(scenarioPath, fileName);
    records[label] = await readJsonFile(filePath, issues, label);
    await validateContract(schemaFile, records[label], issues, label);
  }

  if (records.review?.verdict !== expectedVerdict) {
    issues.push(issue(requiredCode, {
      scenario: scenarioName,
      actualVerdict: records.review?.verdict
    }));
  }

  if (expectedVerdict === 'ACCEPT' && records.finalVerdict?.accepted !== true) {
    issues.push(issue(requiredCode, {
      scenario: scenarioName,
      accepted: records.finalVerdict?.accepted
    }));
  }

  if (expectedVerdict === 'REDIRECT'
    && records.review?.requiredActions?.length < 1) {
    issues.push(issue(requiredCode, {
      scenario: scenarioName,
      requiredActions: records.review?.requiredActions?.length ?? 0
    }));
  }

  validateRunIds(records, issues, scenarioName);
  await validateHashes(scenarioPath, records.evidenceBundle, issues);

  const semantic = validatePhase12ArtifactSet(records);
  issues.push(...semantic.issues);

  return issues;
}

export async function validateManualRelayDryRun(options = {}) {
  const rootPath = resolveRoot(options.rootPath);
  const issues = [];

  for (const [scenarioName, expectedVerdict, requiredCode] of SCENARIOS) {
    issues.push(
      ...(await validateScenario(rootPath, scenarioName, expectedVerdict, requiredCode))
    );
  }

  return { ok: issues.length === 0, issues };
}

export default async function validatePhase12ManualRelayDryRun() {
  const result = await validateManualRelayDryRun();
  assert(
    result.ok,
    `Phase 12 manual relay dry run failed: ${JSON.stringify(result.issues)}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-manual-relay-dry-run', validatePhase12ManualRelayDryRun);
}
