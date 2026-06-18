import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  Phase13IngestError,
  detectTextStructure,
  estimateApproximateTokens,
  evaluateInjectedStaleness,
  normalizeNodeTypeAlias,
  wrapExtractionFailure
} from '../../../autonomous/l2/ingest-utils.js';

const repoRoot = process.cwd();
const modulePath = path.join(repoRoot, 'environment/autonomous/l2/ingest-utils.js');
const metadata = {
  sourcePath: 'fixtures/l2/sample.md',
  provenanceClass: 'source-file'
};

describe('Phase 13 L2 ingest utilities', () => {
  it('keeps the dependency guard explicit for the schema.ts alias adoption', async () => {
    const source = await readFile(modulePath, 'utf8');
    const packageJson = JSON.parse(
      await readFile(path.join(repoRoot, 'package.json'), 'utf8')
    );

    assert.equal(source.includes('from "zod"'), false);
    assert.equal(source.includes("from 'zod'"), false);
    assert.equal(source.includes('normalizeGraph'), false);
    assert.equal(source.includes('validateGraph'), false);
    assert.equal(Object.hasOwn(packageJson.dependencies ?? {}, 'zod'), false);
  });

  it('exports only the scoped L2 utility set, not non-consumable candidates', async () => {
    const module = await import('../../../autonomous/l2/ingest-utils.js');

    assert.equal(Object.hasOwn(module, 'parseWikilinks'), false);
    assert.equal(Object.hasOwn(module, 'parseFrontmatter'), false);
    assert.equal(Object.hasOwn(module, 'fingerprint'), false);
    assert.equal(Object.hasOwn(module, 'ToolCallGuardrailController'), false);
  });

  it('normalizes known node aliases without fabricating authority for unknown aliases', () => {
    const known = normalizeNodeTypeAlias('Fn', metadata);
    const unknown = normalizeNodeTypeAlias('custom-biomedical-node', metadata);

    assert.equal(known.schemaVersion, 'phase13.l2-ingest-utility-output.v1');
    assert.equal(known.kind, 'node-type-alias');
    assert.equal(known.sourcePath, metadata.sourcePath);
    assert.equal(known.provenanceClass, 'source-file');
    assert.equal(known.runtimeOpened, false);
    assert.equal(known.inputType, 'fn');
    assert.equal(known.canonicalType, 'function');
    assert.equal(known.normalized, true);
    assert.equal(known.authoritative, false);

    assert.equal(unknown.inputType, 'custom_biomedical_node');
    assert.equal(unknown.canonicalType, 'custom_biomedical_node');
    assert.equal(unknown.normalized, false);
    assert.equal(unknown.authoritative, false);
  });

  it('rejects wiki query chat and review output as LAW 13 provenance', () => {
    for (const provenanceClass of ['wiki-output', 'query-output', 'chat-output', 'review-output']) {
      assert.throws(
        () => normalizeNodeTypeAlias('fn', {
          sourcePath: 'generated/wiki.md',
          provenanceClass
        }),
        (error) => error instanceof Phase13IngestError
          && error.code === 'E_PHASE13_L2_PROVENANCE_FORBIDDEN'
      );
    }
  });

  it('detects text structure deterministically from injected text only', () => {
    const structured = detectTextStructure([
      'Table of Contents',
      '',
      '# Chapter 1',
      'Intro text',
      '2. Methods',
      'plain paragraph'
    ].join('\n'), metadata);
    const empty = detectTextStructure('', metadata);

    assert.equal(structured.kind, 'text-structure');
    assert.equal(structured.hasTableOfContents, true);
    assert.equal(structured.chaptersDetected, 2);
    assert.deepEqual(structured.chapterHeadingsSample, ['# Chapter 1', '2. Methods']);
    assert.equal(structured.runtimeOpened, false);

    assert.equal(empty.hasTableOfContents, false);
    assert.equal(empty.chaptersDetected, 0);
    assert.deepEqual(empty.chapterHeadingsSample, []);
  });

  it('estimates approximate tokens without claiming model-token exactness', () => {
    const result = estimateApproximateTokens('one two three four five six', metadata);

    assert.equal(result.kind, 'token-estimate');
    assert.equal(result.approximate, true);
    assert.equal(result.exactModelTokens, false);
    assert.equal(result.wordsPerToken, 0.75);
    assert.equal(result.wordCount, 6);
    assert.equal(result.estimatedTokens, 8);
    assert.equal(result.runtimeOpened, false);
  });

  it('evaluates staleness from injected metadata without reading git or filesystem state', () => {
    const result = evaluateInjectedStaleness({
      baseCommit: 'abc123',
      headCommit: 'def456',
      changedFiles: ['environment/autonomous/l2/ingest-utils.js', 'README.md']
    }, metadata);

    assert.equal(result.kind, 'staleness');
    assert.equal(result.stale, true);
    assert.deepEqual(result.changedFiles, [
      'environment/autonomous/l2/ingest-utils.js',
      'README.md'
    ]);
    assert.equal(result.gitInvoked, false);
    assert.equal(result.filesystemRead, false);
    assert.equal(result.runtimeOpened, false);
  });

  it('wraps extraction failures as stable non-fatal ingestion errors', () => {
    const result = wrapExtractionFailure(
      new Error('pdf parser failed'),
      { ...metadata, sourcePath: 'fixtures/broken.pdf' }
    );

    assert.equal(result.kind, 'extraction-error');
    assert.equal(result.errorName, 'Phase13IngestError');
    assert.equal(result.code, 'E_PHASE13_L2_EXTRACTION_FAILED');
    assert.equal(result.nonFatalInBatch, true);
    assert.equal(result.fatalValidationFailure, false);
    assert.equal(result.runtimeOpened, false);
  });

  it('fails closed on malformed input and fatal validation wrapping', () => {
    assert.throws(
      () => normalizeNodeTypeAlias('', metadata),
      (error) => error instanceof Phase13IngestError
        && error.code === 'E_PHASE13_L2_INPUT_REQUIRED'
    );
    assert.throws(
      () => evaluateInjectedStaleness({ changedFiles: 'README.md' }, metadata),
      (error) => error instanceof Phase13IngestError
        && error.code === 'E_PHASE13_L2_CHANGED_FILES_REQUIRED'
    );
    assert.throws(
      () => wrapExtractionFailure(
        new Error('schema invalid'),
        metadata,
        { fatalValidationFailure: true }
      ),
      (error) => error instanceof Phase13IngestError
        && error.code === 'E_PHASE13_L2_FATAL_VALIDATION'
    );
  });
});
