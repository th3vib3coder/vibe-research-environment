import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..');
const privateRoot = path.resolve(vreRoot, '..', 'vibe-science', 'blueprints', 'private');

const targets = {
  phase9T55: 'phase9-implementation-plan/06d-T5.5-vre-event-emissions.md',
  phase9T57: 'phase9-implementation-plan/06d-T5.7-audit-queries.md',
  phase9Wave5: 'phase9-implementation-plan/06-wave-5-governance-audit.md',
  phase9Wave5Overview: 'phase9-implementation-plan/06d-wave-5-v2-1-overview.md',
  phase9QualityLeap: 'phase9-implementation-plan/15-post-wave-6-quality-leap-recommendation.md',
  phase9CrossWaveMatrix: 'phase9-implementation-plan/08-cross-wave-test-matrix.md',
  graphifyInstall: 'phase_11_integration_graphify/04-wave-1-policy-installation.md',
  graphifyCli: 'phase_11_integration_graphify/06-wave-3-vre-cli-wrapper.md',
  phase12Loop: 'phase_12_adversarial_relay/08-wave-4-loop-controller.md',
  phase12Protocol: 'phase_12_adversarial_relay/03-adversarial-pairing-protocol.md',
  phase11ScopeFreeze: 'phase_11_integration_graphify/03-wave-0-scope-freeze.md',
  phase11WikiBridge: 'phase_11_integration_graphify/07-wave-4-wiki-bridge.md',
  phase13ReviewIndex: 'phase_13_autonomous_scientist/adversarial_review/00-index.md',
  phase13Findings: 'phase_13_autonomous_scientist/adversarial_review/05-findings-ledger.md'
};

function normalize(text) {
  return text.replace(/\r\n/gu, '\n');
}

function readTargetOrSkip(t, relativePath) {
  const absolutePath = path.resolve(privateRoot, relativePath);
  if (fs.existsSync(absolutePath)) {
    return normalize(fs.readFileSync(absolutePath, 'utf8'));
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip(
      `SKIP_COR_SAFE_RELAY_PRIVATE_TARGET_MISSING: ${relativePath} absent in VRE-only CI checkout`
    );
    return null;
  }

  assert.fail(`Missing COR safe-relay target at ${absolutePath}`);
}

function classify(isFixed) {
  return isFixed ? 'fixed' : 'not-yet-fixed';
}

function extractLedgerRow(text, sequence) {
  return normalize(text)
    .split('\n')
    .find((line) => line.startsWith(`| ${sequence} |`)) ?? '';
}

function literalCount(text, literal) {
  return text.split(literal).length - 1;
}

const seedFindingIds = Array.from(
  { length: 16 },
  (_, index) => `H13-${String(index + 1).padStart(3, '0')}`
);

const allowedSeedClosureStatuses = new Set([
  'open',
  'accepted',
  'redirected',
  'blocked',
  'deferred',
  'closed-by-evidence',
  'closed-by-operator-decision'
]);

function extractSeedClosureBlock(text) {
  const match = normalize(text).match(
    /(?:^|\n)## Seed Finding Closure Status\n[\s\S]*?(?=\n## |\n# |\s*$)/u
  );
  return match?.[0] ?? '';
}

function parseSeedClosureRows(block) {
  const rows = new Map();

  for (const line of normalize(block).split('\n')) {
    if (!/^\| H13-\d{3} \|/u.test(line)) {
      continue;
    }

    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const [id, status, evidence, notes] = cells;
    const existingRows = rows.get(id) ?? [];
    existingRows.push({ id, status, evidence, notes });
    rows.set(id, existingRows);
  }

  return rows;
}

