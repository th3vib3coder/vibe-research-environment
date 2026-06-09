import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import checkPhase10Ledger, { PHASE10_PATHS } from './check-phase10-ledger.js';
import { writePhase10SurfaceIndex } from './phase10-surface-index.js';

async function writeFixtureFile(root, relPath, content = '') {
  const fullPath = path.join(root, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content || `fixture for ${relPath}\n`, 'utf8');
}

function ledgerText(paths = []) {
  const pathText = paths.join(', ');
  return [
    '# Phase 10 fixture ledger',
    '',
    '| task | status | paths | notes |',
    '|---|---|---|---|',
    `| T10.0.1 | in-progress | ${pathText} | who: codex; when: 2026-06-07T00:00:00Z; why: T10.0.1; what: tracking scaffold; verification: node --test; reviewer: claude-code; |`,
    ''
  ].join('\n');
}

async function withFixtureWorkspace(fn, options = {}) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-phase10-ledger-'));
  const vreRoot = path.join(workspaceRoot, 'vibe-research-environment');
  const vibeRoot = path.join(workspaceRoot, 'vibe-science');

  try {
    await writeFixtureFile(vreRoot, 'package.json', JSON.stringify({
      name: 'vibe-research-environment',
      private: true,
      type: 'module',
      scripts: {
        'build:phase10-surface-index': 'node environment/tests/ci/phase10-surface-index.js',
        'check:phase10-ledger': 'node environment/tests/ci/check-phase10-ledger.js',
        'phase10:dependency-check': 'node environment/tests/ci/check-phase10-ledger.js --dependency-check',
        'phase10:claim-edge-projection': 'node environment/tests/ci/phase10-claim-edge-projection.js',
        'phase10:curator-role': 'node environment/tests/ci/phase10-curator-role.js',
        'phase10:domain-lifecycle': 'node --test environment/tests/cli/domain-cli.test.js',
        'phase10:law13-lint': 'node environment/tests/ci/phase10-law13-lint.js',
        'test:phase10-scaffold': 'node --test environment/tests/ci/phase10-surface-index.test.js environment/tests/ci/check-phase10-ledger.test.js'
      }
    }, null, 2));

    for (const relPath of [
      'environment/tests/ci/phase10-surface-index.js',
      'environment/tests/ci/phase10-surface-index.test.js',
      'environment/tests/ci/check-phase10-ledger.js',
      'environment/tests/ci/check-phase10-ledger.test.js',
      'environment/phase10/claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.test.js',
      'environment/orchestrator/agent-orchestration.js',
      'environment/phase10/curator-role.js',
      'environment/tests/ci/phase10-curator-role.js',
      'environment/tests/ci/phase10-curator-role.test.js',
      'bin/vre',
      'environment/schemas/phase9-objective.schema.json',
      'environment/phase10/domain-lifecycle.js',
      'environment/tests/cli/domain-cli.test.js',
      'environment/orchestrator/task-registry/phase10-wiki-lint.json',
      'environment/orchestrator/task-registry/phase10-wiki-compile.json'
    ]) {
      await writeFixtureFile(vreRoot, relPath);
    }

    if (!options.missingClaimSchema) {
      await writeFixtureFile(vreRoot, 'environment/schemas/phase9-claim-edge.schema.json');
    }
    if (!options.missingClaimStore) {
      await writeFixtureFile(vreRoot, 'environment/claims/edges.js');
    }
    if (options.duplicateFeatureLedger) {
      await writeFixtureFile(vreRoot, 'phase10-feature-ledger.md');
    }

    const changedPaths = options.changedPaths ?? [
      'environment/tests/ci/check-phase10-ledger.js',
      'phase10-vre-feature-ledger.md'
    ];
    const goodLedger = ledgerText(changedPaths);
    const sparseLedger = ledgerText(['phase10-vre-feature-ledger.md']);

    await writeFixtureFile(vreRoot, 'phase10-vre-feature-ledger.md', options.sparseTrace ? sparseLedger : goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.implementationLog.slice('../vibe-science/'.length), options.sparseTrace ? sparseLedger : goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.schemaRegistry.slice('../vibe-science/'.length), goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.lintCheckLedger.slice('../vibe-science/'.length), goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.roleBudgetLedger.slice('../vibe-science/'.length), goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.exportGuardLedger.slice('../vibe-science/'.length), goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.fileChangeLedger.slice('../vibe-science/'.length), options.sparseTrace ? sparseLedger : goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.changeTraceLedger.slice('../vibe-science/'.length), options.sparseTrace ? sparseLedger : goodLedger);
    await writeFixtureFile(vibeRoot, PHASE10_PATHS.maintenanceNotes.slice('../vibe-science/'.length), goodLedger);
    await writeFixtureFile(vibeRoot, 'blueprints/private/WIKI_VRE/log.md', goodLedger);

    if (!options.skipSurfaceIndex) {
      await writePhase10SurfaceIndex({ repoRoot: vreRoot, workspaceRoot });
    }

    await fn({ workspaceRoot, vreRoot, vibeRoot, changedPaths });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('phase10-ledger check accepts complete scaffold trace and dependency evidence', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.doesNotReject(() =>
      checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths })
    );
  });
});

