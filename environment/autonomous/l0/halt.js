import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteJson,
  now,
  resolveInside,
  resolveProjectRoot
} from '../../control/_io.js';

export const L0_HALT_REQUEST_SCHEMA_VERSION = 'phase13.l0-halt-request.v1';
export const L0_HALT_REQUEST_RELATIVE_PATH = '.vibe-science-environment/autonomous/l0/halt-request.json';
export const L0_HALT_INTERRUPT_SEMANTICS = 'checked-before-next-l0-iteration';
export const L0_HALT_ALLOWED_OPERATORS = Object.freeze(['Carmine', 'Elisa']);

const ALLOWED_OPERATORS = new Set(L0_HALT_ALLOWED_OPERATORS);
const DEFAULT_INTERRUPT_TARGET = 'l0-attended-loop';

export class Phase13L0HaltError extends Error {
  constructor(code, message, { exitCode = 3, extra = {} } = {}) {
    super(message);
    this.name = 'Phase13L0HaltError';
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function toRepoRelative(projectRoot, targetPath) {
  return normalizeSlashes(path.relative(projectRoot, targetPath));
}

function nonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Phase13L0HaltError(
      `E_L0_HALT_${fieldName.toUpperCase()}_REQUIRED`,
      `autonomous halt requires a non-empty ${fieldName}.`
    );
  }
  return value.trim();
}

function assertAllowedOperator(requestedBy) {
  if (!ALLOWED_OPERATORS.has(requestedBy)) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_OPERATOR_INVALID',
      'autonomous halt must be requested by Carmine or Elisa.',
      {
        extra: {
          requestedBy,
          allowedOperators: L0_HALT_ALLOWED_OPERATORS
        }
      }
    );
  }
}

export function l0HaltRequestPath(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    ...L0_HALT_REQUEST_RELATIVE_PATH.split('/')
  );
}

export function buildL0HaltRequest({
  operator,
  reason,
  requestedAt = now()
} = {}) {
  const requestedBy = nonEmptyString(operator, 'operator');
  const haltReason = nonEmptyString(reason, 'reason');
  assertAllowedOperator(requestedBy);

  if (typeof requestedAt !== 'string' || Number.isNaN(Date.parse(requestedAt))) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_REQUESTED_AT_INVALID',
      'autonomous halt requires an ISO timestamp.'
    );
  }

  return {
    schemaVersion: L0_HALT_REQUEST_SCHEMA_VERSION,
    evidenceClass: 'reviewed-runtime-evidence',
    requestedBy,
    requestedAt,
    reason: haltReason,
    interruptTarget: DEFAULT_INTERRUPT_TARGET,
    interruptSemantics: L0_HALT_INTERRUPT_SEMANTICS,
    interruptsWithinOneIteration: true,
    resumeRequiresOperatorGo: true,
    actualProcessKill: false,
    runtimeOpened: false,
    l0RuntimeAllowed: false
  };
}

export function validateL0HaltRequest(request) {
  if (request?.schemaVersion !== L0_HALT_REQUEST_SCHEMA_VERSION) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_SCHEMA_VERSION',
      'L0 halt request schemaVersion is invalid.'
    );
  }
  if (request.evidenceClass !== 'reviewed-runtime-evidence') {
    throw new Phase13L0HaltError(
      'E_L0_HALT_EVIDENCE_CLASS_INVALID',
      'L0 halt request must be reviewed runtime evidence.'
    );
  }
  assertAllowedOperator(request.requestedBy);
  nonEmptyString(request.reason, 'reason');
  if (request.interruptSemantics !== L0_HALT_INTERRUPT_SEMANTICS) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_INTERRUPT_SEMANTICS_INVALID',
      'L0 halt request must use checked-before-next-l0-iteration semantics.'
    );
  }
  if (request.interruptsWithinOneIteration !== true) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_INTERRUPT_NOT_PROVEN',
      'L0 halt request must interrupt before the next iteration.'
    );
  }
  if (request.resumeRequiresOperatorGo !== true) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_RESUME_GATE_MISSING',
      'L0 halt request must require operator GO before resume.'
    );
  }
  if (request.actualProcessKill !== false) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_PROCESS_KILL_OVERCLAIM',
      'L0 halt request must not claim process-kill semantics.'
    );
  }
  if (request.runtimeOpened !== false || request.l0RuntimeAllowed !== false) {
    throw new Phase13L0HaltError(
      'E_L0_HALT_RUNTIME_OPENED',
      'L0 halt request must not open runtime.'
    );
  }
  return request;
}

