import { readFile } from 'node:fs/promises';

import { loadValidator, resolveInside, resolveProjectRoot } from '../control/_io.js';

const SCHEMA_FILE = 'memory-mark-record.schema.json';
const TARGET_TYPES = ['claim', 'experiment', 'paper'];

function marksPath(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'memory',
    'index',
    'marks.jsonl'
  );
}

function buildMarkSummary(overrides = {}) {
  return {
    hasMarksFile: false,
    totalMarks: 0,
    warnings: [],
    byTargetType: {
      claim: 0,
      experiment: 0,
      paper: 0
    },
    records: [],
    prioritizedTargets: [],
    ...overrides
  };
}

function formatErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

function buildTargetKey(record) {
  return `${record.targetType}:${record.targetId}`;
}

function dedupeRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.targetType}:${record.targetId}:${record.mark}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizeRecords(records) {
  const byTargetType = {
    claim: 0,
    experiment: 0,
    paper: 0
  };
  const grouped = new Map();

  for (const record of records) {
    byTargetType[record.targetType] += 1;

    const groupKey = buildTargetKey(record);
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        targetType: record.targetType,
        targetId: record.targetId,
        marks: []
      });
    }

    grouped.get(groupKey).marks.push(record.mark);
  }

  return {
    byTargetType,
    prioritizedTargets: [...grouped.values()]
  };
}

export function buildMarkIndex(records = []) {
  const index = new Map();

  for (const record of records) {
    const key = buildTargetKey(record);
    const existing = index.get(key) ?? [];
    if (!existing.includes(record.mark)) {
      existing.push(record.mark);
      index.set(key, existing);
    }
  }

  return index;
}

export function getTargetMarks(markIndex, targetType, targetId) {
  if (!markIndex || !targetType || !targetId) {
    return [];
  }

  return [...(markIndex.get(`${targetType}:${targetId}`) ?? [])];
}

export function prioritizeByMarks(
  records = [],
  { targetType, getTargetId, markIndex }
) {
  return records
    .map((record, position) => ({
      record,
      position,
      marks: getTargetMarks(markIndex, targetType, getTargetId(record))
    }))
    .sort((left, right) => {
      const leftMarked = left.marks.length > 0 ? 1 : 0;
      const rightMarked = right.marks.length > 0 ? 1 : 0;

      if (leftMarked !== rightMarked) {
        return rightMarked - leftMarked;
      }

      if (left.marks.length !== right.marks.length) {
        return right.marks.length - left.marks.length;
      }

      return left.position - right.position;
    })
    .map((entry) => ({
      ...entry.record,
      marks: entry.marks
    }));
}

export async function getMemoryMarks(projectPath) {
  let raw;
  try {
    raw = await readFile(marksPath(projectPath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return buildMarkSummary();
    }

    return buildMarkSummary({
      warnings: [`Unable to read memory marks: ${error.message}`]
    });
  }

  let validate;
  try {
    validate = await loadValidator(projectPath, SCHEMA_FILE);
  } catch (error) {
    return buildMarkSummary({
      hasMarksFile: true,
      warnings: [`Unable to validate memory marks: ${error.message}`]
    });
  }

  const warnings = [];
  const validRecords = [];
  const lines = raw.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === '') {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      warnings.push(`Ignoring invalid memory mark JSON on line ${index + 1}: ${error.message}`);
      continue;
    }

    if (!validate(parsed)) {
      warnings.push(
        `Ignoring invalid memory mark record on line ${index + 1}: ${formatErrors(
          validate.errors
        )}`
      );
      continue;
    }

    validRecords.push(parsed);
  }

  const records = dedupeRecords(validRecords);
  const summary = summarizeRecords(records);

  return buildMarkSummary({
    hasMarksFile: true,
    totalMarks: records.length,
    warnings,
    byTargetType: summary.byTargetType,
    records,
    prioritizedTargets: summary.prioritizedTargets
  });
}

export const INTERNALS = {
  buildMarkSummary,
  buildTargetKey,
  dedupeRecords,
  formatErrors,
  marksPath,
  summarizeRecords
};