const cases = [
  {
    id: 'COR-07',
    targetKeys: ['phase9T55'],
    isFixed: ({ phase9T55 }) => {
      const seq124Row = extractLedgerRow(phase9T55, '124');
      return classify(
        /environment\/control\/capability-handshake\.js/u.test(seq124Row)
          && /entities\/vre-control-capability-handshake-js\.md/u.test(seq124Row)
          && !/environment\/orchestrator\/capability-handshake\.js/u.test(seq124Row)
          && !/entities\/kernel-bridge-js\.md/u.test(seq124Row)
      );
    },
    fixedFixture: {
      phase9T55:
        [
          '| 124 | YYYY-MM-DD | 5 | W5-GOVERNANCE-RECONCILIATION | fixed | ',
          'environment/control/capability-handshake.js, ',
          '../vibe-science/blueprints/private/WIKI_VRE/entities/',
          'vre-control-capability-handshake-js.md | none | GREEN | ',
          'verified | fixed |'
        ].join('')
    }
  },
  {
    id: 'COR-08',
    targetKeys: ['phase9T55', 'phase9T57'],
    isFixed: ({ phase9T55, phase9T57 }) => classify(
      /C\.4 split (?:into )?124-127/u.test(phase9T55)
        && /D\.0=128/u.test(phase9T55)
        && /D\.1=129/u.test(phase9T55)
        && /E\.1=130/u.test(phase9T55)
        && /C\.4a/u.test(phase9T55)
        && /C\.4b1=125/u.test(phase9T55)
        && /C\.4b2=126/u.test(phase9T55)
        && /C\.4b3=127/u.test(phase9T55)
        && /Feature ledger row template \(seq 130\)/u.test(phase9T57)
        && /\| 130 \| YYYY-MM-DD \| 5 \| W5-AUDIT-QUERIES \|/u.test(phase9T57)
        && /T5\.5 \(seq 116-118, 123, C\.4 split 124-127\)/u.test(phase9T57)
        && /T5\.6 \(D\.0=128, D\.1=129\)/u.test(phase9T57)
        && /T5\.7 \(E\.1=130\)/u.test(phase9T57)
        && !/seq 122/u.test(phase9T57)
        && !/\| 122 \| YYYY-MM-DD \| 5 \| W5-AUDIT-QUERIES \|/u.test(phase9T57)
    ),
    fixedFixture: {
      phase9T55:
        'real ledger mapping: C.4 split into 124-127; C.4a, C.4b1=125, C.4b2=126, C.4b3=127; D.0=128, D.1=129, E.1=130.',
      phase9T57:
        [
          'Feature ledger row template (seq 130)',
          '| 130 | YYYY-MM-DD | 5 | W5-AUDIT-QUERIES |',
          'T5.5 (seq 116-118, 123, C.4 split 124-127); ',
          'T5.6 (D.0=128, D.1=129); T5.7 (E.1=130).'
        ].join('\n')
    }
  },
  {
    id: 'COR-09',
    targetKeys: ['phase9Wave5', 'phase9Wave5Overview'],
    isFixed: ({ phase9Wave5, phase9Wave5Overview }) => classify(
      /flipped\s+allowed\s+2026-04-29/u.test(phase9Wave5)
        && /historically blocked/u.test(phase9Wave5)
        && /flipped\s+allowed\s+2026-04-29/u.test(phase9Wave5Overview)
        && /historically blocked/u.test(phase9Wave5Overview)
        && !/Implementation remains blocked/u.test(phase9Wave5)
        && !/blocked-pending-wave-5-plan-v2-1-re-review/u.test(phase9Wave5Overview)
    ),
    fixedFixture: {
      phase9Wave5: 'Implementation was historically blocked and flipped allowed 2026-04-29.',
      phase9Wave5Overview: 'The gate historically blocked implementation, then flipped allowed 2026-04-29.'
    }
  },
  {
    id: 'COR-10',
    targetKeys: ['phase9QualityLeap', 'phase9CrossWaveMatrix'],
    isFixed: ({ phase9QualityLeap, phase9CrossWaveMatrix }) => classify(
      /narrow-v1 adopted: contradicts only/u.test(phase9QualityLeap)
        && /supersedes\/evolved_into deferred/u.test(phase9QualityLeap)
        && /typed-edges/u.test(phase9CrossWaveMatrix)
        && /contradicts-only narrow-v1/u.test(phase9CrossWaveMatrix)
    ),
    fixedFixture: {
      phase9QualityLeap:
        'B.T3 narrow-v1 adopted: contradicts only; supersedes/evolved_into deferred to a future typed-edge round.',
      phase9CrossWaveMatrix:
        '| typed-edges | Wave 5 | contradicts-only narrow-v1 | supersedes/evolved_into deferred |'
    }
  },
  {
    id: 'COR-11',
    targetKeys: ['graphifyInstall', 'graphifyCli'],
    isFixed: ({ graphifyInstall, graphifyCli }) => classify(
      /Package vs CLI vs version identities/u.test(graphifyInstall)
        && /Package vs CLI vs version identities/u.test(graphifyCli)
        && /graphifyy/u.test(graphifyInstall)
        && /graphify\b/u.test(graphifyCli)
        && /tool-versions\.jsonl/u.test(graphifyInstall)
        && /tool-versions\.jsonl/u.test(graphifyCli)
    ),
    fixedFixture: {
      graphifyInstall:
        'Package vs CLI vs version identities: package graphifyy, CLI graphify, reported version; record all three in tool-versions.jsonl.',
      graphifyCli:
        'Package vs CLI vs version identities: package graphifyy, CLI graphify, reported version; record all three in tool-versions.jsonl.'
    }
  },
  {
    id: 'COR-12',
    targetKeys: ['phase12Loop', 'phase12Protocol'],
    isFixed: ({ phase12Loop, phase12Protocol }) => {
      const noteIndex = phase12Loop.indexOf('NOT loggable until enum extension');
      const eventIndex = phase12Loop.indexOf('adversarial_run_started');
      return classify(
        noteIndex >= 0
          && eventIndex >= 0
          && noteIndex < eventIndex
          && /six-signal crosswalk/u.test(phase12Protocol)
          && /closureSignalStatus/u.test(phase12Protocol)
      );
    },
    fixedFixture: {
      phase12Loop:
        'NOT loggable until enum extension.\n- `adversarial_run_started`',
      phase12Protocol:
        'six-signal crosswalk: HAT3 tests pass maps to closureSignalStatus.testsPass.'
    }
  },
  {
    id: 'COR-13',
    targetKeys: ['phase11ScopeFreeze', 'phase11WikiBridge'],
    isFixed: ({ phase11ScopeFreeze, phase11WikiBridge }) => classify(
      /claim\/knowledge-status-changing predicate/u.test(phase11ScopeFreeze)
        && /promotion, downgrade, kill, status flip, or new edge/u.test(phase11ScopeFreeze)
        && /claim\/knowledge-status-changing predicate/u.test(phase11WikiBridge)
    ),
    fixedFixture: {
      phase11ScopeFreeze:
        'claim/knowledge-status-changing predicate: promotion, downgrade, kill, status flip, or new edge into the claim ledger.',
      phase11WikiBridge:
        'R2 review follows the claim/knowledge-status-changing predicate from Wave 0.'
    }
  },
  {
    id: 'COR-14',
    targetKeys: ['phase13Findings'],
    isFixed: ({ phase13Findings }) => classify(
      /F13-CX-007/u.test(phase13Findings)
        && /closed-by-evidence/u.test(phase13Findings)
        && /04-codex-review-protocol\.md/u.test(phase13Findings)
        && /NNN_short-slug_agent\.md/u.test(phase13Findings)
    ),
    fixedFixture: {
      phase13Findings:
        '| F13-CX-007 | reviewer | 2026-06-21 | P2 | closed | `04-codex-review-protocol.md` uses `NNN_short-slug_agent.md`. | closed-by-evidence | none |'
    }
  }
];

