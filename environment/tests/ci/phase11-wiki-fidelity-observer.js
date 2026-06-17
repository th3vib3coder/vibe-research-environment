import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, readJson, repoRoot, runValidator } from './_helpers.js';
import {
  buildDoctorDriftReport,
  DOCTOR_DRIFT_REASON_CODES
} from '../../phase11/doctor-drift-detector.js';
import { buildDoctorReconcilePlan } from '../../phase11/doctor-reconcile-mode.js';
import {
  buildWikiFidelityObservedState,
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

export default async function validatePhase11WikiFidelityObserver() {
  const taxonomy = await readJson(
    'environment/tests/fixtures/phase11/state-source-taxonomy.json'
  );
  const observed = buildWikiFidelityObservedState({
    buildRegistriesCheck: {
      ok: true,
      mode: 'check',
      pages: [],
      changed: []
    },
    syncMirrorCheck: {
      ok: true,
      summary: { added: 0, modified: 0, removed: 0, changed: 0 },
      added: [],
      modified: [],
      removed: []
    },
    coverageCheck: { ok: true, counts: { 'file-inventory.jsonl': 1 } },
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
    ),
    fileInventoryJsonl: JSON.stringify({
      path: 'vibe-research-environment/analysis/a.py'
    })
  });

  assert(
    observed.checks['wiki-coverage-inventories'].status === 'fail',
    'current real WIKI artifacts must expose coverage drift'
  );
  assert(
    observed.checks['wiki-coverage-inventories'].reasons.includes(
      WIKI_FIDELITY_REASON_CODES.coverageCountMismatch
    ),
    'real WIKI drift must be a count mismatch, not a caller date'
  );

  const report = buildDoctorDriftReport({
    taxonomy,
    observedState: {
      ...observed,
      gateExpectations: [],
      stateRisks: {
        'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001': { status: 'open' }
      },
      proposedActions: []
    }
  });

  assert(
    report.issues.some((issue) =>
      issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
        && issue.sourceId === 'wiki-coverage-inventories'
    ),
    'coverage drift must reach doctor projectionStale consumer'
  );
  assert(
    report.issues.some((issue) =>
      issue.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
        && issue.sourceId === 'scratch-analysis'
    ),
    'workspace-prefixed analysis leak must reach doctor scratch taxonomy'
  );

  const plan = await buildDoctorReconcilePlan({ taxonomy, doctorReport: report });
  assert(plan.executedActions.length === 0, 'fidelity reconcile proof must not execute');
  assert(
    plan.actions.some((action) =>
      action.sourceId === 'wiki-coverage-inventories'
        && action.execute === false
    ),
    'projection drift must stay plan-only'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-wiki-fidelity-observer',
    validatePhase11WikiFidelityObserver
  );
}
