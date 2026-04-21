import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import checkPhase9Ledger, { PATHS } from './check-phase9-ledger.js';

const ROUND_15_TEXT = `## Round 15 - Explicit Operator GO For Cross-Repo Work And T0.1a Execution

Date: \`2026-04-21\`
`;

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
