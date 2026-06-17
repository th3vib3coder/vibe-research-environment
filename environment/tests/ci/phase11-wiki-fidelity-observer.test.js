import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { repoRoot, readJson } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';
import { buildDoctorReconcilePlan } from '../../phase11/doctor-reconcile-mode.js';
import {
  buildWikiFidelityObservedState,
  normalizeWikiCoveragePath,
  WIKI_FIDELITY_REASON_CODES
} from '../../phase11/wiki-fidelity-observer.js';

const wikiRoot = path.resolve(
  repoRoot,
  '../vibe-science/blueprints/private/WIKI_VRE'
);

const capturedCurrentCoverageSummary = {
  generatedAt: '2026-04-26',
  liveSourceWithoutOwner: 10
};
const capturedCurrentOwnershipSummary = {
  generatedAt: '2026-04-26',
  unownedLiveSource: 10
};
const capturedCurrentLiveSourceGaps = [
  'last-verified-at: 2026-06-16',
  'Current generated count: **0**.'
].join('\n');

function closedResearchLoopGovernanceFlake() {
  return {
    status: 'reviewed-closed',
    closureEvidence: {
      testPath: 'environment/tests/cli/research-loop.test.js',
      regressionTest: 'research-loop logs objective_blocked governance event for rule-only blocker',
      duplicateGuardTest: 'governance event selector fails closed on duplicate matching events'
    }
  };
}

async function readRealWikiText(relativePath, fallback) {
  try {
    return await readFile(path.join(wikiRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function loadTaxonomy() {
  return readJson('environment/tests/fixtures/phase11/state-source-taxonomy.json');
}

function baseEvidence(overrides = {}) {
  return {
    toolRoots: {
      wikiRoot: 'C:/repo/vibe-science/blueprints/private/WIKI_VRE',
      workspaceRoot: 'C:/repo',
      toolRoot: 'C:/repo/vibe-science/blueprints/private/WIKI_VRE/tools'
    },
    buildRegistriesCheck: {
      ok: true,
      mode: 'check',
      pages: ['entities/registry-exported-symbols.md'],
      changed: []
    },
    syncMirrorCheck: {
      ok: true,
      summary: { added: 0, modified: 0, removed: 0, changed: 0 },
      added: [],
      modified: [],
      removed: []
    },
    coverageCheck: { ok: true, counts: { 'file-inventory.jsonl': 3 } },
    coverageSummary: {
      generatedAt: '2026-06-16',
      liveSourceWithoutOwner: 0
    },
    ownershipResolutionSummary: {
      generatedAt: '2026-06-16',
      unownedLiveSource: 0
    },
    liveSourceGapsMarkdown: 'last-verified-at: 2026-06-16\nCurrent generated count: **0**.',
    fileInventoryJsonl: '',
    ...overrides
  };
}

function buildReport(taxonomy, evidence) {
  return buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...buildWikiFidelityObservedState(evidence),
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
      },
      proposedActions: []
    }
  });
}

test('registry drift maps to doctor projection issue', async () => {
  const taxonomy = await loadTaxonomy();
  const report = buildReport(taxonomy, baseEvidence({
    buildRegistriesCheck: {
      ok: true,
      mode: 'check',
      pages: [],
      changed: ['entities/registry-exported-symbols.md']
    }
  }));

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
      && issue.sourceId === 'wiki-generated-registries'
  ));
});

test('mirror drift maps to doctor mirror issue', async () => {
  const taxonomy = await loadTaxonomy();
  const report = buildReport(taxonomy, baseEvidence({
    syncMirrorCheck: {
      ok: true,
      summary: { added: 0, modified: 1, removed: 0, changed: 1 },
      added: [],
      modified: ['log.md'],
      removed: []
    }
  }));

  assert.equal(report.ok, false);
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.mirrorStale
      && issue.sourceId === 'wiki-mirror'
  ));
});

test('coverage check green is not freshness proof', async () => {
  const observed = buildWikiFidelityObservedState(baseEvidence({
    coverageSummary: {
      generatedAt: '2026-01-01',
      liveSourceWithoutOwner: 0
    },
    ownershipResolutionSummary: {
      generatedAt: '2026-06-16',
      unownedLiveSource: 0
    }
  }));

  assert.equal(observed.checks['wiki-coverage-inventories'].status, 'fail');
  assert(observed.checks['wiki-coverage-inventories'].reasons.includes(
    WIKI_FIDELITY_REASON_CODES.coverageGeneratedAtStale
  ));
});

test('coverage summary, ownership summary, and page count must agree', async () => {
  const taxonomy = await loadTaxonomy();
  const observed = buildWikiFidelityObservedState(baseEvidence({
    coverageSummary: {
      generatedAt: '2026-04-26',
      liveSourceWithoutOwner: 10
    },
    ownershipResolutionSummary: {
      generatedAt: '2026-04-26',
      unownedLiveSource: 10
    },
    liveSourceGapsMarkdown: 'last-verified-at: 2026-06-16\nCurrent generated count: **0**.'
  }));
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...observed,
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
      }
    }
  });

  assert.equal(observed.checks['wiki-coverage-inventories'].status, 'fail');
  assert(observed.checks['wiki-coverage-inventories'].reasons.includes(
    WIKI_FIDELITY_REASON_CODES.coverageCountMismatch
  ));
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
      && issue.sourceId === 'wiki-coverage-inventories'
  ));
});

