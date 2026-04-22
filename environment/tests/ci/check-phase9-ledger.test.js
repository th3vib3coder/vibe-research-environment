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
  // Round 30: fixture parity with the live VRE repo — tests that seed
  // legacy Wave 0 hardening rows (seq 034) expect the CLI-stubs test file
  // to exist on disk, since Round 30 added the E_LEDGER_PHANTOM_PATH check.
  await mkdir(path.join(vreRoot, 'environment', 'tests', 'cli'), { recursive: true });
  await writeFile(path.join(vreRoot, 'environment', 'tests', 'cli', 'bin-vre-phase9-stubs.test.js'), '// fixture\n', 'utf8');
  if (options.binVreSource) {
    await mkdir(path.join(vreRoot, 'bin'), { recursive: true });
    await writeFile(path.join(vreRoot, 'bin', 'vre'), options.binVreSource, 'utf8');
  }

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

test('phase9-ledger check treats CI workflow changes as covered VRE paths', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [
            '.github/workflows/ci.yml',
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
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Machine-generated Phase 9 surface inventory and CI cross-check | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row |',
        '| 099 | 2026-04-21 | 0 | W0-ORPHAN-SURFACE | Orphaned Phase 9 surface | `environment/orchestrator/autonomy-runtime.js` | none | none | implemented | fixture row |'
      ]),
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
        },
        {
          kind: 'orchestrator-surface',
          name: 'stale-orphan-surface',
          paths: ['environment/orchestrator/autonomy-runtime.js'],
          featureId: 'W0-ORPHAN-SURFACE',
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

test('phase9-ledger check skips cross-check for rows whose paths are library code (environment/lib, environment/tests/lib) and therefore not inventory-eligible', async () => {
  // Round 22 refinement: the Round 21 fix used a post-hoc pre-filter to
  // exempt rows that did not match any surface. That opened a silent-skip
  // for genuinely broken rows. Round 22 tightens isInventoryTrackablePath
  // to match isCoveredVrePath so non-surface library rows (T0.2 kernel-
  // bridge fix lives under environment/lib/) are naturally ineligible and
  // never reach the orphan check, while rows on covered surface paths
  // keep the strict orphan rule.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Machine-generated Phase 9 surface inventory and CI cross-check | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row |',
        '| 009 | 2026-04-22 | 0 | W0-PROJECTION-COUNT-DRIFT-FIX | Bridge contract count fix | `environment/lib/kernel-bridge.js`, `environment/tests/lib/kernel-bridge.test.js` | none | none | verified | non-surface ledger row |'
      ]),
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

    await assert.doesNotReject(() =>
      checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
      })
    );
  });
});

test('phase9-ledger check STILL fires E_LEDGER_ORPHAN_ROW for rows on covered surface paths with no matching surface (Round 22 silent-skip closure)', async () => {
  // Round 22 regression: closes the silent-skip introduced by the Round 21
  // surfaceBackedLedgerRows pre-filter. Under that filter, a row that did
  // NOT match any live or persisted surface was quietly excluded from the
  // orphan check — the exact scenario "implemented row on a covered Phase 9
  // surface path (e.g. environment/orchestrator/**), but the code was never
  // actually landed OR the generator was never extended" slipped through.
  // This test asserts that such a row still fires orphan after the Round 22
  // isInventoryTrackablePath tightening and the revert of the pre-filter.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Phase 9 ledger CI enforcement runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Machine-generated Phase 9 surface inventory and CI cross-check | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row |',
        '| 050 | 2026-04-22 | 0 | W0-GENUINELY-ORPHANED | Ledger row for code the operator never actually landed | `environment/orchestrator/never-landed-aggregator.js` | none | none | verified | fixture row: covered surface path (environment/orchestrator/) but NO matching live or persisted surface. This is the scenario the Round 21 pre-filter silently suppressed. |'
      ]),
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
      /E_LEDGER_ORPHAN_ROW.*seq 050.*W0-GENUINELY-ORPHANED/u
    );
  });
});

