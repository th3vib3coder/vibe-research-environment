import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { now } from '../control/_io.js';
import { ORCHESTRATOR_FILES } from './_paths.js';
import {
  appendOrchestratorJsonl,
  readOrchestratorJsonl,
  withOrchestratorLock,
} from './_io.js';
import {
  buildDefaultContinuityProfile,
  bootstrapContinuityProfile,
  readContinuityProfile,
  writeContinuityProfile,
} from './state.js';

const HISTORY_SCHEMA = 'continuity-profile-history.schema.json';
const HISTORY_LABEL = 'continuity profile history record';
const HISTORY_LOCK = 'continuity-profile-history';
const PROFILE_LOCK = 'continuity-profile';
const PATH_DESCRIPTORS = Object.freeze({
  '/operator/defaultAutonomyPreference': true,
  '/operator/reportVerbosity': true,
  '/operator/reviewStrictness': true,
  '/operator/quietHoursLocal': true,
  '/project/primaryAudience': true,
  '/project/defaultReportKinds': true,
  '/runtime/preferredLaneRoles': true,
  '/runtime/defaultAllowApiFallback': true,
});

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function generateStampedId(prefix) {
  const stamp = now()
    .replace(/[:.]/gu, '-')
    .replace('T', '-')
    .replace('Z', '');
  return `${prefix}-${stamp}-${randomUUID().slice(0, 8)}`;
}

function assertAllowedContinuityPath(targetPath) {
  const rawPath = typeof targetPath === 'string' ? targetPath.trim() : '';
  const normalizedPath = rawPath.startsWith('/')
    ? rawPath
    : `/${rawPath.replaceAll('.', '/')}`;

  if (!PATH_DESCRIPTORS[normalizedPath]) {
    throw new Error(`Unsupported continuity profile path: ${targetPath}`);
  }
  return normalizedPath;
}

function normalizeActor(actor) {
  if (actor === 'operator' || actor === 'orchestrator-proposal') {
    return actor;
  }

  throw new Error('actor must be "operator" or "orchestrator-proposal".');
}

function requireReason(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function splitPath(targetPath) {
  return targetPath.split('/').filter(Boolean);
}

function getNestedValue(source, targetPath) {
  return splitPath(targetPath).reduce((current, segment) => current?.[segment], source);
}

function setNestedValue(target, targetPath, value) {
  const segments = splitPath(targetPath);
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = cursor[segments[index]];
  }
  cursor[segments[segments.length - 1]] = cloneValue(value);
}

function buildHistoryRecord({
  eventKind,
  path,
  previousValue,
  actor,
  recordedAt,
  newValue = undefined,
  reason = null,
  forgetReason = null,
  forgottenAt = null,
}) {
  const record = {
    schemaVersion: 'vibe-orch.continuity-profile-history.v1',
    entryId: generateStampedId('ORCH-CPH'),
    eventKind,
    path,
    previousValue: cloneValue(previousValue),
    actor,
    recordedAt,
  };

  if (newValue !== undefined) {
    record.newValue = cloneValue(newValue);
  }
  if (reason !== null) {
    record.reason = reason;
  }
  if (forgetReason !== null) {
    record.forgetReason = forgetReason;
  }
  if (forgottenAt !== null) {
    record.forgottenAt = forgottenAt;
  }

  return record;
}

async function appendHistoryRecord(projectPath, record) {
  return appendOrchestratorJsonl(
    projectPath,
    ORCHESTRATOR_FILES.continuityProfileHistory,
    record,
    {
      schemaFile: HISTORY_SCHEMA,
      label: HISTORY_LABEL,
      lockName: HISTORY_LOCK,
    },
  );
}

async function readEffectiveContinuityProfile(projectPath) {
  return (await readContinuityProfile(projectPath)) ?? buildDefaultContinuityProfile();
}

export async function loadContinuityProfile(projectPath) {
  return readEffectiveContinuityProfile(projectPath);
}

function buildProposal({
  proposalId,
  eventKind,
  path,
  previousValue,
  newValue = undefined,
  reason = null,
  forgetReason = null,
  actor,
  proposedAt,
}) {
  return {
    proposalId,
    eventKind,
    path,
    previousValue: cloneValue(previousValue),
    newValue: newValue === undefined ? undefined : cloneValue(newValue),
    reason,
    forgetReason,
    actor,
    proposedAt,
    status: 'pending',
  };
}

