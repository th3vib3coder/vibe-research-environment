export const DOCTOR_DRIFT_REASON_CODES = Object.freeze({
  taxonomyInvalid: 'E_PHASE11_DOCTOR_TAXONOMY_INVALID',
  projectionStale: 'E_PHASE11_DOCTOR_PROJECTION_STALE',
  mirrorStale: 'E_PHASE11_DOCTOR_MIRROR_STALE',
  coverageScratchLeak: 'E_PHASE11_DOCTOR_COVERAGE_SCRATCH_LEAK',
  gateMismatch: 'E_PHASE11_DOCTOR_GATE_MISMATCH',
  authorityRegenerationBlocked:
    'E_PHASE11_DOCTOR_AUTHORITY_REGENERATION_BLOCKED',
  scratchCleanupBlocked: 'E_PHASE11_DOCTOR_SCRATCH_CLEANUP_BLOCKED',
  stateRiskMissing: 'E_PHASE11_DOCTOR_STATE_RISK_MISSING',
  ledgerCheckNotGreen: 'E_PHASE11_DOCTOR_LEDGER_CHECK_NOT_GREEN',
  shippedEvidenceNotGreen: 'E_PHASE11_DOCTOR_SHIPPED_EVIDENCE_NOT_GREEN'
});

function normalizePath(pathValue) {
  return String(pathValue ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function hasPassingStatus(check) {
  return check?.status === 'pass' || check?.status === 'ok';
}

function compareIssues(left, right) {
  const leftKey = [
    left.code,
    left.sourceId ?? '',
    left.path ?? '',
    left.followUpId ?? '',
    left.expectedGateId ?? ''
  ].join('|');
  const rightKey = [
    right.code,
    right.sourceId ?? '',
    right.path ?? '',
    right.followUpId ?? '',
    right.expectedGateId ?? ''
  ].join('|');
  return leftKey.localeCompare(rightKey);
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function sourceMap(taxonomy) {
  return new Map(
    (Array.isArray(taxonomy?.sources) ? taxonomy.sources : [])
      .filter((source) => typeof source?.id === 'string')
      .map((source) => [source.id, source])
  );
}

function findScratchSource(entry, sources) {
  const normalizedEntry = normalizePath(entry);

  for (const source of sources) {
    if (source.kind !== 'scratch-noise') {
      continue;
    }

    const sourcePath = normalizePath(source.path);
    if (sourcePath.endsWith('*')) {
      const prefix = sourcePath.slice(0, -1);
      if (normalizedEntry.startsWith(prefix)) {
        return source;
      }
    } else if (sourcePath.endsWith('/')) {
      if (normalizedEntry.startsWith(sourcePath)) {
        return source;
      }
    } else if (normalizedEntry === sourcePath) {
      return source;
    }
  }

  return null;
}

function checkProjectionSources({ sources, checks, issues }) {
  for (const source of sources) {
    if (source.kind !== 'projection') {
      continue;
    }

    const check = checks[source.id];
    if (hasPassingStatus(check)) {
      continue;
    }

    issues.push(issue(
      source.id === 'wiki-mirror'
        ? DOCTOR_DRIFT_REASON_CODES.mirrorStale
        : DOCTOR_DRIFT_REASON_CODES.projectionStale,
      {
        sourceId: source.id,
        kind: source.kind,
        observedStatus: check?.status ?? 'missing',
        detail: check?.detail
      }
    ));
  }
}

function checkRuntimeLedgers({ sources, checks, issues }) {
  for (const source of sources) {
    if (source.kind !== 'runtime-ledger') {
      continue;
    }

    const check = checks[source.id];
    if (!hasPassingStatus(check)) {
      issues.push(issue(
        DOCTOR_DRIFT_REASON_CODES.ledgerCheckNotGreen,
        {
          sourceId: source.id,
          kind: source.kind,
          observedStatus: check?.status ?? 'missing'
        }
      ));
    }
  }
}

function checkShippedEvidence({ checks, issues }) {
  const check = checks['git-and-github-actions'];
  if (!hasPassingStatus(check)) {
    issues.push(issue(
      DOCTOR_DRIFT_REASON_CODES.shippedEvidenceNotGreen,
      {
        sourceId: 'git-and-github-actions',
        observedStatus: check?.status ?? 'missing'
      }
    ));
  }
}

function checkCoverageEntries({ sources, coverageEntries, issues }) {
  for (const entry of coverageEntries) {
    const source = findScratchSource(entry, sources);
    if (source == null) {
      continue;
    }

    issues.push(issue(
      DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak,
      {
        sourceId: source.id,
        path: normalizePath(entry),
        cleanupPolicy: source.cleanupPolicy,
        cleanupEligible: source.cleanupEligible === true,
        cleanupOwner: source.cleanupOwner
      }
    ));
  }
}

function checkGateExpectations({ gateExpectations, issues }) {
  for (const expectation of gateExpectations) {
    const allowedStatuses = Array.isArray(expectation?.allowedStatuses)
      ? expectation.allowedStatuses
      : [];
    const gateIdMatches =
      expectation?.expectedGateId === expectation?.actualGateId;
    const statusAllowed =
      allowedStatuses.length === 0
      || allowedStatuses.includes(expectation?.actualStatus);

    if (!gateIdMatches || !statusAllowed) {
      issues.push(issue(
        DOCTOR_DRIFT_REASON_CODES.gateMismatch,
        {
          sourceId: 'decision-gates-json',
          expectedGateId: expectation?.expectedGateId,
          actualGateId: expectation?.actualGateId,
          actualStatus: expectation?.actualStatus,
          allowedStatuses
        }
      ));
    }
  }
}

function checkProposedActions({ proposedActions, byId, issues }) {
  for (const action of proposedActions) {
    const source = byId.get(action?.sourceId);

    if (action?.type === 'regenerate' && source?.kind === 'authority') {
      issues.push(issue(
        DOCTOR_DRIFT_REASON_CODES.authorityRegenerationBlocked,
        {
          sourceId: source.id,
          severity: 'conflict',
          regenerationAllowed: source.regenerationAllowed === true
        }
      ));
    }

    if (
      action?.type === 'cleanup'
      && source?.kind === 'scratch-noise'
      && source.cleanupEligible !== true
    ) {
      issues.push(issue(
        DOCTOR_DRIFT_REASON_CODES.scratchCleanupBlocked,
        {
          sourceId: source.id,
          severity: 'conflict',
          cleanupPolicy: source.cleanupPolicy,
          cleanupEligible: false
        }
      ));
    }
  }
}

function checkStateRisks({ sources, stateRisks, issues }) {
  for (const source of sources) {
    if (source.kind !== 'state-risk' || typeof source.followUpId !== 'string') {
      continue;
    }

    if (stateRisks[source.followUpId] == null) {
      issues.push(issue(
        DOCTOR_DRIFT_REASON_CODES.stateRiskMissing,
        {
          sourceId: source.id,
          followUpId: source.followUpId,
          requiredTreatment: source.requiredTreatment
        }
      ));
    }
  }
}

export function buildDoctorDriftReport({ taxonomy, observedState }) {
  const sources = Array.isArray(taxonomy?.sources) ? taxonomy.sources : [];
  const byId = sourceMap(taxonomy);
  const checks = observedState?.checks ?? {};
  const issues = [];

  if (taxonomy?.schemaVersion !== 'phase11.state-source-taxonomy.v1') {
    issues.push(issue(
      DOCTOR_DRIFT_REASON_CODES.taxonomyInvalid,
      { observedSchemaVersion: taxonomy?.schemaVersion }
    ));
  }

  checkProjectionSources({ sources, checks, issues });
  checkRuntimeLedgers({ sources, checks, issues });
  checkShippedEvidence({ checks, issues });
  checkCoverageEntries({
    sources,
    coverageEntries: observedState?.coverageEntries ?? [],
    issues
  });
  checkGateExpectations({
    gateExpectations: observedState?.gateExpectations ?? [],
    issues
  });
  checkProposedActions({
    proposedActions: observedState?.proposedActions ?? [],
    byId,
    issues
  });
  checkStateRisks({
    sources,
    stateRisks: observedState?.stateRisks ?? {},
    issues
  });

  issues.sort(compareIssues);

  return {
    schemaVersion: 'phase11.doctor-drift-report.v1',
    readOnly: true,
    ok: issues.length === 0,
    actions: [],
    issues,
    sourceCount: sources.length
  };
}
