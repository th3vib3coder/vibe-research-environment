import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function isDirectRun(importMeta) {
  return process.argv[1] != null && importMeta.url === pathToFileURL(process.argv[1]).href;
}

export async function readJson(repoRelativePath) {
  const filePath = path.join(repoRoot, repoRelativePath);
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readText(repoRelativePath) {
  return readFile(path.join(repoRoot, repoRelativePath), 'utf8');
}

export async function collectFiles(rootRelative, options = {}) {
  const rootPath = path.join(repoRoot, rootRelative);
  const include = options.include ?? (() => true);
  const skipDirs = new Set(options.skipDirs ?? ['.git', 'node_modules']);
  const files = [];

  function shouldSkipDirectory(name) {
    return skipDirs.has(name) || name.startsWith('.tmp-');
  }

  async function walk(dirPath) {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          await walk(path.join(dirPath, entry.name));
        }
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(repoRoot, fullPath).split(path.sep).join('/');
      if (include(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  await walk(rootPath);
  return files.sort();
}

export async function pathExists(repoRelativePath) {
  try {
    await readFile(path.join(repoRoot, repoRelativePath), 'utf8');
    return true;
  } catch (error) {
    if (error?.code === 'EISDIR') {
      return true;
    }
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function validateWithSchema(schemaPath, value) {
  const schema = await readJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(value);
  return {
    ok,
    errors: validate.errors ?? []
  };
}

export function formatErrors(errors) {
  return errors
    .map((error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export async function runValidator(name, fn) {
  try {
    await fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}
