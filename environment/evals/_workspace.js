import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TEMPLATE_BY_KIND = {
  'flow-index': 'flow-index.v1.json',
  'literature-flow-state': 'literature-flow-state.v1.json',
  'experiment-flow-state': 'experiment-flow-state.v1.json'
};

function resolveInside(baseDir, relativePath) {
  const targetPath = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir);
  const relative = path.relative(normalizedBase, targetPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace root: ${relativePath}`);
  }

  return targetPath;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mergeValues(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return cloneValue(overrides);
  }

  const merged = cloneValue(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue;
    }

    if (isPlainObject(merged[key]) && isPlainObject(value)) {
      merged[key] = mergeValues(merged[key], value);
      continue;
    }

    merged[key] = cloneValue(value);
  }

  return merged;
}

async function materializeFixture(projectRoot, fixture) {
  const targetPath = resolveInside(projectRoot, fixture.path);
  const state = fixture.state ?? 'present';

  if (state === 'missing') {
    await rm(targetPath, { recursive: true, force: true });
    return;
  }

  if (fixture.kind === 'manifest-directory' || state === 'empty') {
    await rm(targetPath, { recursive: true, force: true });
    await mkdir(targetPath, { recursive: true });
    return;
  }

  const templateFile = TEMPLATE_BY_KIND[fixture.kind];
  if (!templateFile) {
    throw new Error(`Unsupported fixture kind: ${fixture.kind}`);
  }

  const template = await readJson(
    resolveInside(projectRoot, path.join('environment', 'templates', templateFile))
  );
  const seeded = mergeValues(template, fixture.overrides ?? {});
  await writeJson(targetPath, seeded);
}

export function getRepoRoot() {
  return repoRoot;
}

export async function createEvalWorkspace(prefix = 'vre-eval-') {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(projectRoot, 'environment'), { recursive: true });
  await cp(path.join(repoRoot, 'environment', 'templates'), path.join(projectRoot, 'environment', 'templates'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'environment', 'schemas'), path.join(projectRoot, 'environment', 'schemas'), {
    recursive: true
  });
  await cp(
    path.join(repoRoot, 'environment', 'install', 'bundles'),
    path.join(projectRoot, 'environment', 'install', 'bundles'),
    { recursive: true }
  );
  return projectRoot;
}

export async function seedWorkspaceFixtures(projectRoot, fixtures = []) {
  for (const fixture of fixtures) {
    await materializeFixture(projectRoot, fixture);
  }
}

export async function cleanupEvalWorkspace(projectRoot) {
  await rm(projectRoot, { recursive: true, force: true });
}

export function resolveWorkspacePath(projectRoot, relativePath) {
  return resolveInside(projectRoot, relativePath);
}
