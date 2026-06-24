export const RELAY_INJECTION_GUARD_SCHEMA_VERSION =
  'phase14.tl4.4-relay-injection-guard.v1';

const REQUIRED_AUTONOMY_TIER = 'L4';
const REQUIRED_RUNTIME_MODE = 'attended-batch';
const BLOCKED_SURFACE_ORDER = Object.freeze([
  'approval-event-kind',
  'claim-promotion',
  'accepted-claim-edge',
  'confidence-mutation',
  'law13-provenance',
  'claim-export',
  'graphify'
]);

export class Phase14RelayInjectionGuardError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Phase14RelayInjectionGuardError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new Phase14RelayInjectionGuardError(code, message, extra);
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function edgeExists(relayEdge) {
  return isObject(relayEdge) && relayEdge.exists !== false;
}

function edgeKind(relayEdge) {
  if (!edgeExists(relayEdge)) return 'none';
  if (typeof relayEdge.kind !== 'string' || relayEdge.kind.trim() === '') {
    return 'relay-mcp-edge';
  }
  return relayEdge.kind.trim();
}

function assertRuntime(input) {
  if (input.autonomyTier !== REQUIRED_AUTONOMY_TIER) {
    fail(
      'E_PHASE14_RELAY_GUARD_TIER_REQUIRED',
      'TL4.4 relay injection guard requires autonomyTier L4.'
    );
  }
  if (input.runtimeMode === 'unattended-batch') {
    fail(
      'E_PHASE14_RELAY_GUARD_UNATTENDED_FORBIDDEN',
      'TL4.4 relay injection guard forbids unattended-batch runtime.'
    );
  }
  if (input.runtimeMode !== REQUIRED_RUNTIME_MODE) {
    fail(
      'E_PHASE14_RELAY_GUARD_MODE_REQUIRED',
      'TL4.4 relay injection guard requires attended-batch runtime mode.',
      { runtimeMode: input.runtimeMode ?? null }
    );
  }
}

function asTextLength(value) {
  if (typeof value !== 'string') return 0;
  return value.length;
}

function recordSurface(found, surface) {
  if (BLOCKED_SURFACE_ORDER.includes(surface)) {
    found.add(surface);
  }
}

function inspectKeyValue(found, key, value) {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = typeof value === 'string' ? value.toLowerCase() : '';

  if (
    normalizedKey === 'kind'
    && normalizedValue.startsWith('approval_')
  ) {
    recordSurface(found, 'approval-event-kind');
  }
  if (
    normalizedKey.includes('approvalevent')
    || normalizedKey.includes('nexteventkind')
  ) {
    recordSurface(found, 'approval-event-kind');
  }
  if (
    normalizedKey.includes('promoteclaim')
    || normalizedValue === 'claim-surface'
  ) {
    recordSurface(found, 'claim-promotion');
  }
  if (
    normalizedKey.includes('writeacceptedclaimedge')
    || normalizedKey.includes('claimedge')
    || normalizedValue === 'phase9.claim-edge.v1'
  ) {
    recordSurface(found, 'accepted-claim-edge');
  }
  if (normalizedKey.includes('confidencedelta')) {
    recordSurface(found, 'confidence-mutation');
  }
  if (
    normalizedKey.includes('law13provenance')
    || normalizedValue === 'law13-provenance'
  ) {
    recordSurface(found, 'law13-provenance');
  }
  if (
    normalizedKey.includes('exportclaim')
    || normalizedKey.includes('claimexport')
  ) {
    recordSurface(found, 'claim-export');
  }
  if (normalizedKey.includes('graphify')) {
    recordSurface(found, 'graphify');
  }
}

function inspectPayload(found, value) {
  if (Array.isArray(value)) {
    for (const item of value) inspectPayload(found, item);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    inspectKeyValue(found, key, child);
    inspectPayload(found, child);
  }
}

function blockedSurfacesFor(payload) {
  const found = new Set();
  inspectPayload(found, payload);
  return BLOCKED_SURFACE_ORDER.filter((surface) => found.has(surface));
}

function buildSanitizedRecord(input, blockedSurfaces) {
  const reviewId = nonBlankString(
    input.reviewId,
    'E_PHASE14_RELAY_GUARD_INPUT_REQUIRED',
    'reviewId'
  );
  const reviewer = nonBlankString(
    input.reviewer,
    'E_PHASE14_RELAY_GUARD_INPUT_REQUIRED',
    'reviewer'
  );
  const relayPayload = isObject(input.relayPayload) ? input.relayPayload : {};

  return {
    schemaVersion: RELAY_INJECTION_GUARD_SCHEMA_VERSION,
    phase: 14,
    layer: 'L4',
    task: 'TL4.4',
    kind: 'relay-injection-guard',
    eventKind: 'relay-review-metadata',
    reviewId,
    reviewer,
    relayEdge: edgeKind(input.relayEdge),
    runtimeMode: input.runtimeMode,
    autonomyTier: input.autonomyTier,
    runtimeOpened: false,
    autonomousRuntimeAllowed: false,
    unattendedRuntimeOpened: false,
    providerAutomationInvoked: false,
    obdkUsed: false,
    realDataRead: false,
    reviewedApiUsed: false,
    claimExportOpened: false,
    graphifyOpened: false,
    cliDispatchOpened: false,
    approvalMutationAllowed: false,
    claimSurfaceMutationAllowed: false,
    law13Provenance: false,
    scientificEvidence: false,
    confidenceDelta: 0,
    rawRelayPayloadStored: false,
    reviewText: {
      stored: false,
      redacted: true,
      length: asTextLength(relayPayload.text)
    },
    blockedSurfaces
  };
}

export async function guardRelayInjection(input = {}, deps = {}) {
  if (!isObject(input)) {
    fail(
      'E_PHASE14_RELAY_GUARD_INPUT_REQUIRED',
      'TL4.4 relay injection guard input must be an object.'
    );
  }
  assertRuntime(input);

  if (!edgeExists(input.relayEdge)) {
    return {
      ok: true,
      wrote: false,
      record: buildSanitizedRecord(
        { ...input, relayEdge: null },
        blockedSurfacesFor(input.relayPayload)
      )
    };
  }

  if (typeof deps.writeRelayArtifact !== 'function') {
    fail(
      'E_PHASE14_RELAY_GUARD_WRITER_REQUIRED',
      'TL4.4 relay injection guard requires an injected writer.'
    );
  }

  const record = buildSanitizedRecord(
    input,
    blockedSurfacesFor(input.relayPayload)
  );

  try {
    const write = await deps.writeRelayArtifact(record);
    return {
      ok: true,
      wrote: true,
      record,
      artifactPath: write?.artifactPath ?? null,
      artifactRelativePath: write?.artifactRelativePath ?? null
    };
  } catch (error) {
    fail(
      'E_PHASE14_RELAY_GUARD_WRITE_FAILED',
      'TL4.4 relay injection guard writer failed before a successful result.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}
