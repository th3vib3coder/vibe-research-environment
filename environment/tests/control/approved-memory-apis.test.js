import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ALLOWLIST_PATH = path.join(
  'environment',
  'control',
  'approved-memory-apis.json'
);

const MEMORY_ROOT = path.join('environment', 'memory');

const EXPORT_PATTERN =
  /^export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gmu;

function compareEntries(left, right) {
  return `${left.modulePath}:${left.exportName}`.localeCompare(
    `${right.modulePath}:${right.exportName}`
  );
}

function parseNamedExports(source) {
  const names = [];
  for (const match of source.matchAll(EXPORT_PATTERN)) {
    const exportName = match[1];
    if (exportName !== 'INTERNALS') {
      names.push(exportName);
    }
  }
  return [...new Set(names)].sort();
}

async function collectMemoryModulePaths(projectRoot) {
  const entries = await readFile(
    path.join(projectRoot, MEMORY_ROOT, 'marks.js'),
    'utf8'
  );
  void entries;
  const moduleNames = ['marks.js', 'status.js', 'sync.js'];
  return moduleNames.map((fileName) => path.join(MEMORY_ROOT, fileName).replaceAll('\\', '/'));
}

async function readApprovedMemoryApis(projectRoot) {
  return JSON.parse(await readFile(path.join(projectRoot, ALLOWLIST_PATH), 'utf8'));
}

async function discoverMemoryExports(projectRoot) {
  const discovered = [];

  for (const modulePath of await collectMemoryModulePaths(projectRoot)) {
    const source = await readFile(path.join(projectRoot, modulePath), 'utf8');
    for (const exportName of parseNamedExports(source)) {
      discovered.push({ modulePath, exportName });
    }
  }

  return discovered.sort(compareEntries);
}

async function validateApprovedMemoryApis(projectRoot) {
  const allowlist = await readApprovedMemoryApis(projectRoot);
  assert(Array.isArray(allowlist), 'approved-memory-apis must be a JSON array');

  const discoveredExports = await discoverMemoryExports(projectRoot);
  const discoveredIndex = new Set(
    discoveredExports.map((entry) => `${entry.modulePath}:${entry.exportName}`)
  );
  const allowlistIndex = new Set();

  for (const [index, entry] of allowlist.entries()) {
    assert(entry && typeof entry === 'object' && !Array.isArray(entry), `allowlist row ${index} must be an object`);
    assert(typeof entry.name === 'string' && entry.name.trim() !== '', `allowlist row ${index} missing name`);
    assert(typeof entry.modulePath === 'string' && entry.modulePath.trim() !== '', `allowlist row ${index} missing modulePath`);
    assert(typeof entry.exportName === 'string' && entry.exportName.trim() !== '', `allowlist row ${index} missing exportName`);
    assert(typeof entry.summary === 'string' && entry.summary.trim() !== '', `allowlist row ${index} missing summary`);
    assert(typeof entry.safeToExpose === 'boolean', `allowlist row ${index} missing safeToExpose boolean`);
    assert(typeof entry.category === 'string' && entry.category.trim() !== '', `allowlist row ${index} missing category`);

    const absoluteModulePath = path.join(projectRoot, entry.modulePath);
    const source = await readFile(absoluteModulePath, 'utf8').catch(() => null);
    assert(source != null, `allowlist row ${index} points to missing module ${entry.modulePath}`);

    const key = `${entry.modulePath}:${entry.exportName}`;
    assert(discoveredIndex.has(key), `allowlist row ${index} references missing export ${key}`);
    assert(!allowlistIndex.has(key), `allowlist duplicates ${key}`);
    allowlistIndex.add(key);
  }

  for (const entry of discoveredExports) {
    const key = `${entry.modulePath}:${entry.exportName}`;
    assert(
      allowlistIndex.has(key),
      `memory export ${key} exists on disk but is absent from approved-memory-apis.json`
    );
  }

  return {
    allowlist,
    discoveredExports
  };
}

describe('approved-memory-apis', () => {
  let fixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(path.join(tmpdir(), 'vre-memory-apis-'));
    await mkdir(path.join(fixtureRoot, 'environment', 'control'), { recursive: true });
    await cp(
      path.join(process.cwd(), 'environment', 'memory'),
      path.join(fixtureRoot, 'environment', 'memory'),
      { recursive: true }
    );
    await writeFile(
      path.join(fixtureRoot, ALLOWLIST_PATH),
      await readFile(path.join(process.cwd(), ALLOWLIST_PATH), 'utf8'),
      'utf8'
    );
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('matches the reviewed export set exactly for the checked-in memory modules', async () => {
    const result = await validateApprovedMemoryApis(fixtureRoot);
    assert.equal(result.allowlist.length, result.discoveredExports.length);
    assert.equal(result.allowlist.length, 11);
  });

  it('fails when an allowlist row points to a module or export missing on disk', async () => {
    const allowlist = await readApprovedMemoryApis(fixtureRoot);
    allowlist.push({
      name: 'ghostMemoryApi',
      modulePath: 'environment/memory/missing.js',
      exportName: 'ghostMemoryApi',
      summary: 'Missing on disk by construction.',
      safeToExpose: true,
      category: 'test-fixture'
    });
    await writeFile(
      path.join(fixtureRoot, ALLOWLIST_PATH),
      `${JSON.stringify(allowlist, null, 2)}\n`,
      'utf8'
    );

    await assert.rejects(
      () => validateApprovedMemoryApis(fixtureRoot),
      /points to missing module|references missing export/u
    );
  });

  it('fails when a real on-disk memory export is absent from the reviewed allowlist', async () => {
    const allowlist = await readApprovedMemoryApis(fixtureRoot);
    const filtered = allowlist.filter(
      (entry) => !(entry.modulePath === 'environment/memory/status.js' && entry.exportName === 'getMemoryFreshness')
    );
    await writeFile(
      path.join(fixtureRoot, ALLOWLIST_PATH),
      `${JSON.stringify(filtered, null, 2)}\n`,
      'utf8'
    );

    await assert.rejects(
      () => validateApprovedMemoryApis(fixtureRoot),
      /getMemoryFreshness/u
    );
  });
});
