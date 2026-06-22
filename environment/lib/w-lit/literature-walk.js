import fs from 'node:fs/promises';
import path from 'node:path';

import { countTokens } from '../token-counter.js';

export const DERIVATIVE_METADATA_PROVENANCE_CLASS =
  'w-lit.derivative-file-metadata.v1';

const SOURCE_ROOTS = [
  {
    relativePath: path.join('raw', 'papers'),
    sourceKind: 'raw-paper'
  },
  {
    relativePath: path.join('wiki', 'sources'),
    sourceKind: 'wiki-source'
  }
];

function isInsideRoot(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function resolveInsideRoot(rootPath, candidatePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);

  if (!isInsideRoot(resolvedRoot, resolvedCandidate)) {
    throw new Error('E_W_LIT_PATH_OUTSIDE_ROOT');
  }

  return resolvedCandidate;
}

function toSourcePath(rootPath, filePath) {
  const resolvedPath = resolveInsideRoot(rootPath, filePath);
  return path.relative(path.resolve(rootPath), resolvedPath).split(path.sep).join('/');
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function assertCorpusRoot(corpusRoot) {
  if (typeof corpusRoot !== 'string' || corpusRoot.trim() === '') {
    throw new Error('E_W_LIT_CORPUS_ROOT_REQUIRED');
  }

  const resolvedRoot = path.resolve(corpusRoot);
  const stat = await fs.stat(resolvedRoot);

  if (!stat.isDirectory()) {
    throw new Error('E_W_LIT_CORPUS_ROOT_NOT_DIRECTORY');
  }

  return resolvedRoot;
}

async function collectSourceFiles(rootPath, directoryPath) {
  const resolvedDirectory = resolveInsideRoot(rootPath, directoryPath);
  const entries = await fs.readdir(resolvedDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolveInsideRoot(
      rootPath,
      path.join(resolvedDirectory, entry.name)
    );

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(rootPath, entryPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function countFileTokens(filePath, tokenCounterOptions) {
  const text = await fs.readFile(filePath, 'utf8');
  const estimate = await countTokens(text, tokenCounterOptions);

  return {
    tokenEstimate: estimate.count,
    tokenEstimateMode: estimate.mode
  };
}

export async function walkLiteratureSources(options = {}) {
  const rootPath = await assertCorpusRoot(options.corpusRoot);
  const tokenCounterOptions = options.tokenCounterOptions ?? {};
  const indexEntries = [];

  for (const sourceRoot of SOURCE_ROOTS) {
    const sourceRootPath = resolveInsideRoot(
      rootPath,
      path.join(rootPath, sourceRoot.relativePath)
    );

    if (!await pathExists(sourceRootPath)) {
      continue;
    }

    const files = await collectSourceFiles(rootPath, sourceRootPath);

    for (const filePath of files) {
      const tokenFields = await countFileTokens(filePath, tokenCounterOptions);
      indexEntries.push({
        sourcePath: toSourcePath(rootPath, filePath),
        sourceKind: sourceRoot.sourceKind,
        provenanceClass: DERIVATIVE_METADATA_PROVENANCE_CLASS,
        law13Provenance: false,
        runtimeOpened: false,
        ...tokenFields
      });
    }
  }

  indexEntries.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath, 'en')
  );
  return indexEntries;
}

export const INTERNALS = {
  resolveInsideRoot,
  toSourcePath
};
