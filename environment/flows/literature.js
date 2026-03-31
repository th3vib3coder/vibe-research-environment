import {
  readFlowIndex,
  readFlowState,
  writeFlowIndex,
  writeFlowState,
} from '../lib/flow-state.js';

const FLOW_NAME = 'literature';
const CLAIM_ID_PATTERN = /^C-[0-9]{3}$/u;
const PAPER_ID_PATTERN = /^LIT-[0-9]{3}$/u;

const COMMAND_NAMES = {
  list: '/flow-literature',
  register: '/flow-literature --register',
  gaps: '/flow-literature --gaps',
  link: '/flow-literature --link',
};

export class LiteratureFlowError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class DuplicatePaperError extends LiteratureFlowError {}

export class PaperNotFoundError extends LiteratureFlowError {}

export class InvalidClaimLinkError extends LiteratureFlowError {}

export async function registerPaper(projectPath, paperData) {
  const [state, index] = await Promise.all([
    readFlowState(projectPath, FLOW_NAME),
    readFlowIndex(projectPath),
  ]);
  const timestamp = resolveTimestamp();
  const paper = normalizePaperInput(paperData, state.papers, timestamp);

  assertNoDuplicatePaper(state.papers, paper);

  const nextState = {
    ...state,
    papers: [...state.papers, paper],
    updatedAt: timestamp,
  };
  const derived = deriveLiteratureView(nextState);
  nextState.gaps = derived.gaps;

  await writeFlowState(projectPath, FLOW_NAME, nextState);

  const nextIndex = buildFlowIndex(index, {
    commandName: COMMAND_NAMES.register,
    derived,
    timestamp,
  });
  await writeFlowIndex(projectPath, nextIndex);

  return {
    paper,
    state: nextState,
    index: nextIndex,
    warnings: [],
  };
}

export async function listPapers(projectPath, filters = {}) {
  const [state, index] = await Promise.all([
    readFlowState(projectPath, FLOW_NAME),
    readFlowIndex(projectPath),
  ]);
  const timestamp = resolveTimestamp(filters.updatedAt);
  const derived = deriveLiteratureView(state);
  const papers = applyPaperFilters(state.papers, filters);

  const nextIndex = buildFlowIndex(index, {
    commandName: COMMAND_NAMES.list,
    derived,
    timestamp,
  });
  await writeFlowIndex(projectPath, nextIndex);

  return {
    papers,
    state,
    index: nextIndex,
    warnings: [],
  };
}

export async function surfaceGaps(projectPath, options = {}) {
  const [state, index] = await Promise.all([
    readFlowState(projectPath, FLOW_NAME),
    readFlowIndex(projectPath),
  ]);
  const timestamp = resolveTimestamp(options.now);
  const derived = deriveLiteratureView(state, {
    claimHeads: options.claimHeads,
    literatureSearches: options.literatureSearches,
    includeProjectionWarnings: true,
  });

  const nextState = {
    ...state,
    gaps: derived.gaps,
    updatedAt: timestamp,
  };

  await writeFlowState(projectPath, FLOW_NAME, nextState);

  const nextIndex = buildFlowIndex(index, {
    commandName: COMMAND_NAMES.gaps,
    derived,
    timestamp,
  });
  await writeFlowIndex(projectPath, nextIndex);

  return {
    gaps: derived.gaps,
    warnings: derived.warnings,
    state: nextState,
    index: nextIndex,
  };
}

export async function linkPaperToClaim(projectPath, paperId, claimId, options = {}) {
  const paperReference = normalizePaperReference(paperId);
  const normalizedClaimId = normalizeClaimId(claimId, 'claimId');
  const [state, index] = await Promise.all([
    readFlowState(projectPath, FLOW_NAME),
    readFlowIndex(projectPath),
  ]);
  const timestamp = resolveTimestamp(options.now);
  const paperIndex = findPaperIndex(state.papers, paperReference);

  if (paperIndex === -1) {
    throw new PaperNotFoundError(`Paper ${paperReference} does not exist.`);
  }

  const existingPaper = state.papers[paperIndex];
  const linkedClaims = uniqueStrings([...existingPaper.linkedClaims, normalizedClaimId]);
  const updatedPaper = {
    ...existingPaper,
    linkedClaims,
  };
  const nextPapers = [...state.papers];
  nextPapers[paperIndex] = updatedPaper;

  const linkWarnings = deriveClaimLinkWarnings(normalizedClaimId, options.claimHeads);
  const derived = deriveLiteratureView(
    {
      ...state,
      papers: nextPapers,
      updatedAt: timestamp,
    },
    {
      claimHeads: options.claimHeads,
      literatureSearches: options.literatureSearches,
      includeProjectionWarnings: true,
    },
  );

  const nextState = {
    ...state,
    papers: nextPapers,
    gaps: derived.gaps,
    updatedAt: timestamp,
  };

  await writeFlowState(projectPath, FLOW_NAME, nextState);

  const nextIndex = buildFlowIndex(index, {
    commandName: COMMAND_NAMES.link,
    derived,
    timestamp,
  });
  await writeFlowIndex(projectPath, nextIndex);

  return {
    paper: updatedPaper,
    warnings: uniqueStrings([...linkWarnings, ...derived.warnings]),
    state: nextState,
    index: nextIndex,
  };
}