function expectedLiveStatus(testCase) {
  return [
    'COR-07',
    'COR-08',
    'COR-09',
    'COR-10',
    'COR-11',
    'COR-12',
    'COR-13',
    'COR-14'
  ].includes(testCase.id)
    ? 'fixed'
    : 'not-yet-fixed';
}

function loadLiveTargets(t) {
  const loaded = {};
  for (const relativePath of Object.values(targets)) {
    const text = readTargetOrSkip(t, relativePath);
    if (text === null) {
      return null;
    }
  }

  for (const [key, relativePath] of Object.entries(targets)) {
    loaded[key] = readTargetOrSkip(t, relativePath);
  }
  return loaded;
}

function fixtureFor(testCase) {
  return Object.fromEntries(
    testCase.targetKeys.map((key) => [key, testCase.fixedFixture[key] ?? ''])
  );
}

test('COR safe-relay guard enumerates exactly COR-07 through COR-14', () => {
  assert.deepEqual(cases.map((testCase) => testCase.id), [
    'COR-07',
    'COR-08',
    'COR-09',
    'COR-10',
    'COR-11',
    'COR-12',
    'COR-13',
    'COR-14'
  ]);
});

test('live COR safe-relay targets match their reviewed expected status', (t) => {
  const liveTargets = loadLiveTargets(t);
  if (liveTargets === null) {
    return;
  }

  for (const testCase of cases) {
    const expectedStatus = expectedLiveStatus(testCase);
    assert.equal(
      testCase.isFixed(liveTargets),
      expectedStatus,
      `${testCase.id} must be ${expectedStatus} after its reviewed task state`
    );
  }
});

