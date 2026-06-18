import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  loadValidator,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';
import { validatePhase12ArtifactSet } from './artifact-contracts.js';

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

export class Phase12ManualAdapterError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'Phase12ManualAdapterError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '(root)'} ${error.message}`)
    .join('; ');
}

function resolveFixtureDirectory(projectRoot, fixturePath) {
  if (typeof fixturePath !== 'string' || fixturePath.trim() === '') {
    throw new Phase12ManualAdapterError({
      code: 'E_PHASE12_ADVERSARIAL_FIXTURE_REQUIRED',
      exitCode: 3,
      message: 'adversarial command requires --fixture.'
    });
  }

  try {
    return resolveInside(resolveProjectRoot(projectRoot), fixturePath.trim());
  } catch {
    throw new Phase12ManualAdapterError({
      code: 'E_PHASE12_ADVERSARIAL_FIXTURE_ESCAPE',
      exitCode: 3,
      message: 'adversarial fixture path must stay inside the VRE repo.',
      extra: { fixturePath }
    });
  }
}

async function readRecord(filePath, issues, label) {
  try {
    return await readJson(filePath);
  } catch (error) {
    issues.push(issue('E_PHASE12_DRY_RUN_FILE_INVALID', {
      file: normalizePath(filePath),
      label,
      message: error.message
    }));
    return null;
  }
}

async function validateRecord(projectRoot, schemaFile, value, issues, label) {
  if (value == null) {
    return;
  }

  const validate = await loadValidator(projectRoot, schemaFile);
  if (!validate(value)) {
    issues.push(issue('E_PHASE12_DRY_RUN_SCHEMA_INVALID', {
      label,
      schemaFile,
      details: formatSchemaErrors(validate.errors)
    }));
  }
}

function collectEvidenceRefs(evidenceBundle) {
  return [
    ...(evidenceBundle?.artifacts ?? []).map((artifact) => ({
      kind: artifact.type,
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.reviewArtifacts ?? []).map((artifact) => ({
      kind: artifact.type,
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.validation ?? []).map((artifact) => ({
      kind: artifact.type,
      path: artifact.evidenceRef,
      sha256: artifact.sha256
    }))
  ];
}

async function sha256File(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function validateHashes(fixtureDirectory, evidenceBundle, issues) {
  const evidenceRefs = collectEvidenceRefs(evidenceBundle);

  for (const ref of evidenceRefs) {
    if (typeof ref.path !== 'string' || typeof ref.sha256 !== 'string') {
      continue;
    }

    let fullPath;
    try {
      fullPath = resolveInside(fixtureDirectory, ref.path);
    } catch {
      issues.push(issue('E_PHASE12_DRY_RUN_PATH_ESCAPE', {
        path: ref.path
      }));
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

  return evidenceRefs;
}

function validateRunIds(records, issues) {
  const runIds = new Set(
    Object.values(records)
      .map((record) => record?.runId)
      .filter((value) => typeof value === 'string')
  );

  if (runIds.size > 1) {
    issues.push(issue('E_PHASE12_DRY_RUN_RUN_ID_MISMATCH', {
      runIds: [...runIds].sort()
    }));
  }
}

function artifactPath(projectRoot, fixtureDirectory, fileName) {
  return normalizePath(path.relative(projectRoot, path.join(fixtureDirectory, fileName)));
}

async function loadManualRelayFixture(projectRoot, fixturePath) {
  const root = resolveProjectRoot(projectRoot);
  const fixtureDirectory = resolveFixtureDirectory(root, fixturePath);
  const records = {};
  const issues = [];

  for (const [label, [fileName, schemaFile]] of Object.entries(CONTRACT_FILES)) {
    const filePath = path.join(fixtureDirectory, fileName);
    records[label] = await readRecord(filePath, issues, label);
    await validateRecord(root, schemaFile, records[label], issues, label);
  }

  validateRunIds(records, issues);
  const evidenceRefs = await validateHashes(
    fixtureDirectory,
    records.evidenceBundle,
    issues
  );
  issues.push(...validatePhase12ArtifactSet(records).issues);

  if (issues.length > 0) {
    throw new Phase12ManualAdapterError({
      code: 'E_PHASE12_ADVERSARIAL_ARTIFACT_INVALID',
      message: 'Phase 12 adversarial artifact directory is invalid.',
      extra: { issues }
    });
  }

  return {
    projectRoot: root,
    fixtureDirectory,
    fixturePath: normalizePath(path.relative(root, fixtureDirectory)),
    records,
    evidenceRefs
  };
}

function providerIdentity(records) {
  return {
    activeAuthor: records.run.activeAuthor,
    counterReviewer: records.run.counterReviewer,
    reviewer: records.review.reviewer,
    invocationMode: 'manual-filesystem',
    relaySubstrate: records.run.relaySubstrate
  };
}

function automationStatus(records) {
  return {
    providerAutomationAllowed: records.run.providerAutomationAllowed,
    guiAutomationAllowed: records.run.guiAutomationAllowed,
    runStateCreated: false
  };
}

function contractArtifacts(projectRoot, fixtureDirectory) {
  return Object.entries(CONTRACT_FILES).map(([kind, [fileName]]) => ({
    kind: kind.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`),
    path: artifactPath(projectRoot, fixtureDirectory, fileName)
  }));
}

export async function buildManualRelayStatus(projectRoot, options = {}) {
  const loaded = await loadManualRelayFixture(projectRoot, options.fixturePath);
  const { records } = loaded;

  return {
    ok: true,
    command: 'adversarial status',
    phase12: true,
    adapterMode: 'manual-read-only',
    fixturePath: loaded.fixturePath,
    runId: records.run.runId,
    state: records.run.state,
    activeAuthor: records.run.activeAuthor,
    counterReviewer: records.run.counterReviewer,
    operator: records.run.operator,
    providerIdentity: providerIdentity(records),
    candidate: {
      artifactId: records.candidate.artifactId,
      artifactKind: records.candidate.artifactKind,
      author: records.candidate.author,
      artifactPath: records.candidate.artifactPath
    },
    review: {
      reviewId: records.review.reviewId,
      reviewer: records.review.reviewer,
      verdict: records.review.verdict,
      requiredActions: records.review.requiredActions
    },
    finalVerdict: {
      accepted: records.finalVerdict.accepted,
      verdict: records.review.verdict,
      finalState: records.finalVerdict.finalState,
      acceptedBy: records.finalVerdict.acceptedBy ?? null
    },
    evidence: {
      verified: true,
      refs: loaded.evidenceRefs.length
    },
    automation: automationStatus(records)
  };
}

export async function buildManualRelayPacket(projectRoot, options = {}) {
  const loaded = await loadManualRelayFixture(projectRoot, options.fixturePath);
  const { records } = loaded;

  return {
    ok: true,
    command: 'adversarial packet',
    phase12: true,
    adapterMode: 'manual-read-only',
    packet: {
      schemaVersion: 'phase12.manual-relay-packet.v1',
      runId: records.run.runId,
      state: records.run.state,
      fixturePath: loaded.fixturePath,
      providerIdentity: providerIdentity(records),
      artifacts: contractArtifacts(loaded.projectRoot, loaded.fixtureDirectory),
      evidenceRefs: loaded.evidenceRefs.map((ref) => ({
        kind: ref.kind,
        path: ref.path,
        sha256: ref.sha256
      })),
      automation: automationStatus(records)
    }
  };
}