test('phase10-ledger check rejects missing claim-edge schema dependency', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.rejects(
      () => checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths }),
      /E_PHASE10_DEPENDENCY_MISSING.*phase9-claim-edge/u
    );
  }, { missingClaimSchema: true });
});

test('phase10-ledger check rejects missing claim-edge store dependency', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.rejects(
      () => checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths }),
      /E_PHASE10_DEPENDENCY_MISSING.*claims\/edges\.js/u
    );
  }, { missingClaimStore: true });
});

test('phase10-ledger check rejects duplicate feature-ledger naming', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.rejects(
      () => checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths }),
      /E_PHASE10_DUPLICATE_FEATURE_LEDGER/u
    );
  }, { duplicateFeatureLedger: true });
});

test('phase10-ledger check rejects missing surface index', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.rejects(
      () => checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths }),
      /E_PHASE10_REQUIRED_FILE_MISSING.*phase10-vre-surface-index\.json/u
    );
  }, { skipSurfaceIndex: true });
});

test('phase10-ledger check rejects git-diff paths absent from file/change trace ledgers', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot, changedPaths }) => {
    await assert.rejects(
      () => checkPhase10Ledger({ repoRoot: vreRoot, workspaceRoot, changedFiles: changedPaths }),
      /E_PHASE10_TRACE_MISSING.*environment\/tests\/ci\/check-phase10-ledger\.js/u
    );
  }, { sparseTrace: true });
});

test('phase10-ledger check covers phase10 schema tests in trace reconciliation', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () => checkPhase10Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: ['environment/tests/schemas/phase10-knowledge-domain.schema.test.js']
      }),
      /E_PHASE10_TRACE_MISSING.*environment\/tests\/schemas\/phase10-knowledge-domain\.schema\.test\.js/u
    );
  }, { sparseTrace: true });
});

test('phase10-ledger check covers phase10 projection helpers in trace reconciliation', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () => checkPhase10Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: ['environment/phase10/claim-edge-projection.js']
      }),
      /E_PHASE10_TRACE_MISSING.*environment\/phase10\/claim-edge-projection\.js/u
    );
  }, { sparseTrace: true });
});

test('phase10-ledger check covers phase10 curator role surfaces in trace reconciliation', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () => checkPhase10Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: ['environment/phase10/curator-role.js']
      }),
      /E_PHASE10_TRACE_MISSING.*environment\/phase10\/curator-role\.js/u
    );
  }, { sparseTrace: true });
});

test('phase10-ledger check covers curator changes in agent-orchestration runtime trace', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () => checkPhase10Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: ['environment/orchestrator/agent-orchestration.js']
      }),
      /E_PHASE10_TRACE_MISSING.*environment\/orchestrator\/agent-orchestration\.js/u
    );
  }, { sparseTrace: true });
});

test('phase10-ledger check covers domain lifecycle CLI surfaces in trace reconciliation', async () => {
  await withFixtureWorkspace(async ({ workspaceRoot, vreRoot }) => {
    await assert.rejects(
      () => checkPhase10Ledger({
        repoRoot: vreRoot,
        workspaceRoot,
        changedFiles: ['environment/tests/cli/domain-cli.test.js']
      }),
      /E_PHASE10_TRACE_MISSING.*environment\/tests\/cli\/domain-cli\.test\.js/u
    );
  }, { sparseTrace: true });
});
