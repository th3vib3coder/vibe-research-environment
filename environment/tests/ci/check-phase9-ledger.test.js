import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import checkPhase9Ledger, { PATHS } from './check-phase9-ledger.js';
import { SURFACE_INDEX_SCHEMA, validateSurfaceIndexShape } from './phase9-surface-index.js';

const ROUND_15_TEXT = `## Round 15 - Explicit Operator GO For Cross-Repo Work And T0.1a Execution

Date: \`2026-04-21\`
`;

function buildLedgerMarkdown(rows = []) {
  return [
    '# Phase 9 VRE Feature Ledger',
    '',
    '## Ledger',
    '',
    '| seq | date | wave | feature id | surface | paths | flags | tests | status | notes |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    ''
  ].join('\n');
}

function buildLedgerIndexMarkdown(rows = [
  '| `phase9-vre-feature-ledger.md` | active | `000–…` | 2026-04-21 | — | First ledger. |'
]) {
  return [
    '# Phase 9 VRE Feature Ledger Index',
    '',
    '## Index',
    '',
    '| file | status | seq range | opened | closed | notes |',
    '|---|---|---|---|---|---|',
    ...rows,
    ''
  ].join('\n');
}

async function seedSurfaceTrackingFixture(vreRoot, options = {}) {
  await writeFile(
    path.join(vreRoot, 'package.json'),
    JSON.stringify({
      name: 'vibe-research-environment',
      private: true,
      type: 'module',
      scripts: {
        'check:phase9-ledger': 'node environment/tests/ci/check-phase9-ledger.js',
        'build:surface-index': 'node environment/tests/ci/phase9-surface-index.js'
      }
    }, null, 2),
    'utf8'
  );

  await mkdir(path.join(vreRoot, 'environment', 'tests', 'ci'), { recursive: true });
  await writeFile(path.join(vreRoot, 'environment', 'tests', 'ci', 'check-phase9-ledger.js'), '// fixture\n', 'utf8');
  await writeFile(path.join(vreRoot, 'environment', 'tests', 'ci', 'run-all.js'), '// fixture\n', 'utf8');
  await writeFile(path.join(vreRoot, 'environment', 'tests', 'ci', 'validate-counts.js'), '// fixture\n', 'utf8');
  await writeFile(path.join(vreRoot, 'environment', 'tests', 'ci', 'phase9-surface-index.js'), '// fixture\n', 'utf8');

  await writeFile(
    path.join(vreRoot, PATHS.vreLedger),
    options.ledgerMarkdown ?? buildLedgerMarkdown(),
    'utf8'
  );
  await writeFile(
    path.join(vreRoot, PATHS.ledgerIndex),
    options.ledgerIndexMarkdown ?? buildLedgerIndexMarkdown(),
    'utf8'
  );
  await writeFile(
    path.join(vreRoot, PATHS.surfaceIndex),
    `${JSON.stringify(options.surfaceIndex ?? [], null, 2)}\n`,
    'utf8'
  );
}

async function withFixtureWorkspace(fn, options = {}) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase9-ledger-'));
  const vreRoot = path.join(workspaceRoot, 'vibe-research-environment');
  const vibeRoot = path.join(workspaceRoot, 'vibe-science');

  try {
    await mkdir(path.join(vreRoot, 'environment', 'tests', 'ci'), { recursive: true });
    await mkdir(path.join(vibeRoot, 'blueprints', 'private', 'phase9-vre-autonomous-research-loop'), { recursive: true });
    await mkdir(path.join(vibeRoot, 'blueprints', 'private', 'phase9-implementation-plan'), { recursive: true });

    await writeFile(path.join(vreRoot, PATHS.vreLedger), '# bootstrap\n', 'utf8');
    await writeFile(
      path.join(vibeRoot, 'blueprints', 'private', 'phase9-vre-autonomous-research-loop', '16-implementation-status-ledger.md'),
      '# spec ledger\n',
      'utf8'
    );
    await writeFile(
      path.join(vibeRoot, 'blueprints', 'private', 'phase9-vre-autonomous-research-loop', '12-spec-self-review-log.md'),
      options.missingGo ? '# no round 15\n' : ROUND_15_TEXT,
      'utf8'
    );
    await writeFile(
      path.join(vibeRoot, 'blueprints', 'private', 'phase9-implementation-plan', '11-plan-self-review-log.md'),
      options.missingGo ? '# no round 15\n' : ROUND_15_TEXT,
      'utf8'
    );

    await fn({ workspaceRoot, vreRoot, vibeRoot });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('phase9-ledger check accepts covered VRE changes when both ledgers are updated', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.doesNotReject(() =>
      checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [
          'package.json',
          'environment/tests/ci/check-phase9-ledger.js',
          PATHS.vreLedger,
          PATHS.specLedger
        ]
      })
    );
  });
});

test('phase9 surface index shape validator accepts the pinned schema shape', async () => {
  const validIndex = [
    {
      kind: 'test-entrypoint',
      name: 'check:phase9-ledger',
      paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js'],
      featureId: 'W0-CI-LEDGER-CHECK',
      introducedAt: '2026-04-21'
    }
  ];

  assert.equal(SURFACE_INDEX_SCHEMA.type, 'array');
  assert.doesNotThrow(() => validateSurfaceIndexShape(validIndex));
});

