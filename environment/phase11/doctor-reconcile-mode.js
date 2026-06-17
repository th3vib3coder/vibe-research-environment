import { lstat, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

import { DOCTOR_DRIFT_REASON_CODES } from './doctor-drift-detector.js';

export const DOCTOR_RECONCILE_REASON_CODES = Object.freeze({
  invalidReport: 'E_PHASE11_RECONCILE_REPORT_INVALID',
  callerActionsRejected: 'E_PHASE11_RECONCILE_CALLER_ACTIONS_REJECTED',
  sourceMissing: 'E_PHASE11_RECONCILE_SOURCE_MISSING',
  sourceNotScratch: 'E_PHASE11_RECONCILE_SOURCE_NOT_SCRATCH',
  pathMissing: 'E_PHASE11_RECONCILE_PATH_MISSING',
  pathSourceMismatch: 'E_PHASE11_RECONCILE_PATH_SOURCE_MISMATCH',
  protectedPathBlocked: 'E_PHASE11_RECONCILE_PROTECTED_PATH_BLOCKED',
  symlinkTargetBlocked: 'E_PHASE11_RECONCILE_SYMLINK_TARGET_BLOCKED',
  pathOutsideWorkspace: 'E_PHASE11_RECONCILE_PATH_OUTSIDE_WORKSPACE',
  scratchOwnershipMarkerMissing:
    'E_PHASE11_RECONCILE_SCRATCH_OWNERSHIP_MARKER_MISSING',
  cleanupOwnerMismatch: 'E_PHASE11_RECONCILE_CLEANUP_OWNER_MISMATCH',
  scratchCleanupPolicyBlocked:
    'E_PHASE11_RECONCILE_SCRATCH_CLEANUP_POLICY_BLOCKED',
  authorityRegenerationBlocked:
    'E_PHASE11_RECONCILE_AUTHORITY_REGENERATION_BLOCKED',
  semanticConflict: 'E_PHASE11_RECONCILE_SEMANTIC_CONFLICT'
});

const OWNED_SCRATCH_MARKER = '.vre-owned-scratch.json';

function normalizePath(pathValue) {
  return String(pathValue ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function reportPath(pathValue) {
  return normalizePath(pathValue).replace(/^[A-Za-z]:/u, '');
}

function makeIssue(code, extra = {}) {
  return { code, ...extra };
}

function sourceMap(taxonomy) {
  return new Map(
    (Array.isArray(taxonomy?.sources) ? taxonomy.sources : [])
      .filter((source) => typeof source?.id === 'string')
      .map((source) => [source.id, source])
  );
}

function sourcePathMatches(source, candidatePath) {
  const sourcePattern = normalizePath(source?.path);
  const candidate = normalizePath(candidatePath);

  if (!sourcePattern || !candidate) {
    return false;
  }

  if (sourcePattern.endsWith('*')) {
    return candidate.startsWith(sourcePattern.slice(0, -1));
  }

  if (sourcePattern.endsWith('/')) {
    return candidate === sourcePattern.slice(0, -1)
      || candidate.startsWith(sourcePattern);
  }

  return candidate === sourcePattern;
}

function cleanupRootForTarget(source, normalizedTarget) {
  const sourcePattern = normalizePath(source?.path);
  if (sourcePattern.endsWith('*')) {
    return normalizePath(normalizedTarget).split('/').filter(Boolean)[0] ?? '';
  }
  if (sourcePattern.endsWith('/')) {
    return sourcePattern.replace(/\/$/u, '');
  }
  return normalizePath(normalizedTarget);
}

function isInsideOrSame(childPath, parentPath) {
  const child = comparablePath(childPath);
  const parent = comparablePath(parentPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function comparablePath(pathValue) {
  const normalized = path.normalize(path.resolve(pathValue));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

async function realpathOrResolved(absolutePath) {
  try {
    return await realpath(absolutePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return path.resolve(absolutePath);
    }
    throw error;
  }
}

async function canonicalWorkspace(workspaceRoot) {
  return realpathOrResolved(path.resolve(workspaceRoot));
}

async function findSymlinkSegment({ workspaceCanonical, targetAbsolute }) {
  const relative = path.relative(workspaceCanonical, targetAbsolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const parts = relative.split(path.sep).filter(Boolean);
  let current = workspaceCanonical;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        return current;
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  return null;
}

async function validateOwnedScratchMarker({
  source,
  workspaceCanonical,
  normalizedTarget
}) {
  const rootRelative = cleanupRootForTarget(source, normalizedTarget);
  if (!rootRelative) {
    return {
      ok: false,
      blocked: makeIssue(
        DOCTOR_RECONCILE_REASON_CODES.scratchOwnershipMarkerMissing,
        { sourceId: source.id, path: normalizedTarget }
      )
    };
  }

  const rootAbsolute = path.resolve(workspaceCanonical, rootRelative);
  if (!isInsideOrSame(rootAbsolute, workspaceCanonical)) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.pathOutsideWorkspace, {
        sourceId: source.id,
        path: normalizedTarget,
        canonicalPath: reportPath(rootAbsolute)
      })
    };
  }

  const symlinkSegment = await findSymlinkSegment({
    workspaceCanonical,
    targetAbsolute: rootAbsolute
  });
  if (symlinkSegment != null) {
    return {
      ok: false,
      blocked: makeIssue(
        DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked,
        {
          sourceId: source.id,
          path: normalizedTarget,
          symlinkPath: reportPath(symlinkSegment)
        }
      )
    };
  }

  try {
    const marker = JSON.parse(
      await readFile(path.join(rootAbsolute, OWNED_SCRATCH_MARKER), 'utf8')
    );
    if (
      marker?.sourceId === source.id
      && marker?.cleanupOwner === source.cleanupOwner
    ) {
      return { ok: true, rootRelative };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return {
    ok: false,
    blocked: makeIssue(
      DOCTOR_RECONCILE_REASON_CODES.scratchOwnershipMarkerMissing,
      {
        sourceId: source.id,
        path: normalizedTarget,
        markerPath: normalizePath(path.join(rootRelative, OWNED_SCRATCH_MARKER))
      }
    )
  };
}

async function protectedCanonicalPaths({ taxonomy, workspaceRoot }) {
  const protectedSources = (Array.isArray(taxonomy?.sources) ? taxonomy.sources : [])
    .filter((source) =>
      source?.kind === 'scratch-noise'
        && (
          source.cleanupPolicy === 'never-auto-delete'
          || source.cleanupEligible !== true
        )
    );

  const paths = [];
  for (const source of protectedSources) {
    const normalized = normalizePath(source.path).replace(/\/$/u, '');
    if (!normalized || normalized.includes('*')) {
      continue;
    }
    const absolutePath = path.resolve(workspaceRoot, normalized);
    paths.push({
      sourceId: source.id,
      path: normalized,
      canonicalPath: await realpathOrResolved(absolutePath)
    });
  }
  return paths;
}

async function validateCleanupTarget({ taxonomy, workspaceRoot, source, issue }) {
  const normalizedTarget = normalizePath(issue.path);
  if (!normalizedTarget) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.pathMissing, {
        sourceId: source.id
      })
    };
  }

  if (!sourcePathMatches(source, normalizedTarget)) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.pathSourceMismatch, {
        sourceId: source.id,
        path: normalizedTarget,
        sourcePath: source.path
      })
    };
  }

  const workspaceCanonical = await canonicalWorkspace(workspaceRoot);
  const targetAbsolute = path.resolve(workspaceCanonical, normalizedTarget);
  if (!isInsideOrSame(targetAbsolute, workspaceCanonical)) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.pathOutsideWorkspace, {
        sourceId: source.id,
        path: normalizedTarget,
        canonicalPath: reportPath(targetAbsolute)
      })
    };
  }

  const symlinkSegment = await findSymlinkSegment({
    workspaceCanonical,
    targetAbsolute
  });
  if (symlinkSegment != null) {
    return {
      ok: false,
      blocked: makeIssue(
        DOCTOR_RECONCILE_REASON_CODES.symlinkTargetBlocked,
        {
          sourceId: source.id,
          path: normalizedTarget,
          symlinkPath: reportPath(symlinkSegment)
        }
      )
    };
  }

  const marker = await validateOwnedScratchMarker({
    source,
    workspaceCanonical,
    normalizedTarget
  });
  if (!marker.ok) {
    return {
      ok: false,
      blocked: marker.blocked
    };
  }

  const targetCanonical = await realpathOrResolved(targetAbsolute);
  const canonicalForReport = reportPath(targetCanonical);

  if (!isInsideOrSame(targetCanonical, workspaceCanonical)) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.pathOutsideWorkspace, {
        sourceId: source.id,
        path: normalizedTarget,
        canonicalPath: canonicalForReport
      })
    };
  }

  const protectedPaths = await protectedCanonicalPaths({ taxonomy, workspaceRoot });
  const protectedMatch = protectedPaths.find((protectedPath) =>
    isInsideOrSame(targetCanonical, protectedPath.canonicalPath)
  );
  if (protectedMatch != null) {
    return {
      ok: false,
      blocked: makeIssue(DOCTOR_RECONCILE_REASON_CODES.protectedPathBlocked, {
        sourceId: source.id,
        path: normalizedTarget,
        canonicalPath: canonicalForReport,
        protectedSourceId: protectedMatch.sourceId,
        protectedPath: protectedMatch.path
      })
    };
  }

  return {
    ok: true,
    targetAbsolute,
    targetCanonical,
    normalizedTarget,
    canonicalPath: canonicalForReport
  };
}