test('phase9-ledger check requires featureId match for live surfaces that share the same backing path', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Ledger CI runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row for check surface |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Surface inventory generator | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row for build surface |',
        '| 012 | 2026-04-22 | 0 | W0-CLI-OBJECTIVE-START | Objective start stub | `bin/vre` | none | none | verified | fixture row for one CLI surface only |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'package.json', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js', 'package.json'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'cli-command',
          name: 'objective start',
          paths: ['bin/vre'],
          featureId: 'W0-CLI-OBJECTIVE-START',
          introducedAt: '2026-04-22'
        },
        {
          kind: 'cli-command',
          name: 'objective status',
          paths: ['bin/vre'],
          featureId: 'W0-CLI-OBJECTIVE-STATUS',
          introducedAt: '2026-04-22'
        }
      ],
      binVreSource: [
        'export const PHASE9_STUB_DEFINITIONS = Object.freeze([',
        '  {',
        "    root: 'objective',",
        "    action: 'start',",
        "    canonicalCommand: 'objective start',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-OBJECTIVE-START',",
        "    introducedAt: '2026-04-22',",
        '    mutating: true',
        '  },',
        '  {',
        "    root: 'objective',",
        "    action: 'status',",
        "    canonicalCommand: 'objective status',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-OBJECTIVE-STATUS',",
        "    introducedAt: '2026-04-22',",
        '    mutating: false',
        '  }',
        ']);',
        ''
      ].join('\n')
    });

    await assert.rejects(
      () => checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
      }),
      /E_LEDGER_MISSING_SURFACE.*objective status/u
    );
  });
});

test('phase9-ledger check still accepts legacy Wave 0 dispatcher-only hardening rows before the Round 29 transition seq', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Ledger CI runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row for check surface |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Surface inventory generator | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row for build surface |',
        '| 015 | 2026-04-22 | 0 | W0-CLI-OBJECTIVE-START | Objective start stub | `bin/vre` | none | none | verified | originating objective start surface row |',
        '| 034 | 2026-04-22 | 0 | W0-CLI-OBJECTIVE-START-REASONING-GATE | Objective start reasoning gate hardening | `bin/vre`, `environment/tests/cli/bin-vre-phase9-stubs.test.js` | none | none | verified | legacy Wave 0 hardening row that annotates the existing objective start surface |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'package.json', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js', 'package.json'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'cli-command',
          name: 'objective start',
          paths: ['bin/vre'],
          featureId: 'W0-CLI-OBJECTIVE-START',
          introducedAt: '2026-04-22'
        }
      ],
      binVreSource: [
        'export const PHASE9_STUB_DEFINITIONS = Object.freeze([',
        '  {',
        "    root: 'objective',",
        "    action: 'start',",
        "    canonicalCommand: 'objective start',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-OBJECTIVE-START',",
        "    introducedAt: '2026-04-22',",
        '    mutating: true',
        '  }',
        ']);',
        ''
      ].join('\n')
    });

    await assert.doesNotReject(() =>
      checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
      })
    );
  });
});

test('phase9-ledger check rejects post-Wave-0 dispatcher-only rows with a fresh featureId that matches no live CLI surface', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Ledger CI runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row for check surface |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Surface inventory generator | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row for build surface |',
        '| 041 | 2026-04-22 | 0 | W1-CLI-FAKE-NEVER-LANDED | Fake post-Wave-0 dispatcher-only row | `bin/vre` | none | none | verified | should fail after the Round 29 dispatcher-only transition rule |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'package.json', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js', 'package.json'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'cli-command',
          name: 'objective start',
          paths: ['bin/vre'],
          featureId: 'W0-CLI-OBJECTIVE-START',
          introducedAt: '2026-04-22'
        }
      ],
      binVreSource: [
        'export const PHASE9_STUB_DEFINITIONS = Object.freeze([',
        '  {',
        "    root: 'objective',",
        "    action: 'start',",
        "    canonicalCommand: 'objective start',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-OBJECTIVE-START',",
        "    introducedAt: '2026-04-22',",
        '    mutating: true',
        '  }',
        ']);',
        ''
      ].join('\n')
    });

    await assert.rejects(
      () =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
        }),
      /E_LEDGER_ORPHAN_ROW.*seq 041.*W1-CLI-FAKE-NEVER-LANDED/u
    );
  });
});