function normalizePaperInput(paperData, existingPapers, timestamp) {
  if (paperData == null || typeof paperData !== 'object' || Array.isArray(paperData)) {
    throw new LiteratureFlowError('paperData must be an object.');
  }

  const paperId = paperData.id == null || paperData.id === ''
    ? generatePaperId(existingPapers)
    : normalizePaperId(paperData.id);
  const title = normalizeRequiredString(paperData.title, 'title');

  return {
    id: paperId,
    doi: normalizeOptionalString(paperData.doi),
    title,
    authors: normalizeStringArray(paperData.authors, 'authors'),
    year: normalizeYear(paperData.year),
    relevance: normalizeOptionalString(paperData.relevance),
    linkedClaims: normalizeClaimIds(paperData.linkedClaims),
    methodologyConflicts: normalizeStringArray(
      paperData.methodologyConflicts,
      'methodologyConflicts',
    ),
    registeredAt: resolveTimestamp(paperData.registeredAt ?? timestamp),
  };
}

function applyPaperFilters(papers, filters) {
  return papers.filter((paper) => {
    if (filters.paperId && paper.id !== normalizePaperId(filters.paperId)) {
      return false;
    }

    if (filters.claimId && !paper.linkedClaims.includes(normalizeClaimId(filters.claimId, 'claimId'))) {
      return false;
    }

    if (filters.doi && normalizeDoi(paper.doi) !== normalizeDoi(filters.doi)) {
      return false;
    }

    if (filters.year != null && paper.year !== normalizeYear(filters.year)) {
      return false;
    }

    if (filters.search) {
      const searchNeedle = String(filters.search).trim().toLowerCase();
      if (searchNeedle === '') {
        return true;
      }

      const haystacks = [
        paper.id,
        paper.title,
        paper.doi ?? '',
        paper.relevance ?? '',
        ...paper.authors,
        ...paper.linkedClaims,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystacks.includes(searchNeedle)) {
        return false;
      }
    }

    return true;
  });
}

function deriveLiteratureView(state, options = {}) {
  const papers = Array.isArray(state.papers) ? state.papers : [];
  const gaps = [];
  const warnings = [];

  if (papers.length === 0) {
    gaps.push({
      kind: 'no-papers',
      message: 'No papers registered yet.',
      claimId: null,
    });
  }

  for (const paper of papers) {
    if (paper.linkedClaims.length === 0) {
      gaps.push({
        kind: 'unlinked-paper',
        message: `${paper.id} is not linked to any claim.`,
        claimId: null,
      });
    }

    for (const conflict of paper.methodologyConflicts) {
      gaps.push({
        kind: 'methodology-conflict',
        message: `${paper.id}: ${conflict}`,
        claimId: null,
      });
    }
  }

  const claimIds = normalizeClaimHeadInputs(options.claimHeads);
  if (claimIds == null) {
    if (options.includeProjectionWarnings) {
      warnings.push(
        'Claim heads unavailable; claim coverage gaps were not evaluated.',
      );
    }
  } else {
    for (const claimId of claimIds) {
      const hasCoverage = papers.some((paper) => paper.linkedClaims.includes(claimId));
      if (!hasCoverage) {
        gaps.push({
          kind: 'missing-claim-coverage',
          message: `No literature linked to claim ${claimId}.`,
          claimId,
        });
      }
    }
  }

  const searchGaps = deriveSearchGaps(options.literatureSearches, options.includeProjectionWarnings);
  gaps.push(...searchGaps.gaps);
  warnings.push(...searchGaps.warnings);

  const dedupedGaps = dedupeGapRecords(gaps);
  const blockers = dedupedGaps.map((gap) => gap.message).slice(0, 5);
  const nextActions = deriveNextActions(dedupedGaps, papers);
  const currentStage = dedupedGaps.length > 0 ? 'literature-gap-analysis' : 'literature-review';

  return {
    gaps: dedupedGaps,
    warnings: uniqueStrings(warnings),
    blockers,
    nextActions,
    currentStage,
  };
}