function invalidReportConflict(doctorReport) {
  if (doctorReport?.schemaVersion !== 'phase11.doctor-drift-report.v1') {
    return 'schemaVersion';
  }
  if (!Array.isArray(doctorReport?.issues)) {
    return 'issues';
  }
  if (Array.isArray(doctorReport?.actions) && doctorReport.actions.length > 0) {
    return 'actions';
  }
  return null;
}

function addProjectionPlan({ issue, source, actions }) {
  if (source?.kind !== 'projection') {
    return;
  }
  actions.push({
    type: 'regenerate-projection-plan',
    sourceId: source.id,
    path: source.path,
    command: source.generatorCommand,
    checkCommand: source.checkCommand,
    sourceAuthority: source.sourceAuthority,
    execute: false,
    reason: issue.code
  });
}

function addSemanticConflict({ issue, source, conflicts }) {
  conflicts.push(makeIssue(DOCTOR_RECONCILE_REASON_CODES.semanticConflict, {
    sourceId: issue.sourceId,
    sourceKind: source?.kind,
    reason: issue.code,
    followUpId: issue.followUpId,
    expectedGateId: issue.expectedGateId,
    actualGateId: issue.actualGateId
  }));
}

async function addScratchCleanup({
  taxonomy,
  issue,
  source,
  workspaceRoot,
  dryRun,
  cleanupOwner,
  actions,
  blockedActions,
  executedActions
}) {
  if (source == null) {
    blockedActions.push(makeIssue(DOCTOR_RECONCILE_REASON_CODES.sourceMissing, {
      sourceId: issue.sourceId
    }));
    return;
  }

  if (source.kind !== 'scratch-noise') {
    blockedActions.push(makeIssue(DOCTOR_RECONCILE_REASON_CODES.sourceNotScratch, {
      sourceId: source.id,
      kind: source.kind
    }));
    return;
  }

  if (source.cleanupPolicy === 'never-auto-delete' || source.cleanupEligible !== true) {
    blockedActions.push(makeIssue(DOCTOR_RECONCILE_REASON_CODES.protectedPathBlocked, {
      sourceId: source.id,
      path: issue.path,
      cleanupPolicy: source.cleanupPolicy,
      cleanupEligible: source.cleanupEligible === true
    }));
    return;
  }

  if (source.cleanupPolicy !== 'owned-cleanup') {
    blockedActions.push(makeIssue(
      DOCTOR_RECONCILE_REASON_CODES.scratchCleanupPolicyBlocked,
      {
        sourceId: source.id,
        cleanupPolicy: source.cleanupPolicy
      }
    ));
    return;
  }

  const target = await validateCleanupTarget({
    taxonomy,
    workspaceRoot,
    source,
    issue
  });
  if (!target.ok) {
    blockedActions.push(target.blocked);
    return;
  }

  const action = {
    type: 'cleanup-owned-scratch',
    sourceId: source.id,
    path: target.normalizedTarget,
    canonicalPath: target.canonicalPath,
    cleanupOwner: source.cleanupOwner,
    execute: dryRun === false
  };

  if (dryRun) {
    actions.push({ ...action, execute: false });
    return;
  }

  if (cleanupOwner !== source.cleanupOwner) {
    blockedActions.push(makeIssue(
      DOCTOR_RECONCILE_REASON_CODES.cleanupOwnerMismatch,
      {
        sourceId: source.id,
        expectedCleanupOwner: source.cleanupOwner,
        actualCleanupOwner: cleanupOwner
      }
    ));
    return;
  }

  const finalTarget = await validateCleanupTarget({
    taxonomy,
    workspaceRoot,
    source,
    issue
  });
  if (!finalTarget.ok) {
    blockedActions.push(finalTarget.blocked);
    return;
  }

  await rm(finalTarget.targetCanonical, { recursive: true, force: true });
  actions.push(action);
  executedActions.push(action);
}

