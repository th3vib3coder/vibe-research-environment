export const WIKI_FIDELITY_REASON_CODES = Object.freeze({
  evidenceMissing: 'E_PHASE11_WIKI_FIDELITY_EVIDENCE_MISSING',
  evidenceMalformed: 'E_PHASE11_WIKI_FIDELITY_EVIDENCE_MALFORMED',
  registryDrift: 'E_PHASE11_WIKI_FIDELITY_REGISTRY_DRIFT',
  mirrorDrift: 'E_PHASE11_WIKI_FIDELITY_MIRROR_DRIFT',
  coverageCheckNotGreen: 'E_PHASE11_WIKI_FIDELITY_COVERAGE_CHECK_NOT_GREEN',
  coverageGeneratedAtStale:
    'E_PHASE11_WIKI_FIDELITY_COVERAGE_GENERATED_AT_STALE',
  coverageCountMismatch: 'E_PHASE11_WIKI_FIDELITY_COVERAGE_COUNT_MISMATCH',
  coverageScratchLeak: 'E_PHASE11_WIKI_FIDELITY_COVERAGE_SCRATCH_LEAK',
  toolRootAmbiguous: 'E_PHASE11_WIKI_FIDELITY_TOOL_ROOT_AMBIGUOUS'
});

const VRE_PREFIX = 'vibe-research-environment/';

function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/\/+/gu, '/');
}

function parseJsonEvidence(value, label) {
  if (value == null) {
    return {
      ok: false,
      status: 'missing',
      reason: WIKI_FIDELITY_REASON_CODES.evidenceMissing,
      label
    };
  }
  if (typeof value === 'string') {
    try {
      return { ok: true, value: JSON.parse(value) };
    } catch (error) {
      return {
        ok: false,
        status: 'fail',
        reason: WIKI_FIDELITY_REASON_CODES.evidenceMalformed,
        label,
        detail: error.message
      };
    }
  }
  if (typeof value === 'object') {
    return { ok: true, value };
  }
  return {
    ok: false,
    status: 'fail',
    reason: WIKI_FIDELITY_REASON_CODES.evidenceMalformed,
    label
  };
}

function parseJsonlEvidence(value) {
  if (value == null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parsePageCount(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }
  const match = markdown.match(/Current generated count:\s*(?:\*\*)?(\d+)/u);
  return match == null ? null : Number(match[1]);
}

function parseFrontmatterDate(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }
  const match = markdown.match(/^last-verified-at:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/mu);
  return match?.[1] ?? null;
}

function statusCheck(status, reasons, extra = {}) {
  return { ...extra, status, reasons: [...new Set(reasons)] };
}

function buildRegistryCheck(evidence) {
  const parsed = parseJsonEvidence(evidence.buildRegistriesCheck, 'buildRegistriesCheck');
  if (!parsed.ok) {
    return statusCheck(parsed.status, [parsed.reason], { detail: parsed.detail });
  }

  const changed = Array.isArray(parsed.value.changed) ? parsed.value.changed : [];
  if (parsed.value.ok !== true || changed.length > 0) {
    return statusCheck('fail', [WIKI_FIDELITY_REASON_CODES.registryDrift], {
      changed
    });
  }
  return statusCheck('pass', []);
}

function buildMirrorCheck(evidence) {
  const parsed = parseJsonEvidence(evidence.syncMirrorCheck, 'syncMirrorCheck');
  if (!parsed.ok) {
    return statusCheck(parsed.status, [parsed.reason], { detail: parsed.detail });
  }

  const summary = parsed.value.summary ?? {};
  const changed = Number(summary.changed ?? 0);
  const listsChanged = ['added', 'modified', 'removed']
    .some((key) => Array.isArray(parsed.value[key]) && parsed.value[key].length > 0);
  if (parsed.value.ok !== true || changed > 0 || listsChanged) {
    return statusCheck('fail', [WIKI_FIDELITY_REASON_CODES.mirrorDrift], {
      summary
    });
  }
  return statusCheck('pass', []);
}

function compareIsoDates(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return 0;
  }
  return left.localeCompare(right);
}