test('phase9-ledger check fails-open when the sibling vibe-science spec ledger file is absent and covered VRE paths changed in discovered mode (Round 25 CI-scenario closure)', async () => {
  // Round 25 regression: in CI of vibe-research-environment alone, the
  // sibling vibe-science spec ledger path resolves to a non-existent file.
  // Before Round 25 the discovered-mode spec-ledger requirement fired
  // E_SPEC_LEDGER_UPDATE_REQUIRED because isSpecLedgerInGitignoredTree()
  // walked up, found the VRE host repo .git, and git check-ignore against
  // a path outside that repo returned non-zero. After Round 25 an explicit
  // "sibling absent" branch emits a diagnostic and skips the requirement.
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase9-no-sibling-spec-'));
  const vreRoot = path.join(workspaceRoot, 'vibe-research-environment');
  try {
    await mkdir(path.join(vreRoot, 'environment', 'tests', 'ci'), { recursive: true });
    await writeFile(path.join(vreRoot, PATHS.vreLedger), '# bootstrap\n', 'utf8');
    // No sibling vibe-science/ directory: this is the CI-only checkout scenario.

    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (chunk, ...rest) => {
      captured += typeof chunk === 'string' ? chunk : String(chunk);
      return true;
    };

    try {
      await assert.doesNotReject(() =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          // Force discovered mode with a covered VRE change so the
          // spec-ledger branch is exercised but the spec ledger file
          // is absent.
          discoveryOverride: [
            'environment/control/time-provider.js',
            PATHS.vreLedger
          ]
        })
      );
      assert.match(captured, /does not exist in the sibling workspace/u);
      assert.match(captured, /16-implementation-status-ledger\.md/u);
    } finally {
      process.stderr.write = originalWrite;
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('phase9-ledger check fails-open with stderr diagnostic when the sibling vibe-science review logs are absent (Round 25 CI-scenario closure)', async () => {
  // Round 25 regression: in CI runs of vibe-research-environment alone,
  // the sibling vibe-science repo is not checked out, so
  // PATHS.specReviewLog and PATHS.planReviewLog cannot be read. Before
  // Round 25 the checker threw ENOENT and failed the CI step. After
  // Round 25 it must emit a loud stderr diagnostic and proceed.
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase9-no-sibling-'));
  const vreRoot = path.join(workspaceRoot, 'vibe-research-environment');
  try {
    await mkdir(path.join(vreRoot, 'environment', 'tests', 'ci'), { recursive: true });
    // Live VRE ledger is present but the sibling vibe-science/ directory
    // is intentionally NOT created — this mirrors a VRE-only CI checkout.
    await writeFile(path.join(vreRoot, PATHS.vreLedger), '# bootstrap\n', 'utf8');

    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (chunk, ...rest) => {
      captured += typeof chunk === 'string' ? chunk : String(chunk);
      return true;
    };

    try {
      await assert.doesNotReject(() =>
        checkPhase9Ledger({
          repoRoot: vreRoot,
          workspaceRoot,
          changedFiles: []
        })
      );
      assert.match(captured, /Phase 9 review log\(s\) absent/u);
      assert.match(captured, /12-spec-self-review-log\.md/u);
      assert.match(captured, /11-plan-self-review-log\.md/u);
    } finally {
      process.stderr.write = originalWrite;
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('phase9-ledger check raises E_LEDGER_PHANTOM_PATH for rows declaring VRE-local paths that do not exist on disk', async () => {
  // Round 30 regression: closes the mixed-path residual identified during
  // the Round 29 adversarial review. A row with paths=[bin/vre,
  // environment/orchestrator/never-landed.js] previously passed the orphan
  // check via bin/vre path overlap with live CLI surfaces, even though the
  // env/orchestrator path never existed on disk. The phantom-path check
  // now fires on such rows.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Ledger CI runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row for check surface |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Surface inventory generator | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row for build surface |',
        '| 015 | 2026-04-22 | 0 | W0-CLI-OBJECTIVE-START | Objective start stub | `bin/vre` | none | none | verified | originating surface row |',
        '| 099 | 2026-04-22 | 0 | W1-FAKE-MIXED | Fake mixed-paths row | `bin/vre`, `environment/orchestrator/never-landed.js` | none | none | verified | declares a VRE-local path that does not exist on disk |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'package.json', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js', 'package.json'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'cli-command',
          name: 'objective start',
          paths: ['bin/vre'],
          featureId: 'W0-CLI-OBJECTIVE-START',
          introducedAt: '2026-04-22'
        }
      ],
      binVreSource: [
        'export const PHASE9_STUB_DEFINITIONS = Object.freeze([',
        '  {',
        "    root: 'objective',",
        "    action: 'start',",
        "    canonicalCommand: 'objective start',",
        "    kind: 'cli-command',",
        "    featureId: 'W0-CLI-OBJECTIVE-START',",
        "    introducedAt: '2026-04-22',",
        '    mutating: true',
        '  }',
        ']);',
        ''
      ].join('\n')
    });

    await assert.rejects(
      () => checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
      }),
      /E_LEDGER_PHANTOM_PATH.*seq 099.*environment\/orchestrator\/never-landed\.js/u
    );
  });
});

