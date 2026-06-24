import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGovernanceSnapshot,
} from './validate-governance-snapshot.js';

const VALID_HASH = 'a'.repeat(64);

function validSnapshot() {
  return {
    schemaVersion: 'vre.private-wiki-governance-snapshot.v1',
    snapshotDate: '2026-06-25',
    sourceModel: 'private-okf-like-llm-wiki',
    privacyBoundary: {
      privateWikiPublishable: false,
      publicSnapshotOnly: true,
      privateContentIncluded: false
    },
    okfAlignment: {
      level: 'L2-private-wiki'
    },
    privateSourceDigests: [
      {
        sourceId: 'decision-gates',
        privateRelativePath: 'WIKI_VRE/state/decision-gates.json',
        sha256: VALID_HASH,
        publishable: false
      },
      {
        sourceId: 'current-status',
        privateRelativePath: 'WIKI_VRE/state/current-status.md',
        sha256: VALID_HASH,
        publishable: false
      },
      {
        sourceId: 'phase14-status-ledger',
        privateRelativePath: 'phase14-world-class-vre/phase14-world-class-status-ledger.md',
        sha256: VALID_HASH,
        publishable: false
      }
    ],
    governanceDigest: {
      totalGateRecords: 197,
      statusHistogram: {
        'closed-pushed-ci-green': 71,
        'hat3-accepted-local-uncommitted': 41
      }
    },
    requiredTruth: {
      readyForTesting: true,
      t26: {
        status: 'closed-pushed-ci-green',
        commitShortSha: '411c62b',
        ciRunId: '28117027186',
        ciConclusion: 'success',
        unattendedRuntimeAllowed: false
      },
      closedSurfaces: [
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
      ]
    }
  };
}

async function assertRejectsWithCode(snapshot, code) {
  await assert.rejects(
    () => validateGovernanceSnapshot({ snapshot, privateRoot: path.join(tmpdir(), 'absent-vre-wiki') }),
    (error) => error.message.includes(code)
  );
}

test('valid committed governance snapshot passes without private wiki checkout', async () => {
  const result = await validateGovernanceSnapshot({
    snapshot: validSnapshot(),
    privateRoot: path.join(tmpdir(), 'absent-vre-wiki')
  });

  assert.equal(result.checked, false);
});

test('governance snapshot refuses publishing the private wiki boundary', async () => {
  const snapshot = validSnapshot();
  snapshot.privacyBoundary.privateWikiPublishable = true;

  await assertRejectsWithCode(snapshot, 'E_GOVERNANCE_SNAPSHOT_PRIVATE_WIKI_MUST_NOT_BE_PUBLISHABLE');
});

test('governance snapshot refuses non-closed T26 truth', async () => {
  const snapshot = validSnapshot();
  snapshot.requiredTruth.t26.status = 'hat3-accepted-local-uncommitted';

  await assertRejectsWithCode(snapshot, 'E_GOVERNANCE_SNAPSHOT_T26_STATUS');
});

test('governance snapshot refuses invalid digest hashes', async () => {
  const snapshot = validSnapshot();
  snapshot.privateSourceDigests[0].sha256 = 'not-a-sha';

  await assertRejectsWithCode(snapshot, 'E_GOVERNANCE_SNAPSHOT_HASH_INVALID decision-gates');
});

test('governance snapshot compares private wiki hashes when root exists', async () => {
  const root = path.join(tmpdir(), `vre-private-wiki-${process.pid}`);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'WIKI_VRE/state'), { recursive: true });
  await mkdir(path.join(root, 'phase14-world-class-vre'), { recursive: true });
  await writeFile(path.join(root, 'WIKI_VRE/state/decision-gates.json'), 'actual');
  await writeFile(path.join(root, 'WIKI_VRE/state/current-status.md'), 'actual');
  await writeFile(path.join(root, 'phase14-world-class-vre/phase14-world-class-status-ledger.md'), 'actual');

  const snapshot = validSnapshot();

  await assert.rejects(
    () => validateGovernanceSnapshot({ snapshot, privateRoot: root }),
    (error) => error.message.includes('E_GOVERNANCE_SNAPSHOT_PRIVATE_HASH_MISMATCH')
  );
});
