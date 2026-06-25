import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGovernanceSnapshot,
} from './validate-governance-snapshot.js';

const VALID_HASH = 'a'.repeat(64);

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validSnapshot({
  hashes = {
    decisionGates: VALID_HASH,
    currentStatus: VALID_HASH,
    phase14StatusLedger: VALID_HASH
  },
  digest = {
    totalGateRecords: 2,
    statusHistogram: {
      'closed-pushed-ci-green': 1,
      'closed-docs-no-vre-commit': 0,
      'hat3-accepted-local-uncommitted': 1
    },
    knownResiduals: [
      {
        id: 'hat3-accepted-local-uncommitted',
        count: 1,
        severity: 'hardening-required',
        nextAction: 'Classify and reconcile before full governance closure.'
      }
    ]
  }
} = {}) {
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
        sha256: hashes.decisionGates,
        publishable: false
      },
      {
        sourceId: 'current-status',
        privateRelativePath: 'WIKI_VRE/state/current-status.md',
        sha256: hashes.currentStatus,
        publishable: false
      },
      {
        sourceId: 'phase14-status-ledger',
        privateRelativePath: 'phase14-world-class-vre/phase14-world-class-status-ledger.md',
        sha256: hashes.phase14StatusLedger,
        publishable: false
      }
    ],
    governanceDigest: digest,
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

function minimalDecisionGates() {
  return {
    $schema: 'vre.decision-gates.v2',
    gates: {
      closed: { status: 'closed-pushed-ci-green' },
      local: { status: 'hat3-accepted-local-uncommitted' }
    }
  };
}

async function writePrivateRoot({ decisionGates = minimalDecisionGates() } = {}) {
  const root = path.join(tmpdir(), `vre-private-wiki-${process.pid}-${Date.now()}`);
  const decisionGatesText = `${JSON.stringify(decisionGates, null, 2)}\n`;
  const currentStatusText = 'current status\n';
  const phase14StatusLedgerText = 'phase14 status ledger\n';

  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'WIKI_VRE/state'), { recursive: true });
  await mkdir(path.join(root, 'phase14-world-class-vre'), { recursive: true });
  await writeFile(path.join(root, 'WIKI_VRE/state/decision-gates.json'), decisionGatesText);
  await writeFile(path.join(root, 'WIKI_VRE/state/current-status.md'), currentStatusText);
  await writeFile(
    path.join(root, 'phase14-world-class-vre/phase14-world-class-status-ledger.md'),
    phase14StatusLedgerText
  );

  return {
    root,
    hashes: {
      decisionGates: sha256Text(decisionGatesText),
      currentStatus: sha256Text(currentStatusText),
      phase14StatusLedger: sha256Text(phase14StatusLedgerText)
    }
  };
}

async function assertRejectsWithCode(snapshot, code) {
  await assert.rejects(
    () => validateGovernanceSnapshot({
      snapshot,
      privateRoot: path.join(tmpdir(), 'absent-vre-wiki')
    }),
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

  await assertRejectsWithCode(
    snapshot,
    'E_GOVERNANCE_SNAPSHOT_PRIVATE_WIKI_MUST_NOT_BE_PUBLISHABLE'
  );
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
  const root = path.join(tmpdir(), `vre-private-wiki-mismatch-${process.pid}`);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'WIKI_VRE/state'), { recursive: true });
  await mkdir(path.join(root, 'phase14-world-class-vre'), { recursive: true });
  await writeFile(path.join(root, 'WIKI_VRE/state/decision-gates.json'), 'actual');
  await writeFile(path.join(root, 'WIKI_VRE/state/current-status.md'), 'actual');
  await writeFile(
    path.join(root, 'phase14-world-class-vre/phase14-world-class-status-ledger.md'),
    'actual'
  );

  const snapshot = validSnapshot();

  await assert.rejects(
    () => validateGovernanceSnapshot({ snapshot, privateRoot: root }),
    (error) => error.message.includes('E_GOVERNANCE_SNAPSHOT_PRIVATE_HASH_MISMATCH')
  );
});

test('governance snapshot derives private gate counts from a small live gate file', async () => {
  const fixture = await writePrivateRoot();
  try {
    const result = await validateGovernanceSnapshot({
      snapshot: validSnapshot({ hashes: fixture.hashes }),
      privateRoot: fixture.root
    });

    assert.equal(result.checked, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('governance snapshot rejects private total gate count mismatch', async () => {
  const fixture = await writePrivateRoot();
  try {
    const snapshot = validSnapshot({ hashes: fixture.hashes });
    snapshot.governanceDigest.totalGateRecords += 1;

    await assert.rejects(
      () => validateGovernanceSnapshot({ snapshot, privateRoot: fixture.root }),
      (error) => error.message.includes('E_GOVERNANCE_SNAPSHOT_GATE_COUNT')
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('governance snapshot rejects private closed-pushed count mismatch', async () => {
  const fixture = await writePrivateRoot();
  try {
    const snapshot = validSnapshot({ hashes: fixture.hashes });
    snapshot.governanceDigest.statusHistogram['closed-pushed-ci-green'] += 1;

    await assert.rejects(
      () => validateGovernanceSnapshot({ snapshot, privateRoot: fixture.root }),
      (error) => error.message.includes('E_GOVERNANCE_SNAPSHOT_STATUS_COUNT_MISMATCH')
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('governance snapshot rejects private local-uncommitted count mismatch', async () => {
  const fixture = await writePrivateRoot();
  try {
    const snapshot = validSnapshot({ hashes: fixture.hashes });
    snapshot.governanceDigest.statusHistogram['hat3-accepted-local-uncommitted'] = 0;
    snapshot.governanceDigest.knownResiduals[0].count = 0;

    await assert.rejects(
      () => validateGovernanceSnapshot({ snapshot, privateRoot: fixture.root }),
      (error) => error.message.includes('E_GOVERNANCE_SNAPSHOT_STATUS_COUNT_MISMATCH')
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('governance snapshot rejects hidden local-uncommitted residual debt', async () => {
  const snapshot = validSnapshot();
  snapshot.governanceDigest.knownResiduals[0].count = 0;

  await assertRejectsWithCode(
    snapshot,
    'E_GOVERNANCE_SNAPSHOT_LOCAL_UNCOMMITTED_RESIDUAL_COUNT'
  );
});

test('governance snapshot rejects impossible histogram counts without private root', async () => {
  const snapshot = validSnapshot();
  snapshot.governanceDigest.statusHistogram.impossible = snapshot.governanceDigest
    .totalGateRecords + 1;

  await assertRejectsWithCode(snapshot, 'E_GOVERNANCE_SNAPSHOT_STATUS_COUNT_RANGE');
});