function buildCoverageCheck(evidence) {
  const reasons = [];
  const coverageCheck = parseJsonEvidence(evidence.coverageCheck, 'coverageCheck');
  const coverageSummary = parseJsonEvidence(evidence.coverageSummary, 'coverageSummary');
  const ownershipSummary = parseJsonEvidence(
    evidence.ownershipResolutionSummary,
    'ownershipResolutionSummary'
  );

  for (const parsed of [coverageCheck, coverageSummary, ownershipSummary]) {
    if (!parsed.ok) {
      reasons.push(parsed.reason);
    }
  }

  if (coverageCheck.ok && coverageCheck.value.ok !== true) {
    reasons.push(WIKI_FIDELITY_REASON_CODES.coverageCheckNotGreen);
  }

  const pageCount = parsePageCount(evidence.liveSourceGapsMarkdown);
  if (pageCount == null) {
    reasons.push(WIKI_FIDELITY_REASON_CODES.evidenceMalformed);
  }

  if (coverageSummary.ok && ownershipSummary.ok && pageCount != null) {
    const counts = [
      Number(coverageSummary.value.liveSourceWithoutOwner),
      Number(ownershipSummary.value.unownedLiveSource),
      pageCount
    ];
    if (counts.some((count) => !Number.isFinite(count)) || new Set(counts).size > 1) {
      reasons.push(WIKI_FIDELITY_REASON_CODES.coverageCountMismatch);
    }
  }

  if (coverageSummary.ok && ownershipSummary.ok) {
    const coverageGeneratedAt = coverageSummary.value.generatedAt;
    const ownershipGeneratedAt = ownershipSummary.value.generatedAt;
    if (compareIsoDates(coverageGeneratedAt, ownershipGeneratedAt) < 0) {
      reasons.push(WIKI_FIDELITY_REASON_CODES.coverageGeneratedAtStale);
    }
  }

  if (evidence.toolRoots?.toolRoot == null || evidence.toolRoots?.wikiRoot == null) {
    reasons.push(WIKI_FIDELITY_REASON_CODES.toolRootAmbiguous);
  }

  return statusCheck(reasons.length > 0 ? 'fail' : 'pass', reasons, {
    generatedAt: coverageSummary.ok ? coverageSummary.value.generatedAt : undefined,
    ownershipGeneratedAt: ownershipSummary.ok
      ? ownershipSummary.value.generatedAt
      : undefined,
    pageLastVerifiedAt: parseFrontmatterDate(evidence.liveSourceGapsMarkdown),
    pageCurrentGeneratedCount: pageCount
  });
}

export function normalizeWikiCoveragePath(pathValue) {
  const normalized = normalizePath(pathValue);
  if (normalized.startsWith(VRE_PREFIX)) {
    return {
      repo: 'vibe-research-environment',
      path: normalized.slice(VRE_PREFIX.length)
    };
  }
  if (normalized.startsWith('vibe-science/')) {
    return { repo: 'vibe-science', path: normalized };
  }
  return { repo: 'unknown', path: normalized };
}

function isVreScratchPath(pathValue) {
  return pathValue.startsWith('.tmp-vre-')
    || pathValue === '.tmp'
    || pathValue.startsWith('.tmp/')
    || pathValue === 'analysis'
    || pathValue.startsWith('analysis/')
    || pathValue === 'audit.config.yaml'
    || pathValue === 'audit'
    || pathValue.startsWith('audit/')
    || pathValue === 'vibe-science'
    || pathValue.startsWith('vibe-science/');
}

function collectCoverageEntries(evidence) {
  let records;
  try {
    records = parseJsonlEvidence(evidence.fileInventoryJsonl);
  } catch {
    return {
      entries: [],
      failed: true
    };
  }

  const entries = [];
  for (const record of records) {
    const normalized = normalizeWikiCoveragePath(record?.path ?? record);
    if (
      normalized.repo === 'vibe-research-environment'
      && isVreScratchPath(normalized.path)
    ) {
      entries.push(normalized.path);
    }
  }

  return {
    entries: [...new Set(entries)].sort((a, b) => a.localeCompare(b)),
    failed: false
  };
}

export function buildWikiFidelityObservedState(evidence = {}) {
  const checks = {
    'wiki-generated-registries': buildRegistryCheck(evidence),
    'wiki-mirror': buildMirrorCheck(evidence),
    'wiki-coverage-inventories': buildCoverageCheck(evidence)
  };
  const coverage = collectCoverageEntries(evidence);

  if (coverage.failed) {
    checks['wiki-coverage-inventories'] = statusCheck('fail', [
      ...checks['wiki-coverage-inventories'].reasons,
      WIKI_FIDELITY_REASON_CODES.evidenceMalformed
    ]);
  } else if (coverage.entries.length > 0) {
    checks['wiki-coverage-inventories'] = statusCheck('fail', [
      ...checks['wiki-coverage-inventories'].reasons,
      WIKI_FIDELITY_REASON_CODES.coverageScratchLeak
    ], {
      ...checks['wiki-coverage-inventories'],
      status: 'fail'
    });
  }

  return {
    checks,
    coverageEntries: coverage.entries,
    wikiFidelity: {
      schemaVersion: 'phase11.wiki-fidelity-observed-state.v1',
      toolRoots: evidence.toolRoots ?? {},
      readOnly: true
    }
  };
}
