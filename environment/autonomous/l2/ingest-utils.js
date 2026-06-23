// Phase 13 L2 ingest utilities are VRE-local adaptations of MIT-licensed
// candidate shapes validated in T13.2.1. Source references:
// - Understand-Anything schema.ts NODE_TYPE_ALIASES, lines 17-61, MIT.
// - Understand-Anything staleness.ts injected changed-file semantics, lines 13-29, MIT.
// - book-to-skill utils.py estimate_tokens, lines 46-47, MIT.
// - book-to-skill utils.py detect_structure, lines 50-66, MIT.
// - book-to-skill exceptions.py ExtractionError, lines 1-2, MIT.

const OUTPUT_SCHEMA_VERSION = 'phase13.l2-ingest-utility-output.v1';
const DEFAULT_WORDS_PER_TOKEN = 0.75;

const FORBIDDEN_PROVENANCE_CLASSES = new Set([
  'wiki-output',
  'query-output',
  'chat-output',
  'review-output',
  'relay-verdict',
  'adversarial-verdict'
]);

// Curated VRE-local subset of the dependency-free alias-map shape. Do not
// import zod or graph validators from the upstream schema module.
const NODE_TYPE_ALIASES = Object.freeze({
  fn: 'function',
  func: 'function',
  method: 'function',
  interface: 'class',
  struct: 'class',
  mod: 'module',
  pkg: 'module',
  package: 'module',
  doc: 'document',
  docs: 'document',
  readme: 'document',
  ci: 'pipeline',
  job: 'pipeline',
  api: 'endpoint',
  route: 'endpoint',
  setting: 'config',
  env: 'config',
  db: 'table',
  database: 'table',
  proto: 'schema',
  typedef: 'schema',
  wiki_page: 'article',
  note: 'article',
  assertion: 'claim',
  decision: 'claim',
  paper: 'source',
  reference: 'source'
});

export class Phase13IngestError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'Phase13IngestError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra) {
  throw new Phase13IngestError(code, message, extra);
}

function requireString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeAliasKey(value) {
  return value.trim().toLowerCase().replace(/[\s-]+/gu, '_');
}

function normalizeMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('E_PHASE13_L2_METADATA_REQUIRED', 'metadata must be an object');
  }

  const sourcePath = requireString(
    metadata.sourcePath,
    'E_PHASE13_L2_SOURCE_PATH_REQUIRED',
    'sourcePath'
  );
  const provenanceClass = requireString(
    metadata.provenanceClass,
    'E_PHASE13_L2_PROVENANCE_CLASS_REQUIRED',
    'provenanceClass'
  );

  if (FORBIDDEN_PROVENANCE_CLASSES.has(provenanceClass)) {
    fail(
      'E_PHASE13_L2_PROVENANCE_FORBIDDEN',
      `${provenanceClass} is metadata, not LAW 13 provenance`,
      { provenanceClass }
    );
  }

  return {
    sourcePath,
    provenanceClass,
    runtimeOpened: false
  };
}

function utilityOutput(kind, metadata, payload) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    kind,
    ...normalizeMetadata(metadata),
    ...payload
  };
}

export function normalizeNodeTypeAlias(inputType, metadata) {
  const rawType = requireString(
    inputType,
    'E_PHASE13_L2_INPUT_REQUIRED',
    'inputType'
  );
  const normalizedInput = normalizeAliasKey(rawType);
  const canonicalType = NODE_TYPE_ALIASES[normalizedInput] ?? normalizedInput;

  return utilityOutput('node-type-alias', metadata, {
    inputType: normalizedInput,
    canonicalType,
    normalized: canonicalType !== normalizedInput,
    authoritative: false,
    sourceReference:
      'Understand-Anything schema.ts NODE_TYPE_ALIASES lines 17-61, MIT'
  });
}

export function detectTextStructure(text, metadata) {
  if (typeof text !== 'string') {
    fail('E_PHASE13_L2_TEXT_REQUIRED', 'text must be a string');
  }

  const sample = text.slice(0, 50000);
  const lines = sample.split(/\r?\n/u);
  const chapterPattern = /^\s*(?:#{1,6}\s+)?(?:chapter\s+\d+|ch\.\s*\d+|\d+\.\s+[A-Z])/iu;
  const tocPattern = /^\s*(?:table of contents|contents|indice|sumario)\s*$/imu;
  const headings = lines
    .map((line) => line.trim())
    .filter((line) => chapterPattern.test(line));

  return utilityOutput('text-structure', metadata, {
    chaptersDetected: headings.length,
    chapterHeadingsSample: headings.slice(0, 10),
    hasTableOfContents: tocPattern.test(text.slice(0, 30000)),
    sourceReference: 'book-to-skill utils.py detect_structure lines 50-66, MIT'
  });
}

export function estimateApproximateTokens(text, metadata, options = {}) {
  if (typeof text !== 'string') {
    fail('E_PHASE13_L2_TEXT_REQUIRED', 'text must be a string');
  }

  const wordsPerToken = Number.isFinite(options.wordsPerToken)
    && options.wordsPerToken > 0
    ? options.wordsPerToken
    : DEFAULT_WORDS_PER_TOKEN;
  const wordCount = text.trim() === ''
    ? 0
    : text.trim().split(/\s+/u).length;

  return utilityOutput('token-estimate', metadata, {
    wordCount,
    wordsPerToken,
    estimatedTokens: Math.floor(wordCount / wordsPerToken),
    approximate: true,
    exactModelTokens: false,
    sourceReference: 'book-to-skill utils.py estimate_tokens lines 46-47, MIT'
  });
}

export function evaluateInjectedStaleness(input, metadata) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('E_PHASE13_L2_STALENESS_INPUT_REQUIRED', 'staleness input must be an object');
  }
  if (!Array.isArray(input.changedFiles)) {
    fail('E_PHASE13_L2_CHANGED_FILES_REQUIRED', 'changedFiles must be an array');
  }

  const changedFiles = input.changedFiles.map((file) =>
    requireString(file, 'E_PHASE13_L2_CHANGED_FILE_INVALID', 'changedFiles entry')
  );

  return utilityOutput('staleness', metadata, {
    baseCommit: typeof input.baseCommit === 'string' ? input.baseCommit : null,
    headCommit: typeof input.headCommit === 'string' ? input.headCommit : null,
    stale: changedFiles.length > 0,
    changedFiles,
    gitInvoked: false,
    filesystemRead: false,
    sourceReference:
      'Understand-Anything staleness.ts changed-file semantics lines 13-29, MIT'
  });
}

export function wrapExtractionFailure(error, metadata, options = {}) {
  if (options.fatalValidationFailure === true) {
    fail(
      'E_PHASE13_L2_FATAL_VALIDATION',
      'fatal validation failures must not be wrapped as non-fatal extraction errors'
    );
  }

  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');

  return utilityOutput('extraction-error', metadata, {
    errorName: 'Phase13IngestError',
    code: 'E_PHASE13_L2_EXTRACTION_FAILED',
    message,
    nonFatalInBatch: true,
    fatalValidationFailure: false,
    sourceReference: 'book-to-skill exceptions.py ExtractionError lines 1-2, MIT'
  });
}