export async function buildDoctorReconcilePlan({
  taxonomy,
  doctorReport,
  workspaceRoot = process.cwd(),
  dryRun = true,
  cleanupOwner,
  callerActions = []
}) {
  const actions = [];
  const executedActions = [];
  const blockedActions = [];
  const conflicts = [];
  const byId = sourceMap(taxonomy);

  const invalidField = invalidReportConflict(doctorReport);
  if (invalidField != null) {
    conflicts.push(makeIssue(DOCTOR_RECONCILE_REASON_CODES.invalidReport, {
      field: invalidField
    }));
  }

  if (Array.isArray(callerActions) && callerActions.length > 0) {
    blockedActions.push(makeIssue(
      DOCTOR_RECONCILE_REASON_CODES.callerActionsRejected,
      { actionCount: callerActions.length }
    ));
  }

  if (invalidField == null) {
    for (const issue of doctorReport.issues) {
      const source = byId.get(issue.sourceId);
      if (
        issue.code === DOCTOR_DRIFT_REASON_CODES.projectionStale
        || issue.code === DOCTOR_DRIFT_REASON_CODES.mirrorStale
      ) {
        addProjectionPlan({ issue, source, actions });
      } else if (
        issue.code === DOCTOR_DRIFT_REASON_CODES.coverageScratchLeak
      ) {
        await addScratchCleanup({
          taxonomy,
          issue,
          source,
          workspaceRoot,
          dryRun,
          cleanupOwner,
          actions,
          blockedActions,
          executedActions
        });
      } else if (
        issue.code === DOCTOR_DRIFT_REASON_CODES.scratchCleanupBlocked
      ) {
        blockedActions.push(makeIssue(
          DOCTOR_RECONCILE_REASON_CODES.protectedPathBlocked,
          {
            sourceId: issue.sourceId,
            cleanupPolicy: issue.cleanupPolicy,
            cleanupEligible: issue.cleanupEligible === true
          }
        ));
      } else if (
        issue.code === DOCTOR_DRIFT_REASON_CODES.authorityRegenerationBlocked
      ) {
        conflicts.push(makeIssue(
          DOCTOR_RECONCILE_REASON_CODES.authorityRegenerationBlocked,
          {
            sourceId: issue.sourceId,
            reason: issue.code
          }
        ));
      } else {
        addSemanticConflict({ issue, source, conflicts });
      }
    }
  }

  return {
    schemaVersion: 'phase11.doctor-reconcile-plan.v1',
    ok: conflicts.length === 0 && blockedActions.length === 0,
    dryRun: dryRun !== false,
    actions,
    executedActions,
    blockedActions,
    conflicts,
    sourceCount: Array.isArray(taxonomy?.sources) ? taxonomy.sources.length : 0
  };
}
