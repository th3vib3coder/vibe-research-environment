import { readDirectionProjection } from './store.js';

export class DirectionCheckError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'DirectionCheckError';
    this.code = code;
    this.extra = extra;
  }
}

function failDirectionCheck(code, message, extra = {}) {
  throw new DirectionCheckError({ code, message, extra });
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeComparable(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function normalizeCondition(condition) {
  if (!condition || typeof condition !== 'object') {
    return null;
  }

  const kind = normalizeText(condition.kind);
  const detail = normalizeText(condition.detail);
  if (!kind || !detail) {
    return null;
  }

  return { kind, detail };
}

function normalizeTarget(options) {
  const directionId = normalizeText(options?.directionId);
  const summary = normalizeText(options?.summary);
  if (!directionId && !summary) {
    failDirectionCheck(
      'E_DIRECTION_CHECK_TARGET_REQUIRED',
      'direction check requires a directionId or summary',
    );
  }

  return { directionId, summary };
}

function matchesTarget(record, target) {
  if (target.directionId && record.directionId === target.directionId) {
    return true;
  }

  return Boolean(
    target.summary &&
      normalizeComparable(record.summary) === normalizeComparable(target.summary),
  );
}

function conditionSatisfied(requiredCondition, satisfies) {
  const required = normalizeCondition(requiredCondition);
  const supplied = normalizeCondition(satisfies);
  if (!required || !supplied) {
    return false;
  }

  return (
    normalizeComparable(required.kind) === normalizeComparable(supplied.kind) &&
    normalizeComparable(required.detail) === normalizeComparable(supplied.detail)
  );
}

function buildAllowResult(target) {
  return {
    ok: true,
    verdict: 'allow',
    directionId: target.directionId || undefined,
    summary: target.summary || undefined,
    written: false,
  };
}

function buildBlockedResult({ target, record, satisfies }) {
  const doNotRepeatUnless = normalizeCondition(record.doNotRepeatUnless);
  const allowedByCondition = conditionSatisfied(doNotRepeatUnless, satisfies);

  return {
    ok: true,
    verdict: allowedByCondition ? 'allow-with-condition' : 'block',
    directionId: target.directionId || undefined,
    summary: target.summary || undefined,
    blockingDirectionId: record.directionId,
    blockingSummary: record.summary,
    blockingState: record.state,
    doNotRepeatUnless,
    evidenceRefs: Array.isArray(record.evidenceRefs) ? [...record.evidenceRefs] : [],
    written: false,
  };
}

export async function checkDirection(projectRoot, options = {}) {
  const target = normalizeTarget(options);
  const projection = await readDirectionProjection(projectRoot);
  const blockingRecord = Object.values(projection)
    .filter((record) => ['killed', 'contradicted'].includes(record.state))
    .find((record) => matchesTarget(record, target));

  if (!blockingRecord) {
    return buildAllowResult(target);
  }

  return buildBlockedResult({
    target,
    record: blockingRecord,
    satisfies: options.satisfies,
  });
}