test('phase9-ledger check rejects covered VRE changes without VRE ledger update', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [
            'package.json',
            'environment/tests/ci/check-phase9-ledger.js',
            PATHS.specLedger
          ]
        }),
      /E_VRE_LEDGER_UPDATE_REQUIRED/u
    );
  });
});

test('phase9-ledger check rejects covered VRE changes without spec-side ledger update', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [
            'package.json',
            'environment/tests/ci/check-phase9-ledger.js',
            PATHS.vreLedger
          ]
        }),
      /E_SPEC_LEDGER_UPDATE_REQUIRED/u
    );
  });
});

test('phase9-ledger check rejects covered vibe-science changes without spec-side ledger update', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [
            '../vibe-science/plugin/scripts/handshake-inject.js'
          ]
        }),
      /E_SPEC_LEDGER_UPDATE_REQUIRED/u
    );
  });
});

test('phase9-ledger check rejects a live VRE ledger without recorded T0.1a GO', async () => {
  await withFixtureWorkspace(
    async ({ workspaceRoot, vreRoot }) => {
      await assert.rejects(
        () =>
          checkPhase9Ledger({
            repoRoot: vreRoot,
            workspaceRoot,
            changedFiles: []
          }),
        /E_PHASE9_LEDGER_GO_MISSING/u
      );
    },
    { missingGo: true }
  );
});

test('phase9-ledger check rejects covered VRE changes without spec-side ledger update in DISCOVERED mode', async () => {
  // Regression test for Round 17: the earlier implementation silently
  // skipped spec-ledger enforcement in discovered mode. This test proves
  // fail-closed behavior regardless of mode.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          discoveryOverride: [
            'environment/orchestrator/autonomy-runtime.js',
            PATHS.vreLedger
            // spec ledger intentionally missing
          ]
        }),
      /E_SPEC_LEDGER_UPDATE_REQUIRED/u
    );
  });
});

test('phase9-ledger check accepts covered VRE changes when both ledgers update in DISCOVERED mode', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.doesNotReject(() =>
      checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        discoveryOverride: [
          'environment/orchestrator/autonomy-runtime.js',
          PATHS.vreLedger,
          PATHS.specLedger
        ]
      })
    );
  });
});

test('phase9-ledger check raises E_LEDGER_MISSING_SURFACE when inventory has a live surface without a matching ledger row', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        }
      ]
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_MISSING_SURFACE/u
    );
  });
});

test('phase9-ledger check raises E_LEDGER_ORPHAN_ROW when an implemented ledger row has no matching live surface', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 006 | 2026-04-21 | 0 | W0-ORPHAN-SURFACE | Orphaned Phase 9 surface | `environment/orchestrator/autonomy-runtime.js` | none | none | implemented | fixture row |'
      ]),
      surfaceIndex: []
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_ORPHAN_ROW/u
    );
  });
});

test('phase9-ledger check raises E_LEDGER_INDEX_INCONSISTENT when the rotation index has two active rows', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerIndexMarkdown: buildLedgerIndexMarkdown([
        '| `phase9-vre-feature-ledger.md` | active | `000–010` | 2026-04-21 | — | First ledger. |',
        '| `phase9-vre-feature-ledger-02.md` | active | `011–…` | 2026-04-21 | — | Illegal second active row. |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        }
      ],
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |'
      ])
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_INDEX_INCONSISTENT/u
    );
  });
});

test('phase9-ledger check raises E_LEDGER_SURFACE_INDEX_MISSING when ledger has eligible rows but inventory file is absent', async () => {
  // Round 20: closes the Round 19 adversarial loophole where deleting
  // phase9-vre-surface-index.json silently disabled the cross-check block.
  // With the fix, the check fails closed as soon as the ledger has at
  // least one inventory-eligible row and the inventory file is absent.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |'
      ])
    });
    // Simulate "operator ran rm phase9-vre-surface-index.json".
    await rm(path.join(vreRoot, PATHS.surfaceIndex));

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger]
        }),
      /E_LEDGER_SURFACE_INDEX_MISSING/u
    );
  });
});

test('phase9-ledger check raises E_LEDGER_INDEX_INCONSISTENT when the rotation index has a seq-range gap', async () => {
  // Round 20: closes a test coverage gap identified by the Round 19
  // adversarial review. The seq-range gap violation existed in code but
  // was never exercised by a dedicated regression test.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerIndexMarkdown: buildLedgerIndexMarkdown([
        '| `phase9-vre-feature-ledger.md` | archived | `000-010` | 2026-04-21 | 2026-04-22 | First ledger (archived). |',
        '| `phase9-vre-feature-ledger-02.md` | active | `100-…` | 2026-04-22 | — | Illegal gap: seq jumps 10 then 100. |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        }
      ],
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |'
      ])
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_INDEX_INCONSISTENT.*seq range gap/u
    );
  });
});

test('phase9-ledger check raises E_LEDGER_INDEX_INCONSISTENT when an archived ledger row has no closed date', async () => {
  // Round 20: closes a test coverage gap. The "archived row missing closed
  // date" violation existed in code but was never exercised by a direct
  // regression test.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerIndexMarkdown: buildLedgerIndexMarkdown([
        '| `phase9-vre-feature-ledger.md` | archived | `000-010` | 2026-04-21 | — | Illegal: archived without closed date. |',
        '| `phase9-vre-feature-ledger-02.md` | active | `011-…` | 2026-04-22 | — | Second ledger. |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['package.json', 'environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        }
      ],
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |'
      ])
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_INDEX_INCONSISTENT.*missing a closed date/u
    );
  });
});
