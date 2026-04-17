import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir, readFile, stat } from 'node:fs/promises';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const REGISTRY_DIR = fileURLToPath(new URL('./task-registry/', import.meta.url));
const SCHEMA_URL = new URL('../schemas/task-registry-entry.schema.json', import.meta.url);
const REPO_ROOT = path.resolve(fileURLToPath(new URL('./', import.meta.url)), '..', '..');

export class TaskRegistryLoadError extends Error {
  constructor(message, { file, cause } = {}) {
    super(message);
    this.name = 'TaskRegistryLoadError';
    this.file = file ?? null;
    if (cause) {
      this.cause = cause;
    }
  }
}

let cache = null;
let loading = null;
const inputValidatorCache = new Map();

function formatSchemaErrors(errors) {
  return (errors ?? [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

async function compileSchema() {
  const schema = JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

async function compileInputSchema(schemaPath) {
  if (inputValidatorCache.has(schemaPath)) {
    return inputValidatorCache.get(schemaPath);
  }

  const absolutePath = path.join(REPO_ROOT, schemaPath);
  const schema = JSON.parse(await readFile(absolutePath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  const validator = ajv.compile(schema);
  inputValidatorCache.set(schemaPath, validator);
  return validator;
}

async function verifyHelper(entry) {
  const modulePath = path.join(REPO_ROOT, entry.helperModule);

  let info;
  try {
    info = await stat(modulePath);
  } catch (error) {
    throw new TaskRegistryLoadError(
      `helperModule not found on disk: ${entry.helperModule}`,
      { file: entry.__sourceFile, cause: error },
    );
  }

  if (!info.isFile()) {
    throw new TaskRegistryLoadError(
      `helperModule is not a regular file: ${entry.helperModule}`,
      { file: entry.__sourceFile },
    );
  }

  let imported;
  try {
    imported = await import(pathToFileURL(modulePath).href);
  } catch (error) {
    throw new TaskRegistryLoadError(
      `helperModule failed to import: ${entry.helperModule}`,
      { file: entry.__sourceFile, cause: error },
    );
  }

  if (typeof imported[entry.helperExport] !== 'function') {
    throw new TaskRegistryLoadError(
      `helperExport "${entry.helperExport}" is not a function in ${entry.helperModule}`,
      { file: entry.__sourceFile },
    );
  }
}

async function loadEntriesOnce() {
  let files;
  try {
    files = await readdir(REGISTRY_DIR);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { entries: new Map(), byKeyword: new Map() };
    }
    throw new TaskRegistryLoadError(
      `Failed to read registry directory: ${REGISTRY_DIR}`,
      { cause: error },
    );
  }

  const jsonFiles = files
    .filter((name) => name.endsWith('.json'))
    .sort();

  const validate = await compileSchema();
  const entries = new Map();
  const byKeyword = new Map();

  for (const file of jsonFiles) {
    const filePath = path.join(REGISTRY_DIR, file);
    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      throw new TaskRegistryLoadError(
        `Failed to read registry entry: ${file}`,
        { file, cause: error },
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new TaskRegistryLoadError(
        `Registry entry is not valid JSON: ${file}`,
        { file, cause: error },
      );
    }

    if (!validate(parsed)) {
      throw new TaskRegistryLoadError(
        `Registry entry failed schema validation: ${file}: ${formatSchemaErrors(validate.errors)}`,
        { file },
      );
    }

    if (entries.has(parsed.taskKind)) {
      throw new TaskRegistryLoadError(
        `Duplicate taskKind "${parsed.taskKind}" across ${entries.get(parsed.taskKind).__sourceFile} and ${file}`,
        { file },
      );
    }

    const withSource = Object.freeze({ ...parsed, __sourceFile: file });
    await verifyHelper(withSource);
    entries.set(parsed.taskKind, withSource);

    for (const keyword of parsed.routerKeywords) {
      const normalized = keyword.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (byKeyword.has(normalized)) {
        throw new TaskRegistryLoadError(
          `Duplicate routerKeyword "${keyword}" across ${byKeyword.get(normalized)} and ${parsed.taskKind}`,
          { file },
        );
      }
      byKeyword.set(normalized, parsed.taskKind);
    }
  }

  return { entries, byKeyword };
}

async function getCache() {
  if (cache) {
    return cache;
  }
  if (!loading) {
    loading = loadEntriesOnce().then((value) => {
      cache = value;
      loading = null;
      return value;
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

export async function getTaskRegistry() {
  const { entries } = await getCache();
  return new Map(entries);
}

export async function getTaskEntry(taskKind) {
  if (typeof taskKind !== 'string' || taskKind.trim() === '') {
    return null;
  }
  const { entries } = await getCache();
  return entries.get(taskKind) ?? null;
}

export async function validateTaskInput(taskKind, taskInput) {
  const entry = await getTaskEntry(taskKind);
  if (!entry) {
    throw new TaskRegistryLoadError(`Cannot validate taskInput for unknown task kind: ${taskKind}`);
  }

  if (entry.inputSchema == null) {
    return;
  }

  const validate = await compileInputSchema(entry.inputSchema);
  if (validate(taskInput)) {
    return;
  }

  throw new TaskRegistryLoadError(
    `taskInput for ${taskKind} failed ${entry.inputSchema}: ${formatSchemaErrors(validate.errors)}`,
    { file: entry.__sourceFile },
  );
}

export async function findByRouterKeyword(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return null;
  }
  const { byKeyword } = await getCache();
  const haystack = text.toLowerCase();
  const matches = new Set();
  for (const [keyword, taskKind] of byKeyword.entries()) {
    if (haystack.includes(keyword)) {
      matches.add(taskKind);
    }
  }
  if (matches.size === 0) {
    return null;
  }
  if (matches.size > 1) {
    return { ambiguous: true, candidates: [...matches].sort() };
  }
  return { ambiguous: false, taskKind: [...matches][0] };
}

export async function listExecutionTaskKinds() {
  const { entries } = await getCache();
  return [...entries.values()]
    .filter((entry) => entry.lane === 'execution')
    .map((entry) => entry.taskKind)
    .sort();
}

export async function listReviewTaskKinds() {
  const { entries } = await getCache();
  return [...entries.values()]
    .filter((entry) => entry.lane === 'review')
    .map((entry) => entry.taskKind)
    .sort();
}

export async function resetTaskRegistryCache() {
  cache = null;
  loading = null;
  inputValidatorCache.clear();
}