function deriveSearchGaps(literatureSearches, includeProjectionWarnings) {
  if (literatureSearches == null) {
    return {
      gaps: [],
      warnings: includeProjectionWarnings
        ? ['Literature search projections unavailable; search coverage gaps were not evaluated.']
        : [],
    };
  }

  if (!Array.isArray(literatureSearches)) {
    throw new LiteratureFlowError('literatureSearches must be an array when provided.');
  }

  const gaps = [];
  for (const entry of literatureSearches) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const resultCount = getSearchResultCount(entry);
    const status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : null;
    const noResults = status === 'no-results' || status === 'no_results' || resultCount === 0;

    if (!noResults) {
      continue;
    }

    const claimId = entry.claimId == null ? null : normalizeClaimId(entry.claimId, 'claimId');
    const query = normalizeOptionalString(entry.query);
    const message = claimId
      ? `Search ${query ? `"${query}" ` : ''}found no literature for claim ${claimId}.`
      : `Search ${query ? `"${query}" ` : ''}found no literature.`;

    gaps.push({
      kind: 'empty-search',
      message,
      claimId,
    });
  }

  return {
    gaps,
    warnings: [],
  };
}

function deriveNextActions(gaps, papers) {
  const actions = [];

  for (const gap of gaps) {
    switch (gap.kind) {
      case 'no-papers':
        actions.push('register at least one paper for the current research thread');
        break;
      case 'unlinked-paper': {
        const paperId = gap.message.split(' ')[0];
        actions.push(`link ${paperId} to a relevant claim`);
        break;
      }
      case 'missing-claim-coverage':
        if (gap.claimId) {
          actions.push(`search for literature covering claim ${gap.claimId}`);
        }
        break;
      case 'empty-search':
        actions.push(gap.claimId
          ? `rerun the literature search for claim ${gap.claimId} with broader terms`
          : 'rerun the last literature search with broader terms');
        break;
      case 'methodology-conflict': {
        const paperId = gap.message.split(':')[0];
        actions.push(`review the methodology conflict noted in ${paperId}`);
        break;
      }
      default:
        actions.push(gap.message);
        break;
    }
  }

  if (actions.length === 0 && papers.length > 0) {
    actions.push('review newly registered papers for missing claim links');
  }

  return uniqueStrings(actions).slice(0, 5);
}

function buildFlowIndex(index, { commandName, derived, timestamp }) {
  return {
    ...index,
    schemaVersion: index.schemaVersion ?? 'vibe.flow.index.v1',
    activeFlow: FLOW_NAME,
    currentStage: derived.currentStage,
    nextActions: derived.nextActions,
    blockers: derived.blockers,
    lastCommand: commandName,
    updatedAt: timestamp,
  };
}

function assertNoDuplicatePaper(existingPapers, paper) {
  for (const existing of existingPapers) {
    if (existing.id === paper.id) {
      throw new DuplicatePaperError(`Paper ${paper.id} already exists.`);
    }

    if (
      normalizeDoi(existing.doi) != null &&
      normalizeDoi(paper.doi) != null &&
      normalizeDoi(existing.doi) === normalizeDoi(paper.doi)
    ) {
      throw new DuplicatePaperError(
        `Paper DOI ${paper.doi} is already registered as ${existing.id}.`,
      );
    }

    if (normalizeTitle(existing.title) === normalizeTitle(paper.title)) {
      throw new DuplicatePaperError(
        `Paper title "${paper.title}" is already registered as ${existing.id}.`,
      );
    }
  }
}

function findPaperIndex(papers, reference) {
  const normalizedReference = reference.toUpperCase();
  const byId = papers.findIndex((paper) => paper.id === normalizedReference);
  if (byId !== -1) {
    return byId;
  }

  const normalizedDoiReference = normalizeDoi(reference);
  if (normalizedDoiReference == null) {
    return -1;
  }

  return papers.findIndex((paper) => normalizeDoi(paper.doi) === normalizedDoiReference);
}