test('every COR safe-relay predicate recognizes a corrected fixture', () => {
  for (const testCase of cases) {
    assert.equal(
      testCase.isFixed(fixtureFor(testCase)),
      'fixed',
      `${testCase.id} predicate is tautological or cannot recognize fixed text`
    );
  }
});

test('GO-gated corrections are not part of the safe-relay guard set', () => {
  const guardedIds = new Set(cases.map((testCase) => testCase.id));

  for (const goGatedId of [
    'COR-01',
    'COR-02',
    'COR-03',
    'COR-04',
    'COR-05',
    'COR-06',
    'COR-15',
    'COR-16'
  ]) {
    assert.equal(guardedIds.has(goGatedId), false, `${goGatedId} is GO-gated`);
  }
});

test('F033 index entries and seed finding closure projection are current', (t) => {
  const indexText = readTargetOrSkip(t, targets.phase13ReviewIndex);
  const findingsText = readTargetOrSkip(t, targets.phase13Findings);
  if (indexText === null || findingsText === null) {
    return;
  }

  assert.equal(
    literalCount(indexText, '032_extraordinary-review-baseline-ack_claude.md'),
    1,
    'F033-10 requires exactly one 032 review-index entry'
  );
  assert.equal(
    literalCount(indexText, '033_world-class-vre-multi-agent-review_codex.md'),
    1,
    'F033-10 requires exactly one 033 review-index entry'
  );
  assert.match(findingsText, /\| CR13-016 \|/u);
  assert.match(findingsText, /\| CR13-017 \|/u);

  const closureBlock = extractSeedClosureBlock(findingsText);
  assert.notEqual(
    closureBlock,
    '',
    'F033-11 requires a Seed Finding Closure Status block'
  );

  const closureRows = parseSeedClosureRows(closureBlock);
  for (const seedId of seedFindingIds) {
    const rows = closureRows.get(seedId) ?? [];
    assert.equal(rows.length, 1, `${seedId} must have exactly one closure row`);

    const [row] = rows;
    assert.equal(
      allowedSeedClosureStatuses.has(row.status),
      true,
      `${seedId} uses unreviewed disposition ${row.status}`
    );
    assert.notEqual(row.status, 'superseded', `${seedId} must not use superseded`);

    if (!['open', 'deferred'].includes(row.status)) {
      assert.match(
        row.evidence,
        /`[^`]+\.md`/u,
        `${seedId} non-deferred closure needs concrete markdown evidence`
      );
    }
  }

  assert.deepEqual(
    [...closureRows.keys()].sort(),
    seedFindingIds,
    'F033-11 closure block must contain only H13-001 through H13-016'
  );
});
