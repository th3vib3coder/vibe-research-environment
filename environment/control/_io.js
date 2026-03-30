/**
 * Shared I/O helpers for control-plane modules.
 * Not a public API — consumed only by sibling control/*.js files.
 */

import { mkdir, readFile, rename, unlink, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// ── Path helpers ──────────────────────────────────────────────

export function resolveProjectRoot(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new TypeError('projectPath must be a non-empty string');
  }
  return path.resolve(projectPath);
}

export function controlDir(projectPath) {
  const root = resolveProjectRoot(projectPath);
  return path.join(root, '.vibe-science-environment', 'control');
}

export async function ensureControlDir(projectPath) {
  const dir = controlDir(projectPath);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ── JSON read / atomic write ──────────────────────────────────

export async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  const serialized = JSON.stringify(data, null, 2) + '\n';

  await writeFile(tmp, serialized, 'utf8');
  try {
    await rename(tmp, filePath);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

// ── JSONL append / read ───────────────────────────────────────

export async function appendJsonl(filePath, record) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(record) + '\n';
  await appendFile(filePath, line, 'utf8');
}

export function readJsonl(filePath) {
  return readFile(filePath, 'utf8')
    .then(raw =>
      raw
        .split('\n')
        .filter(l => l.trim() !== '')
        .map(l => JSON.parse(l))
    )
    .catch(err => {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
}

// ── Schema validation ─────────────────────────────────────────

const cache = new Map();

export async function loadValidator(projectPath, schemaFile) {
  const root = resolveProjectRoot(projectPath);
  const schemaPath = path.join(root, 'environment', 'schemas', schemaFile);

  if (cache.has(schemaPath)) return cache.get(schemaPath);

  const schema = await readJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  cache.set(schemaPath, validate);
  return validate;
}

export function assertValid(validate, data, label) {
  if (validate(data)) return;
  const details = (validate.errors ?? [])
    .map(e => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
    .join('; ');
  throw new Error(`Invalid ${label}: ${details}`);
}

// ── Timestamp helper ──────────────────────────────────────────

export function now() {
  return new Date().toISOString();
}