function deriveClaimLinkWarnings(claimId, claimHeads) {
  const knownClaimIds = normalizeClaimHeadInputs(claimHeads);
  if (knownClaimIds == null) {
    return [
      `Claim heads unavailable; stored link to ${claimId} without kernel verification.`,
    ];
  }

  if (!knownClaimIds.includes(claimId)) {
    return [
      `Claim ${claimId} was not present in the provided claim heads; stored link locally only.`,
    ];
  }

  return [];
}

function normalizeClaimHeadInputs(claimHeads) {
  if (claimHeads == null) {
    return null;
  }

  if (!Array.isArray(claimHeads)) {
    throw new LiteratureFlowError('claimHeads must be an array when provided.');
  }

  return uniqueStrings(
    claimHeads
      .map((entry) => {
        if (typeof entry === 'string') {
          return normalizeClaimId(entry, 'claimHeads entry');
        }

        if (entry != null && typeof entry === 'object') {
          const candidate = entry.claimId ?? entry.id;
          if (candidate == null) {
            return null;
          }

          return normalizeClaimId(candidate, 'claimHeads entry');
        }

        return null;
      })
      .filter(Boolean),
  );
}

function getSearchResultCount(entry) {
  const numericCandidates = [
    entry.resultCount,
    entry.resultsCount,
    entry.paperCount,
    entry.papersFound,
    entry.matchCount,
  ];

  for (const candidate of numericCandidates) {
    if (Number.isInteger(candidate) && candidate >= 0) {
      return candidate;
    }
  }

  const arrayCandidates = [entry.paperIds, entry.matchedPaperIds, entry.results];
  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.length;
    }
  }

  return null;
}

function dedupeGapRecords(gaps) {
  const seen = new Set();
  const deduped = [];

  for (const gap of gaps) {
    const key = `${gap.kind}:${gap.claimId ?? ''}:${gap.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(gap);
  }

  return deduped;
}

function generatePaperId(existingPapers) {
  const maxId = existingPapers.reduce((currentMax, paper) => {
    const match = /^LIT-([0-9]{3})$/u.exec(paper.id);
    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `LIT-${String(maxId + 1).padStart(3, '0')}`;
}

function normalizePaperId(paperId) {
  const value = normalizeRequiredString(paperId, 'paperId').toUpperCase();
  if (!PAPER_ID_PATTERN.test(value)) {
    throw new PaperNotFoundError('paperId must match LIT-XXX.');
  }

  return value;
}

function normalizePaperReference(value) {
  const trimmed = normalizeRequiredString(value, 'paperId');
  const upper = trimmed.toUpperCase();
  if (PAPER_ID_PATTERN.test(upper)) {
    return upper;
  }

  return trimmed;
}

function normalizeClaimId(claimId, label) {
  const value = normalizeRequiredString(claimId, label).toUpperCase();
  if (!CLAIM_ID_PATTERN.test(value)) {
    throw new InvalidClaimLinkError(`${label} must match C-XXX.`);
  }

  return value;
}

function normalizeClaimIds(claimIds) {
  if (claimIds == null) {
    return [];
  }

  if (!Array.isArray(claimIds)) {
    throw new InvalidClaimLinkError('linkedClaims must be an array.');
  }

  return uniqueStrings(claimIds.map((claimId) => normalizeClaimId(claimId, 'linkedClaims entry')));
}

function normalizeStringArray(values, label) {
  if (values == null) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new LiteratureFlowError(`${label} must be an array.`);
  }

  return values.map((value) => normalizeRequiredString(value, `${label} entry`));
}

function normalizeRequiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LiteratureFlowError(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new LiteratureFlowError('Expected string or null value.');
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeYear(year) {
  if (year == null) {
    return null;
  }

  if (!Number.isInteger(year)) {
    throw new LiteratureFlowError('year must be an integer or null.');
  }

  return year;
}

function normalizeDoi(doi) {
  const normalized = normalizeOptionalString(doi);
  return normalized == null ? null : normalized.toLowerCase();
}

function normalizeTitle(title) {
  return normalizeRequiredString(title, 'title')
    .toLowerCase()
    .replace(/\s+/gu, ' ');
}

function resolveTimestamp(candidate = new Date().toISOString()) {
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new LiteratureFlowError('Timestamp must be a valid date-time value.');
  }

  return date.toISOString();
}

function uniqueStrings(values) {
  return [...new Set(values)];
}