export async function listContinuityProfileHistory(projectPath, filters = {}) {
  let records;
  try {
    records = await readOrchestratorJsonl(
      projectPath,
      ORCHESTRATOR_FILES.continuityProfileHistory,
      {
        schemaFile: HISTORY_SCHEMA,
        label: HISTORY_LABEL,
      },
    );
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  if (filters.eventKind) {
    records = records.filter((record) => record.eventKind === filters.eventKind);
  }
  if (filters.path) {
    const targetPath = assertAllowedContinuityPath(filters.path);
    records = records.filter((record) => record.path === targetPath);
  }
  if (filters.actor) {
    records = records.filter((record) => record.actor === filters.actor);
  }

  records.sort((left, right) =>
    (right.recordedAt ?? '').localeCompare(left.recordedAt ?? ''),
  );

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return records.slice(offset, offset + limit);
}

export async function applyContinuityProfileUpdate(projectPath, input = {}) {
  const targetPath = assertAllowedContinuityPath(input.path);
  const actor = normalizeActor(input.actor ?? 'operator');
  const reason = requireReason(input.reason, 'reason');
  const recordedAt = input.recordedAt ?? now();
  return withOrchestratorLock(projectPath, PROFILE_LOCK, async () => {
    const profile = await bootstrapContinuityProfile(projectPath);
    const previousValue = cloneValue(getNestedValue(profile, targetPath));
    const newValue = cloneValue(input.newValue);

    if (isDeepStrictEqual(previousValue, newValue)) {
      return {
        changed: false,
        profile,
        historyEntry: null,
      };
    }

    const nextProfile = cloneValue(profile);
    setNestedValue(nextProfile, targetPath, newValue);
    nextProfile.updatedAt = recordedAt;

    await writeContinuityProfile(projectPath, nextProfile);
    const historyEntry = buildHistoryRecord({
      eventKind: 'update',
      path: targetPath,
      previousValue,
      newValue,
      reason,
      actor,
      recordedAt,
    });
    await appendHistoryRecord(projectPath, historyEntry);

    return {
      changed: true,
      profile: nextProfile,
      historyEntry,
    };
  });
}

export async function applyContinuityProfileForget(projectPath, input = {}) {
  const targetPath = assertAllowedContinuityPath(input.path);
  const actor = normalizeActor(input.actor ?? 'operator');
  const forgetReason = requireReason(input.forgetReason, 'forgetReason');
  const recordedAt = input.recordedAt ?? now();
  return withOrchestratorLock(projectPath, PROFILE_LOCK, async () => {
    const profile = await bootstrapContinuityProfile(projectPath);
    const defaults = buildDefaultContinuityProfile();
    const previousValue = cloneValue(getNestedValue(profile, targetPath));
    const defaultValue = cloneValue(getNestedValue(defaults, targetPath));

    if (isDeepStrictEqual(previousValue, defaultValue)) {
      return {
        changed: false,
        profile,
        historyEntry: null,
      };
    }

    const nextProfile = cloneValue(profile);
    setNestedValue(nextProfile, targetPath, defaultValue);
    nextProfile.updatedAt = recordedAt;

    await writeContinuityProfile(projectPath, nextProfile);
    const historyEntry = buildHistoryRecord({
      eventKind: 'forget',
      path: targetPath,
      previousValue,
      actor,
      recordedAt,
      forgetReason,
      forgottenAt: recordedAt,
    });
    await appendHistoryRecord(projectPath, historyEntry);

    return {
      changed: true,
      profile: nextProfile,
      historyEntry,
    };
  });
}

export async function createContinuityUpdateProposal(projectPath, input = {}) {
  const targetPath = assertAllowedContinuityPath(input.path);
  const actor = normalizeActor(input.actor ?? 'orchestrator-proposal');
  const reason = requireReason(input.reason, 'reason');
  const proposedAt = input.proposedAt ?? now();
  const profile = await readEffectiveContinuityProfile(projectPath);
  const previousValue = getNestedValue(profile, targetPath);

  return buildProposal({
    proposalId: input.proposalId ?? generateStampedId('ORCH-CPP'),
    eventKind: 'update',
    path: targetPath,
    previousValue,
    newValue: input.newValue,
    reason,
    actor,
    proposedAt,
  });
}

export async function createContinuityForgetProposal(projectPath, input = {}) {
  const targetPath = assertAllowedContinuityPath(input.path);
  const actor = normalizeActor(input.actor ?? 'orchestrator-proposal');
  const forgetReason = requireReason(input.forgetReason, 'forgetReason');
  const proposedAt = input.proposedAt ?? now();
  const profile = await readEffectiveContinuityProfile(projectPath);
  const previousValue = getNestedValue(profile, targetPath);

  return buildProposal({
    proposalId: input.proposalId ?? generateStampedId('ORCH-CPP'),
    eventKind: 'forget',
    path: targetPath,
    previousValue,
    forgetReason,
    actor,
    proposedAt,
  });
}

export async function confirmContinuityProposal(projectPath, proposal, options = {}) {
  if (!proposal || typeof proposal !== 'object') {
    throw new TypeError('proposal must be an object.');
  }

  const confirmedAt = options.recordedAt ?? now();

  if (proposal.eventKind === 'update') {
    const result = await applyContinuityProfileUpdate(projectPath, {
      path: proposal.path,
      newValue: proposal.newValue,
      reason: proposal.reason,
      actor: proposal.actor,
      recordedAt: confirmedAt,
    });

    return {
      status: result.changed ? 'confirmed' : 'noop',
      proposalId: proposal.proposalId ?? null,
      confirmedAt,
      result,
    };
  }

  if (proposal.eventKind === 'forget') {
    const result = await applyContinuityProfileForget(projectPath, {
      path: proposal.path,
      forgetReason: proposal.forgetReason,
      actor: proposal.actor,
      recordedAt: confirmedAt,
    });

    return {
      status: result.changed ? 'confirmed' : 'noop',
      proposalId: proposal.proposalId ?? null,
      confirmedAt,
      result,
    };
  }

  throw new Error(`Unsupported continuity proposal event kind: ${proposal.eventKind}`);
}

export function rejectContinuityProposal(proposal, options = {}) {
  if (!proposal || typeof proposal !== 'object') {
    throw new TypeError('proposal must be an object.');
  }

  return {
    status: 'rejected',
    proposalId: proposal.proposalId ?? null,
    rejectedAt: options.rejectedAt ?? now(),
    rejectionReason: options.reason ?? null,
    proposal: cloneValue(proposal),
  };
}

export const INTERNALS = {
  PATH_DESCRIPTORS,
  assertAllowedContinuityPath,
  buildHistoryRecord,
  getNestedValue,
  loadContinuityProfile,
  setNestedValue,
};