test('phase9-ledger check skips phantom-path check for sibling paths starting with ../vibe-science/', async () => {
  // Round 30: sibling paths are legitimately absent in vibe-research-
  // environment-only CI checkouts. The phantom-path check must not fire
  // for them; the existing sibling-absent diagnostic covers this case.
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await seedSurfaceTrackingFixture(vreRoot, {
      ledgerMarkdown: buildLedgerMarkdown([
        '| 001 | 2026-04-21 | 0 | W0-CI-LEDGER-CHECK | Ledger CI runner | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/run-all.js`, `environment/tests/ci/validate-counts.js` | none | none | verified | fixture row for check surface |',
        '| 006 | 2026-04-21 | 0 | W0-SURFACE-INDEX-CROSSCHECK | Surface inventory generator | `package.json`, `environment/tests/ci/check-phase9-ledger.js`, `environment/tests/ci/phase9-surface-index.js`, `phase9-vre-surface-index.json` | none | none | verified | fixture row for build surface |',
        '| 050 | 2026-04-22 | 0 | W0-SIBLING-ONLY-ROW | Row with only sibling paths | `../vibe-science/plugin/scripts/pre-tool-use.js`, `../vibe-science/tests/governance-hooks.test.mjs` | none | none | verified | sibling paths skipped by phantom-path check |'
      ]),
      surfaceIndex: [
        {
          kind: 'test-entrypoint',
          name: 'build:surface-index',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/phase9-surface-index.js', 'package.json', 'phase9-vre-surface-index.json'],
          featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
          introducedAt: '2026-04-21'
        },
        {
          kind: 'test-entrypoint',
          name: 'check:phase9-ledger',
          paths: ['environment/tests/ci/check-phase9-ledger.js', 'environment/tests/ci/run-all.js', 'environment/tests/ci/validate-counts.js', 'package.json'],
          featureId: 'W0-CI-LEDGER-CHECK',
          introducedAt: '2026-04-21'
        }
      ]
    });

    // seq 050 has ONLY sibling paths and no VRE-local paths → not
    // inventory-eligible (no trackable path), so cross-check is inert.
    // This test confirms the sibling paths don't trip phantom-path in any
    // parallel code path (regression guard).
    await assert.doesNotReject(() =>
      checkPhase9Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: [PATHS.vreLedger, PATHS.specLedger, PATHS.surfaceIndex]
      })
    );
  });
});