test('workspace VRE coverage paths normalize before doctor handoff', async () => {
  assert.deepEqual(
    normalizeWikiCoveragePath('vibe-research-environment/analysis/a.py'),
    { path: 'analysis/a.py', repo: 'vibe-research-environment' }
  );
  assert.deepEqual(
    normalizeWikiCoveragePath('vibe-science/plugin/lib/a.js'),
    { path: 'vibe-science/plugin/lib/a.js', repo: 'vibe-science' }
  );

  const taxonomy = await loadTaxonomy();
  const observed = buildWikiFidelityObservedState(baseEvidence({
    fileInventoryJsonl: [
      JSON.stringify({ path: 'vibe-research-environment/analysis/a.py' }),
      JSON.stringify({ path: 'vibe-research-environment/.tmp-vre-x/out.json' }),
      JSON.stringify({ path: 'vibe-research-environment/.tmp/out.json' }),
      JSON.stringify({ path: 'vibe-research-environment/audit.config.yaml' }),
      JSON.stringify({ path: 'vibe-research-environment/audit/report.md' }),
      JSON.stringify({ path: 'vibe-research-environment/vibe-science/nested.md' }),
      JSON.stringify({ path: 'vibe-science/plugin/lib/not-scratch.js' })
    ].join('\n')
  }));
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...observed,
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
      }
    }
  });

  assert.deepEqual(observed.coverageEntries, [
    '.tmp-vre-x/out.json',
    '.tmp/out.json',
    'analysis/a.py',
    'audit.config.yaml',
    'audit/report.md',
    'vibe-science/nested.md'
  ]);
  assert(!observed.coverageEntries.includes('vibe-science/plugin/lib/not-scratch.js'));
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
      && issue.sourceId === 'scratch-analysis'
  ));
});

test('malformed or missing evidence fails closed', () => {
  const observed = buildWikiFidelityObservedState(baseEvidence({
    buildRegistriesCheck: '{not-json',
    syncMirrorCheck: null,
    coverageSummary: null
  }));

  assert.equal(observed.checks['wiki-generated-registries'].status, 'fail');
  assert.equal(observed.checks['wiki-mirror'].status, 'missing');
  assert.equal(observed.checks['wiki-coverage-inventories'].status, 'fail');
});

test('helper output is reconcile-bounded with no executed actions', async () => {
  const taxonomy = await loadTaxonomy();
  const observed = buildWikiFidelityObservedState(baseEvidence({
    coverageSummary: { generatedAt: '2026-04-26', liveSourceWithoutOwner: 10 },
    ownershipResolutionSummary: { generatedAt: '2026-04-26', unownedLiveSource: 10 },
    liveSourceGapsMarkdown: 'Current generated count: **0**.',
    fileInventoryJsonl: JSON.stringify({
      path: 'vibe-research-environment/analysis/a.py'
    })
  }));
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...observed,
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
      }
    }
  });
  const plan = await buildDoctorReconcilePlan({ taxonomy, doctorReport: report });

  assert.deepEqual(plan.executedActions, []);
  assert(plan.actions.some((action) =>
    action.type === 'regenerate-projection-plan'
      && action.sourceId === 'wiki-coverage-inventories'
      && action.execute === false
  ));
  assert(plan.blockedActions.some((action) =>
    action.sourceId === 'scratch-analysis'
  ));
});

test('current on-disk WIKI artifacts expose the real false green', async () => {
  const taxonomy = await loadTaxonomy();
  const observed = buildWikiFidelityObservedState(baseEvidence({
    coverageSummary: await readRealWikiText(
      'coverage/coverage-summary.json',
      JSON.stringify(capturedCurrentCoverageSummary)
    ),
    ownershipResolutionSummary: await readRealWikiText(
      'coverage/ownership-resolution-summary.json',
      JSON.stringify(capturedCurrentOwnershipSummary)
    ),
    liveSourceGapsMarkdown: await readRealWikiText(
      'coverage/live-source-gaps.md',
      capturedCurrentLiveSourceGaps
    )
  }));
  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...observed,
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': closedResearchLoopGovernanceFlake()
      }
    }
  });

  assert.equal(observed.checks['wiki-coverage-inventories'].status, 'fail');
  assert(report.issues.some((issue) =>
    issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
      && issue.sourceId === 'wiki-coverage-inventories'
  ));
});

test('helper source does not spawn tools or write private WIKI files', async () => {
  const source = await readFile(
    path.join(repoRoot, 'environment/phase11/wiki-fidelity-observer.js'),
    'utf8'
  );

  assert(!/\bchild_process\b|\bspawn\b|\bexec(File)?\b/u.test(source));
  assert(!/\bwriteFile\b|\brm\b|\bunlink\b/u.test(source));
});
