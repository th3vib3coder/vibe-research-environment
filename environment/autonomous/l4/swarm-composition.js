export const L4_SWARM_TURN_SCHEMA_VERSION = 'phase14.tl4.1-swarm-turn.v1';

const REQUIRED_AUTONOMY_TIER = 'L4';
const REQUIRED_RUNTIME_MODE = 'attended-batch';

export class Phase14L4SwarmCompositionError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Phase14L4SwarmCompositionError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new Phase14L4SwarmCompositionError(code, message, extra);
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

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertRuntime(input) {
  if (input.autonomyTier !== REQUIRED_AUTONOMY_TIER) {
    fail(
      'E_PHASE14_L4_SWARM_TIER_REQUIRED',
      'TL4.1 swarm composition requires autonomyTier L4.'
    );
  }
  if (input.runtimeMode === 'unattended-batch') {
    fail(
      'E_PHASE14_L4_SWARM_UNATTENDED_FORBIDDEN',
      'TL4.1 swarm composition forbids unattended-batch runtime.'
    );
  }
  if (input.runtimeMode !== REQUIRED_RUNTIME_MODE) {
    fail(
      'E_PHASE14_L4_SWARM_MODE_REQUIRED',
      'TL4.1 swarm composition requires attended-batch runtime mode.',
      { runtimeMode: input.runtimeMode ?? null }
    );
  }
}

function assertDeps(deps) {
  if (typeof deps.dispatchRelayTurn !== 'function') {
    fail(
      'E_PHASE14_L4_SWARM_RELAY_DISPATCH_REQUIRED',
      'TL4.1 swarm composition requires an injected relay dispatch function.'
    );
  }
  if (typeof deps.dispatchColdChild !== 'function') {
    fail(
      'E_PHASE14_L4_SWARM_COLD_CHILD_REQUIRED',
      'TL4.1 swarm composition requires an injected cold-child dispatch function.'
    );
  }
  if (typeof deps.writeSwarmArtifact !== 'function') {
    fail(
      'E_PHASE14_L4_SWARM_WRITER_REQUIRED',
      'TL4.1 swarm composition requires an injected artifact writer.'
    );
  }
}

function assertObjectiveRecord(objectiveRecord) {
  if (!isObject(objectiveRecord)) {
    fail(
      'E_PHASE14_L4_SWARM_OBJECTIVE_REQUIRED',
      'TL4.1 swarm composition requires a durable objective record.'
    );
  }
  nonBlankString(
    objectiveRecord.objectiveId,
    'E_PHASE14_L4_SWARM_OBJECTIVE_REQUIRED',
    'objectiveRecord.objectiveId'
  );
}

function assertRequest(value, code, label) {
  if (!isObject(value)) {
    fail(code, `${label} must be an object`);
  }
}

function buildBaseRecord(input, relayResult, coldChildResult) {
  return {
    schemaVersion: L4_SWARM_TURN_SCHEMA_VERSION,
    phase: 14,
    layer: 'L4',
    task: 'TL4.1',
    kind: 'swarm-relay-composition',
    turnId: input.turnId,
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
    directSpawnUsed: false,
    newRelayPrimitiveCreated: false,
    objectiveRecord: cloneJson(input.objectiveRecord),
    reviewerSet: Array.isArray(input.reviewerSet)
      ? input.reviewerSet.map((reviewer) => String(reviewer))
      : [],
    relayRequest: cloneJson(input.relayRequest),
    coldChildRequest: cloneJson(input.coldChildRequest),
    relayResult: cloneJson(relayResult),
    coldChildResult: cloneJson(coldChildResult),
    reconstruction: {
      source: 'persisted-swarm-turn',
      requiresParentChat: false,
      turnId: input.turnId
    }
  };
}

function buildHandoffPointer(input, record, swarmTurnWrite) {
  return {
    schemaVersion: 'phase14.tl4.1-swarm-handoff-pointer.v1',
    source: 'swarm-turn-artifact',
    turnId: input.turnId,
    objectiveId: input.objectiveRecord.objectiveId,
    swarmTurnPath: swarmTurnWrite?.artifactPath ?? null,
    swarmTurnRelativePath: swarmTurnWrite?.artifactRelativePath ?? null,
    runtimeOpened: false,
    replay: {
      schemaVersion: record.schemaVersion,
      source: record.reconstruction.source,
      requiresParentChat: false
    }
  };
}

export async function composeL4SwarmTurn(input = {}, deps = {}) {
  if (!isObject(input)) {
    fail(
      'E_PHASE14_L4_SWARM_INPUT_REQUIRED',
      'TL4.1 swarm composition input must be an object.'
    );
  }
  assertRuntime(input);
  assertDeps(deps);
  assertObjectiveRecord(input.objectiveRecord);
  const turnId = nonBlankString(
    input.turnId,
    'E_PHASE14_L4_SWARM_TURN_ID_REQUIRED',
    'turnId'
  );
  assertRequest(
    input.relayRequest,
    'E_PHASE14_L4_SWARM_RELAY_REQUEST_REQUIRED',
    'relayRequest'
  );
  assertRequest(
    input.coldChildRequest,
    'E_PHASE14_L4_SWARM_COLD_CHILD_REQUEST_REQUIRED',
    'coldChildRequest'
  );

  const relayResult = await deps.dispatchRelayTurn(cloneJson(input.relayRequest));
  const coldChildResult = await deps.dispatchColdChild(
    cloneJson(input.coldChildRequest)
  );
  const record = buildBaseRecord(
    { ...input, turnId },
    relayResult ?? {},
    coldChildResult ?? {}
  );
  const swarmTurnWrite = await deps.writeSwarmArtifact('swarm-turn', record);
  const handoffPointer = buildHandoffPointer(input, record, swarmTurnWrite);
  const handoffWrite = await deps.writeSwarmArtifact(
    'handoff-pointer',
    handoffPointer
  );

  return {
    ok: true,
    record,
    swarmTurnPath: swarmTurnWrite?.artifactPath ?? null,
    swarmTurnRelativePath: swarmTurnWrite?.artifactRelativePath ?? null,
    handoffPointer,
    handoffPointerPath: handoffWrite?.artifactPath ?? null,
    handoffPointerRelativePath: handoffWrite?.artifactRelativePath ?? null
  };
}

export function reconstructL4SwarmTurn(record) {
  if (!isObject(record)) {
    fail(
      'E_PHASE14_L4_SWARM_RECORD_REQUIRED',
      'TL4.1 swarm reconstruction requires a persisted record.'
    );
  }
  if (record.schemaVersion !== L4_SWARM_TURN_SCHEMA_VERSION) {
    fail(
      'E_PHASE14_L4_SWARM_RECORD_REQUIRED',
      'TL4.1 swarm reconstruction received an unknown schema version.'
    );
  }
  assertObjectiveRecord(record.objectiveRecord);
  if (record.runtimeOpened !== false || record.unattendedRuntimeOpened !== false) {
    fail(
      'E_PHASE14_L4_SWARM_RECORD_REQUIRED',
      'TL4.1 swarm record must preserve closed runtime flags.'
    );
  }

  return {
    ...cloneJson(record),
    source: 'persisted-swarm-turn'
  };
}