export async function writeL0HaltRequest(projectPath, request, deps = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const haltRequest = validateL0HaltRequest(request);
  const targetPath = l0HaltRequestPath(projectRoot);
  await (deps.atomicWriteJson ?? atomicWriteJson)(targetPath, haltRequest);
  return {
    haltRequest,
    haltRequestPath: targetPath,
    haltRequestRelativePath: toRepoRelative(projectRoot, targetPath)
  };
}

export async function readL0HaltRequest(projectPath, deps = {}) {
  const targetPath = l0HaltRequestPath(projectPath);
  const readFileImpl = deps.readFile ?? readFile;
  try {
    return validateL0HaltRequest(JSON.parse(await readFileImpl(targetPath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function l0HaltRequestToReadinessGuardEvidence(haltRequest) {
  const request = validateL0HaltRequest(haltRequest);
  return {
    halt: {
      evidenceClass: request.evidenceClass,
      requestedBy: request.requestedBy,
      reason: request.reason,
      interruptSemantics: request.interruptSemantics,
      interruptsWithinOneIteration: request.interruptsWithinOneIteration,
      resumeRequiresOperatorGo: request.resumeRequiresOperatorGo,
      actualProcessKill: request.actualProcessKill
    },
    operators: [
      { name: 'Carmine', role: 'operator' },
      { name: 'Elisa', role: 'medical-operator' }
    ]
  };
}

export async function assertL0NotHaltedBeforeIteration(projectPath, deps = {}) {
  const haltRequest = await readL0HaltRequest(projectPath, deps);
  if (!haltRequest) {
    return {
      ok: true,
      runtimeOpened: false,
      l0RuntimeAllowed: false,
      haltRequested: false
    };
  }

  throw new Phase13L0HaltError(
    'E_L0_OPERATOR_HALT_REQUESTED',
    'L0 halt requested by operator before the next iteration.',
    {
      exitCode: 2,
      extra: {
        requestedBy: haltRequest.requestedBy,
        requestedAt: haltRequest.requestedAt,
        interruptSemantics: haltRequest.interruptSemantics,
        resumeRequiresOperatorGo: haltRequest.resumeRequiresOperatorGo,
        actualProcessKill: haltRequest.actualProcessKill,
        runtimeOpened: false,
        l0RuntimeAllowed: false
      }
    }
  );
}

export async function writeL0HaltRequestFromOptions(projectPath, options = {}, deps = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const haltRequest = buildL0HaltRequest({
    operator: options.operator,
    reason: options.reason,
    requestedAt: options.now ?? now()
  });
  const written = await writeL0HaltRequest(projectRoot, haltRequest, deps);
  return {
    ok: true,
    command: 'autonomous halt',
    phase13: true,
    haltRequested: true,
    requestedBy: haltRequest.requestedBy,
    requestedAt: haltRequest.requestedAt,
    evidenceClass: haltRequest.evidenceClass,
    interruptSemantics: haltRequest.interruptSemantics,
    interruptsWithinOneIteration: haltRequest.interruptsWithinOneIteration,
    resumeRequiresOperatorGo: haltRequest.resumeRequiresOperatorGo,
    actualProcessKill: haltRequest.actualProcessKill,
    haltRequestPath: written.haltRequestRelativePath,
    runtimeOpened: false,
    l0RuntimeAllowed: false
  };
}
