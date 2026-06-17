import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const LEDGER_ROW_BUDGET_REASON_CODES = Object.freeze({
  overBudgetMissingEvidence: 'E_PHASE11_LEDGER_BUDGET_EVIDENCE_MISSING',
  evidencePathMissing: 'E_PHASE11_LEDGER_BUDGET_EVIDENCE_PATH_MISSING',
  malformedPostPolicyTaskId: 'E_PHASE11_LEDGER_BUDGET_TASK_ID_MALFORMED'
});

const DEFAULT_CUTOFF_TASK_ID = 'T11.3.1';
const DEFAULT_MAX_SECTION_LINES = 90;
const DEFAULT_MAX_SECTION_CHARS = 6000;

function normalizeSlashes(value) {
  return String(value).replace(/\\/gu, '/');
}

function parseTaskId(taskId) {
  const match = /^T(\d+)\.(\d+)\.(\d+)$/u.exec(String(taskId).trim());
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function compareTaskIds(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function isPotentialPostPolicyTask(rawTaskId, cutoffParts) {
  const value = String(rawTaskId).trim();
  if (/^T\d+\.\d+\./u.test(value)) {
    const [phase, wave] = value
      .slice(1)
      .split('.')
      .slice(0, 2)
      .map((part) => Number.parseInt(part, 10));
    return Number.isFinite(phase)
      && Number.isFinite(wave)
      && compareTaskIds([phase, wave, Number.POSITIVE_INFINITY], cutoffParts) >= 0;
  }
  return false;
}

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

export function parseLedgerTaskSections(markdown) {
  const lines = String(markdown).replace(/\r\n/gu, '\n').split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = /^##\s+(\S+)\b(.*)$/u.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = {
        taskId: heading[1],
        heading: line,
        bodyLines: []
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }

  if (current) sections.push(current);
  return sections;
}

function extractEvidencePaths(sectionText) {
  const candidates = new Set();
  const backtickPattern = /`([^`\n]+\.(?:md|json|txt))`/giu;
  const markdownLinkPattern = /\]\(([^)\n]+\.(?:md|json|txt))(?:#[^)]+)?\)/giu;

  for (const match of sectionText.matchAll(backtickPattern)) {
    candidates.add(match[1].trim());
  }
  for (const match of sectionText.matchAll(markdownLinkPattern)) {
    candidates.add(match[1].trim());
  }
  return [...candidates].map((candidate) =>
    normalizeSlashes(candidate.replace(/^<|>$/gu, ''))
  );
}

function resolveEvidencePath(candidate, localRepoRoot) {
  if (/^[A-Za-z]:\//u.test(candidate) || candidate.startsWith('/')) {
    return candidate;
  }
  if (candidate.startsWith('../')) {
    return path.resolve(localRepoRoot, candidate);
  }
  if (candidate.startsWith('vibe-science/')) {
    return path.resolve(localRepoRoot, '..', candidate);
  }
  return path.resolve(localRepoRoot, candidate);
}

async function defaultEvidencePathExists(candidate, localRepoRoot) {
  try {
    await access(resolveEvidencePath(candidate, localRepoRoot));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function validateLedgerRowBudget(options = {}) {
  const ledgerMarkdown = options.ledgerMarkdown ?? '';
  const cutoffTaskId = options.cutoffTaskId ?? DEFAULT_CUTOFF_TASK_ID;
  const cutoffParts = parseTaskId(cutoffTaskId);
  const maxSectionLines = options.maxSectionLines ?? DEFAULT_MAX_SECTION_LINES;
  const maxSectionChars = options.maxSectionChars ?? DEFAULT_MAX_SECTION_CHARS;
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const evidencePathExists = options.evidencePathExists
    ?? ((candidate) => defaultEvidencePathExists(candidate, localRepoRoot));
  const issues = [];
  const checkedSections = [];

  if (!cutoffParts) {
    throw new Error(`Invalid cutoff task id: ${cutoffTaskId}`);
  }

  for (const section of parseLedgerTaskSections(ledgerMarkdown)) {
    const taskParts = parseTaskId(section.taskId);
    if (!taskParts) {
      if (isPotentialPostPolicyTask(section.taskId, cutoffParts)) {
        issues.push({
          code: LEDGER_ROW_BUDGET_REASON_CODES.malformedPostPolicyTaskId,
          taskId: section.taskId,
          heading: section.heading
        });
      }
      continue;
    }

    if (compareTaskIds(taskParts, cutoffParts) < 0) continue;

    const bodyLines = trimBlankEdges(section.bodyLines);
    const bodyText = bodyLines.join('\n');
    const overBudget = bodyLines.length > maxSectionLines
      || bodyText.length > maxSectionChars;
    checkedSections.push({
      taskId: section.taskId,
      lineCount: bodyLines.length,
      charCount: bodyText.length,
      overBudget
    });

    if (!overBudget) continue;

    const evidencePaths = extractEvidencePaths(bodyText);
    if (evidencePaths.length === 0) {
      issues.push({
        code: LEDGER_ROW_BUDGET_REASON_CODES.overBudgetMissingEvidence,
        taskId: section.taskId,
        lineCount: bodyLines.length,
        charCount: bodyText.length
      });
      continue;
    }

    const existsResults = await Promise.all(evidencePaths.map(async (candidate) => ({
      path: candidate,
      exists: await evidencePathExists(candidate)
    })));
    if (!existsResults.some((result) => result.exists)) {
      for (const result of existsResults) {
        issues.push({
          code: LEDGER_ROW_BUDGET_REASON_CODES.evidencePathMissing,
          taskId: section.taskId,
          path: result.path
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedSections
  };
}
