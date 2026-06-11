import {
  acceptedR2AuditPresent,
  fullContradictionEnumerationPresent
} from './query-decision-use.js';

export const QUERY_LINT_CHECKS = Object.freeze([
  'query-output-metadata-warning-required',
  'query-output-status-banner-required',
  'contradiction-audit-full-enumeration-required',
  'stale-query-manifest-caveat-required',
  'query-promotion-reresolution-required',
  'stale-refuted-evidence-marker-required'
]);

const METADATA_WARNING = 'query-output-is-metadata-not-law13-provenance';
const ACCEPTED_STALE_MARKERS = new Set([
  'accepted-stale',
  'accepted-superseded',
  'accepted-retracted',
  'accepted-refuted',
  'stale',
  'superseded',
  'retracted',
  'refuted'
]);
const STALE_OR_REFUTED_LIFECYCLES = new Set([
  'stale',
  'superseded',
  'retracted'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function queryIdForOutput(output) {
  return output?.queryId ?? output?.id;
}

function outputByQueryId(outputs) {
  const byId = new Map();
  for (const output of asArray(outputs)) {
    const queryId = queryIdForOutput(output);
    if (typeof queryId === 'string') byId.set(queryId, output);
  }
  return byId;
}

function evidenceByRefId(evidenceRefs) {
  const byId = new Map();
  for (const evidence of asArray(evidenceRefs)) {
    for (const id of [evidence?.refId, evidence?.pageId, evidence?.id]) {
      if (typeof id === 'string') byId.set(id, evidence);
    }
  }
  return byId;
}

function markdownFor(output) {
  return output?.markdown ?? output?.content ?? '';
}

function hasMetadataWarning(record, output) {
  return record?.outputBanner?.provenanceWarning === METADATA_WARNING
    && markdownFor(output).includes(METADATA_WARNING);
}

function hasStatusBanner(record, output) {
  if (record?.status === 'complete') return true;
  const markdown = normalizeText(markdownFor(output));
  return markdown.includes(record?.status)
    && markdown.includes('not-for-decision');
}

function isManifestStale(manifest, now) {
  if (manifest?.stale === true) return true;
  if (typeof manifest?.expiresAt !== 'string') return false;
  const expiresAt = Date.parse(manifest.expiresAt);
  const nowMs = Date.parse(now);
  return Number.isFinite(expiresAt)
    && Number.isFinite(nowMs)
    && expiresAt <= nowMs;
}

function hasFreshnessCaveat(manifest, outputs) {
  if (manifest?.freshnessCaveatVisible === true) return true;
  const override = normalizeText(manifest?.freshnessOverrideReason);
  if (override.length === 0) return false;
  return asArray(outputs).some((output) => {
    const markdown = normalizeText(markdownFor(output));
    return markdown.includes('stale')
      && markdown.includes('override');
  });
}

function refutedByQualityGate(evidence) {
  const refutedCheck = evidence?.qualityGates?.refutedCheck;
  return refutedCheck === 'failed' || refutedCheck === false;
}

function evidenceNeedsMarker(evidence) {
  return STALE_OR_REFUTED_LIFECYCLES.has(evidence?.lifecycleStatus)
    || refutedByQualityGate(evidence);
}

function hasAcceptedMarker(evidence) {
  return ACCEPTED_STALE_MARKERS.has(evidence?.acceptedMarker)
    || ACCEPTED_STALE_MARKERS.has(evidence?.marker)
    || ACCEPTED_STALE_MARKERS.has(evidence?.edgeMarker);
}

export function lintPhase10QueryArtifacts(input = {}) {
  const issues = [];
  const outputs = asArray(input.queryOutputs);
  const outputsByQueryId = outputByQueryId(outputs);
  const evidenceById = evidenceByRefId(input.evidenceRefs);

  function issue(code, check, message, extra = {}) {
    issues.push({ code, check, message, ...extra });
  }

  for (const record of asArray(input.queryRecords)) {
    const output = outputsByQueryId.get(record?.queryId);
    if (!hasMetadataWarning(record, output)) {
      issue(
        'E_PHASE10_QUERY_OUTPUT_WARNING_REQUIRED',
        'query-output-metadata-warning-required',
        'Query output must visibly state that it is metadata, not LAW 13 provenance.',
        { queryId: record?.queryId }
      );
    }

    if (!hasStatusBanner(record, output)) {
      issue(
        'E_PHASE10_QUERY_STATUS_BANNER_REQUIRED',
        'query-output-status-banner-required',
        'Incomplete or failed query output must include a loud visible status banner.',
        { queryId: record?.queryId, status: record?.status }
      );
    }

    if (
      record?.queryClass === 'contradiction-audit'
      && record?.decisionUse?.classification === 'audit-grade'
      && !fullContradictionEnumerationPresent(record?.qualityGates)
    ) {
      issue(
        'E_PHASE10_CONTRADICTION_ENUMERATION_REQUIRED',
        'contradiction-audit-full-enumeration-required',
        'Audit-grade contradiction query outputs require full contradiction enumeration.',
        { queryId: record?.queryId }
      );
    }

    for (const ref of asArray(record?.resultRefs)) {
      const evidence = evidenceById.get(ref);
      if (evidence && evidenceNeedsMarker(evidence) && !hasAcceptedMarker(evidence)) {
        issue(
          'E_PHASE10_QUERY_STALE_REFUTED_EVIDENCE_MARKER_REQUIRED',
          'stale-refuted-evidence-marker-required',
          'Query result refs to stale, superseded, retracted, or refuted evidence require an accepted marker.',
          { queryId: record?.queryId, refId: ref }
        );
      }
    }
  }

  for (const manifest of asArray(input.manifests)) {
    if (!isManifestStale(manifest, input.now)) continue;
    if (
      typeof manifest.freshnessOverrideReason !== 'string'
      || manifest.freshnessOverrideReason.trim().length === 0
      || !hasFreshnessCaveat(manifest, outputs)
    ) {
      issue(
        'E_PHASE10_QUERY_MANIFEST_FRESHNESS_CAVEAT_REQUIRED',
        'stale-query-manifest-caveat-required',
        'Stale query manifests require an override and visible freshness caveat.',
        { domainId: manifest?.domainId }
      );
    }
  }

  for (const promotion of asArray(input.promotions)) {
    if (
      promotion?.reResolvedOriginalSources !== true
      || !acceptedR2AuditPresent(promotion?.r2Audit)
    ) {
      issue(
        'E_PHASE10_QUERY_PROMOTION_RERESOLUTION_REQUIRED',
        'query-promotion-reresolution-required',
        'Query promotion metadata requires original-source re-resolution and accepted R2.',
        { promotionId: promotion?.promotionId, queryId: promotion?.queryId }
      );
    }
  }

  return { ok: issues.length === 0, issues };
}
