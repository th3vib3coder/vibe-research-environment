import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, readJson, repoRoot, runValidator } from './_helpers.js';

export const GOVERNANCE_SNAPSHOT_PATH =
  'environment/governance/private-wiki-governance-snapshot.json';

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REQUIRED_PRIVATE_SOURCE_IDS = Object.freeze([
  'decision-gates',
  'current-status',
  'phase14-status-ledger'
]);

const REQUIRED_CLOSED_SURFACES = Object.freeze([
  'providerAutomation',
  'obdkAutomation',
  'reviewedApiAutomation',
  'realDataReads',
  'biomedicalClaimAuthority',
  'claimExport',
  'graphify',
  'cliDispatch',
  'browserGui',
  'childProcess',
  'persistentPhase12Writer',
  't26.1',
  't26.2',
  't26.3',
  'unattendedRuntime'
]);

function sourceById(snapshot) {
  return new Map(
    (snapshot.privateSourceDigests ?? []).map((source) => [source.sourceId, source])
  );
}

async function sha256File(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function defaultPrivateRoot(localRepoRoot) {
  return path.resolve(localRepoRoot, '../vibe-science/blueprints/private');
}

async function validatePrivateParity(snapshot, options) {
  const privateRoot = options.privateRoot ?? process.env.VRE_PRIVATE_WIKI_ROOT
    ?? defaultPrivateRoot(options.repoRoot ?? repoRoot);

  if (!(await pathExists(privateRoot))) {
    return {
      checked: false,
      reason: 'private wiki root absent; public CI validates committed digest only'
    };
  }

  for (const source of snapshot.privateSourceDigests) {
    const actualHash = await sha256File(path.join(privateRoot, source.privateRelativePath));
    assert(
      actualHash === source.sha256,
      `E_GOVERNANCE_SNAPSHOT_PRIVATE_HASH_MISMATCH ${source.sourceId}`
    );
  }

  return {
    checked: true,
    privateRoot
  };
}

export async function validateGovernanceSnapshot(options = {}) {
  const snapshot = options.snapshot
    ?? await readJson(options.snapshotPath ?? GOVERNANCE_SNAPSHOT_PATH);

  assert(
    snapshot.schemaVersion === 'vre.private-wiki-governance-snapshot.v1',
    'E_GOVERNANCE_SNAPSHOT_SCHEMA_VERSION'
  );
  assert(
    snapshot.sourceModel === 'private-okf-like-llm-wiki',
    'E_GOVERNANCE_SNAPSHOT_SOURCE_MODEL'
  );
  assert(
    snapshot.privacyBoundary?.privateWikiPublishable === false,
    'E_GOVERNANCE_SNAPSHOT_PRIVATE_WIKI_MUST_NOT_BE_PUBLISHABLE'
  );
  assert(
    snapshot.privacyBoundary?.publicSnapshotOnly === true,
    'E_GOVERNANCE_SNAPSHOT_PUBLIC_DIGEST_REQUIRED'
  );
  assert(
    snapshot.privacyBoundary?.privateContentIncluded === false,
    'E_GOVERNANCE_SNAPSHOT_PRIVATE_CONTENT_LEAK'
  );
  assert(
    snapshot.okfAlignment?.level === 'L2-private-wiki',
    'E_GOVERNANCE_SNAPSHOT_OKF_LEVEL'
  );

  const sources = sourceById(snapshot);
  for (const sourceId of REQUIRED_PRIVATE_SOURCE_IDS) {
    const source = sources.get(sourceId);
    assert(source, `E_GOVERNANCE_SNAPSHOT_SOURCE_MISSING ${sourceId}`);
    assert(source.publishable === false, `E_GOVERNANCE_SNAPSHOT_SOURCE_PUBLISHABLE ${sourceId}`);
    assert(HASH_PATTERN.test(source.sha256), `E_GOVERNANCE_SNAPSHOT_HASH_INVALID ${sourceId}`);
  }

  const digest = snapshot.governanceDigest ?? {};
  assert(digest.totalGateRecords === 197, 'E_GOVERNANCE_SNAPSHOT_GATE_COUNT');
  assert(
    digest.statusHistogram?.['closed-pushed-ci-green'] === 71,
    'E_GOVERNANCE_SNAPSHOT_CLOSED_PUSHED_COUNT'
  );
  assert(
    digest.statusHistogram?.['hat3-accepted-local-uncommitted'] === 41,
    'E_GOVERNANCE_SNAPSHOT_LOCAL_UNCOMMITTED_COUNT'
  );

  const t26 = snapshot.requiredTruth?.t26 ?? {};
  assert(t26.status === 'closed-pushed-ci-green', 'E_GOVERNANCE_SNAPSHOT_T26_STATUS');
  assert(t26.commitShortSha === '411c62b', 'E_GOVERNANCE_SNAPSHOT_T26_COMMIT');
  assert(t26.ciRunId === '28117027186', 'E_GOVERNANCE_SNAPSHOT_T26_CI_RUN');
  assert(t26.ciConclusion === 'success', 'E_GOVERNANCE_SNAPSHOT_T26_CI_CONCLUSION');
  assert(t26.unattendedRuntimeAllowed === false, 'E_GOVERNANCE_SNAPSHOT_UNATTENDED_OPENED');
  assert(
    snapshot.requiredTruth?.readyForTesting === true,
    'E_GOVERNANCE_SNAPSHOT_READY_FOR_TESTING'
  );

  const closed = new Set(snapshot.requiredTruth?.closedSurfaces ?? []);
  for (const surface of REQUIRED_CLOSED_SURFACES) {
    assert(closed.has(surface), `E_GOVERNANCE_SNAPSHOT_CLOSED_SURFACE_MISSING ${surface}`);
  }

  return validatePrivateParity(snapshot, options);
}

export default async function validateGovernanceSnapshotDefault(options = {}) {
  await validateGovernanceSnapshot(options);
}

if (isDirectRun(import.meta)) {
  await runValidator('validate-governance-snapshot', validateGovernanceSnapshotDefault);
}
