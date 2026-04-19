import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  assert,
  collectFiles,
  isDirectRun,
  readText,
  repoRoot
} from './_helpers.js';

const ALLOWED_RESULTS = new Set(['PASS', 'PARTIAL', 'FALSE-POSITIVE', 'DEFERRED']);
const BANNED_PHRASES = [
  'verified against documentation',
  'implementation-complete with saved evidence',
  'all saved'
];
const LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/gu;

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseExitGateRows(markdown, closeoutPath = 'closeout.md') {
  const lines = markdown.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => {
    const cells = splitTableRow(line).map((cell) => cell.toLowerCase());
    return cells.includes('#') &&
      cells.includes('gate') &&
      cells.includes('result') &&
      cells.includes('evidence');
  });

  if (headerIndex < 0) {
    const error = new Error(`${closeoutPath} missing exit gate table`);
    error.code = 'CLOSEOUT_PARSE_ERROR';
    throw error;
  }

  const header = splitTableRow(lines[headerIndex]).map((cell) => cell.toLowerCase());
  const indexes = {
    number: header.indexOf('#'),
    gate: header.indexOf('gate'),
    result: header.indexOf('result'),
    evidence: header.indexOf('evidence')
  };

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith('|')) {
      break;
    }

    const cells = splitTableRow(line);
    rows.push({
      number: cells[indexes.number] ?? '',
      gate: cells[indexes.gate] ?? '',
      result: cells[indexes.result] ?? '',
      evidence: cells[indexes.evidence] ?? '',
      lineNumber: index + 1
    });
  }

  return rows;
}

function evidenceLinks(evidence) {
  return [...evidence.matchAll(LINK_PATTERN)]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('#'));
}

async function readEvidence(repoRootPath, closeoutPath, target) {
  return readFile(resolveEvidencePath(repoRootPath, closeoutPath, target), 'utf8');
}

function resolveEvidencePath(repoRootPath, closeoutPath, target) {
  const normalized = target.split(/[\\/]/u).join(path.sep);
  const baseDir = path.dirname(closeoutPath);
  const absolutePath = path.resolve(repoRootPath, baseDir, normalized);
  const relative = path.relative(repoRootPath, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Evidence path escapes repo root: ${target}`);
  }

  return absolutePath;
}

async function evidenceIsFile(repoRootPath, closeoutPath, target) {
  try {
    return (await stat(resolveEvidencePath(repoRootPath, closeoutPath, target))).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function jsonContainsNull(raw) {
  try {
    return JSON.stringify(JSON.parse(raw)).includes(':null');
  } catch {
    return false;
  }
}

function jsonLooksLikePassStamp(raw) {
  try {
    const value = JSON.parse(raw);
    const leaves = [];
    function walk(node) {
      if (Array.isArray(node)) {
        for (const item of node) {
          walk(item);
        }
        return;
      }
      if (node && typeof node === 'object') {
        for (const child of Object.values(node)) {
          walk(child);
        }
        return;
      }
      leaves.push(node);
    }
    walk(value);
    return leaves.length > 0 && leaves.every((leaf) => leaf === true);
  } catch {
    return false;
  }
}

function assertFollowUp(markdown, row, closeoutPath, violations) {
  if (row.result !== 'PARTIAL' && row.result !== 'DEFERRED') {
    return;
  }

  const hasFollowUpSection = /##\s+Declared Follow[- ]Up/iu.test(markdown);
  const hasFollowUpId = /FU-\d+/u.test(`${row.gate} ${row.evidence}`);
  if (!hasFollowUpSection || !hasFollowUpId) {
    violations.push(`${closeoutPath}:${row.lineNumber} ${row.result} requires a declared FU-* follow-up link`);
  }
}

function assertFalsePositiveRetraction(markdown, row, closeoutPath, violations) {
  if (row.result !== 'FALSE-POSITIVE') {
    return;
  }

  const afterRow = markdown
    .split(/\r?\n/u)
    .slice(row.lineNumber)
    .join('\n');
  const window = afterRow.slice(0, 1200);
  if (!/retraction|retracted|false-positive/iu.test(window) || !/\[[^\]]+\]\(([^)]+)\)/u.test(window)) {
    violations.push(`${closeoutPath}:${row.lineNumber} FALSE-POSITIVE requires nearby retraction prose with evidence link`);
  }
}

export async function validateCloseoutText(closeoutPath, markdown, options = {}) {
  const rootPath = options.repoRoot ?? repoRoot;
  const rows = parseExitGateRows(markdown, closeoutPath);
  const violations = [];

  for (const row of rows) {
    if (!ALLOWED_RESULTS.has(row.result)) {
      violations.push(`${closeoutPath}:${row.lineNumber} invalid Result "${row.result}"`);
    }

    const links = evidenceLinks(row.evidence);
    if (links.length === 0) {
      violations.push(`${closeoutPath}:${row.lineNumber} Evidence must contain at least one Markdown link`);
    }

    if (new Set(links).size !== links.length) {
      violations.push(`${closeoutPath}:${row.lineNumber} Evidence contains duplicate links`);
    }

    for (const link of links) {
      const normalizedLink = link.split(/[\\/]/u).join('/');
      if (!(await evidenceIsFile(rootPath, closeoutPath, normalizedLink))) {
        violations.push(`${closeoutPath}:${row.lineNumber} Evidence link does not exist or is not a file: ${link}`);
        continue;
      }

      const rawEvidence = await readEvidence(rootPath, closeoutPath, link);
      const rowText = `${row.gate} ${row.result} ${row.evidence}`.toLowerCase();
      if (rowText.includes('implementation-complete with saved evidence') && jsonContainsNull(rawEvidence)) {
        violations.push(`${closeoutPath}:${row.lineNumber} implementation-complete claim links to null metrics`);
      }
      if (rowText.includes('all saved') && jsonLooksLikePassStamp(rawEvidence)) {
        violations.push(`${closeoutPath}:${row.lineNumber} all-saved claim links to pass-stamp booleans only`);
      }
    }

    const lowerRow = `${row.gate} ${row.result} ${row.evidence}`.toLowerCase();
    if (BANNED_PHRASES.some((phrase) => phrase === 'verified against documentation' && lowerRow.includes(phrase))) {
      violations.push(`${closeoutPath}:${row.lineNumber} documentation-only verification cannot be marked as evidence`);
    }

    assertFollowUp(markdown, row, closeoutPath, violations);
    assertFalsePositiveRetraction(markdown, row, closeoutPath, violations);
  }

  return violations;
}

export default async function validateCloseoutHonesty(options = {}) {
  let closeoutPaths;
  if (options.closeoutPaths) {
    closeoutPaths = options.closeoutPaths;
  } else {
    try {
      closeoutPaths = await collectFiles(
        'blueprints/definitive-spec/implementation-plan',
        { include: (file) => /^blueprints\/definitive-spec\/implementation-plan\/phase(?:\d+|55)-closeout\.md$/u.test(file) }
      );
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // Blueprint planning directory not present on this checkout (kept
        // private / not published to the public repo). No closeouts to
        // validate — treat as vacuous pass.
        closeoutPaths = [];
      } else {
        throw error;
      }
    }
  }
  const violations = [];

  for (const closeoutPath of closeoutPaths) {
    violations.push(
      ...(await validateCloseoutText(closeoutPath, await readText(closeoutPath), options))
    );
  }

  assert(violations.length === 0, violations.join('\n'));
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-closeout-honesty', validateCloseoutHonesty);
}
