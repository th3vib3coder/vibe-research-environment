import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';

export const SURFACE_INDEX_PATH = 'phase9-vre-surface-index.json';

export const SURFACE_INDEX_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'name', 'paths', 'featureId', 'introducedAt'],
    properties: {
      kind: {
        type: 'string',
        enum: [
          'cli-command',
          'schema',
          'doctor-surface',
          'task-registry-entry',
          'scheduler-command',
          'orchestrator-surface',
          'bridge-script',
          'feature-flag',
          'test-entrypoint'
        ]
      },
      name: { type: 'string', minLength: 1 },
      paths: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 }
      },
      featureId: {
        anyOf: [
          { type: 'string', minLength: 1 },
          { type: 'null' }
        ]
      },
      introducedAt: {
        anyOf: [
          { type: 'string', minLength: 1 },
          { type: 'null' }
        ]
      }
    }
  }
};

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

async function pathExistsAt(localRepoRoot, repoRelativePath) {
  try {
    await access(path.join(localRepoRoot, repoRelativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function loadPhase9CliSurfaceDefinitions(localRepoRoot) {
  if (!(await pathExistsAt(localRepoRoot, 'bin/vre'))) {
    return [];
  }

  const moduleUrl = pathToFileURL(path.join(localRepoRoot, 'bin', 'vre')).href;
  const mod = await import(moduleUrl);
  const definitions = mod.PHASE9_STUB_DEFINITIONS;
  return Array.isArray(definitions) ? definitions : [];
}

const EXTRA_PHASE9_SURFACES = Object.freeze([
  {
    file: 'environment/control/capability-handshake.js',
    kind: 'orchestrator-surface',
    name: 'capability-handshake',
    featureId: 'W1-CAPABILITY-HANDSHAKE-AGGREGATOR',
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/control/time-provider.js',
    kind: 'orchestrator-surface',
    name: 'time-provider',
    featureId: 'W0-TIME-PROVIDER-SEAM',
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/control/approved-memory-apis.json',
    kind: 'orchestrator-surface',
    name: 'approved-memory-apis',
    featureId: 'W0-MEMORY-API-ALLOWLIST',
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-capability-handshake.schema.json',
    kind: 'schema',
    name: 'phase9.capability-handshake.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-runtime-budget.schema.json',
    kind: 'schema',
    name: 'phase9.runtime-budget.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-objective.schema.json',
    kind: 'schema',
    name: 'phase9.objective.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-active-objective-pointer.schema.json',
    kind: 'schema',
    name: 'phase9.active-objective-pointer.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-objective-event.schema.json',
    kind: 'schema',
    name: 'phase9.objective-event.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-handoff.schema.json',
    kind: 'schema',
    name: 'phase9.handoff.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-resume-snapshot.schema.json',
    kind: 'schema',
    name: 'phase9.resume-snapshot.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-lane-run-record.schema.json',
    kind: 'schema',
    name: 'phase9.lane-run-record.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  },
  {
    file: 'environment/schemas/phase9-role-envelope.schema.json',
    kind: 'schema',
    name: 'phase9.role-envelope.v1',
    featureId: null,
    introducedAt: '2026-04-22'
  }
]);

function buildSurface({ kind, name, paths, featureId, introducedAt }) {
  return {
    kind,
    name,
    paths: uniqueSorted(paths),
    featureId,
    introducedAt
  };
}

export function validateSurfaceIndexShape(value) {
  assert(Array.isArray(value), 'Surface index must be a top-level array');

  for (const [index, entry] of value.entries()) {
    assert(entry && typeof entry === 'object' && !Array.isArray(entry), `Surface index row ${index} must be an object`);
    const keys = Object.keys(entry).sort();
    assert(
      JSON.stringify(keys) === JSON.stringify(['featureId', 'introducedAt', 'kind', 'name', 'paths'].sort()),
      `Surface index row ${index} has unexpected keys: ${keys.join(', ')}`
    );
    assert(
      SURFACE_INDEX_SCHEMA.items.properties.kind.enum.includes(entry.kind),
      `Surface index row ${index} has unsupported kind: ${entry.kind}`
    );
    assert(typeof entry.name === 'string' && entry.name.trim() !== '', `Surface index row ${index} is missing name`);
    assert(Array.isArray(entry.paths) && entry.paths.length > 0, `Surface index row ${index} must have non-empty paths`);
    for (const pathValue of entry.paths) {
      assert(typeof pathValue === 'string' && pathValue.trim() !== '', `Surface index row ${index} has invalid path`);
    }
    assert(
      entry.featureId === null || (typeof entry.featureId === 'string' && entry.featureId.trim() !== ''),
      `Surface index row ${index} has invalid featureId`
    );
    assert(
      entry.introducedAt === null || (typeof entry.introducedAt === 'string' && entry.introducedAt.trim() !== ''),
      `Surface index row ${index} has invalid introducedAt`
    );
  }
}

export async function generatePhase9SurfaceIndex(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const packageJson = JSON.parse(await readFile(path.join(localRepoRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts ?? {};
  const surfaces = [];

  const checkScriptFiles = [
    'package.json',
    'environment/tests/ci/check-phase9-ledger.js',
    'environment/tests/ci/run-all.js',
    'environment/tests/ci/validate-counts.js'
  ];
  const hasCheckSurface = scripts['check:phase9-ledger']
    && await Promise.all(checkScriptFiles.map((file) => pathExistsAt(localRepoRoot, file)))
      .then((values) => values.every(Boolean));

  if (hasCheckSurface) {
    surfaces.push(buildSurface({
      kind: 'test-entrypoint',
      name: 'check:phase9-ledger',
      paths: checkScriptFiles,
      featureId: 'W0-CI-LEDGER-CHECK',
      introducedAt: '2026-04-21'
    }));
  }

  const surfaceIndexFiles = [
    'package.json',
    'environment/tests/ci/phase9-surface-index.js',
    'environment/tests/ci/check-phase9-ledger.js',
    'phase9-vre-surface-index.json'
  ];
  const hasBuildScript = typeof scripts['build:surface-index'] === 'string'
    && scripts['build:surface-index'].includes('phase9-surface-index.js');
  const hasBuildFiles = await Promise.all(
    surfaceIndexFiles
      .filter((file) => file !== SURFACE_INDEX_PATH)
      .map((file) => pathExistsAt(localRepoRoot, file))
  ).then((values) => values.every(Boolean));

  if (hasBuildScript && hasBuildFiles) {
    surfaces.push(buildSurface({
      kind: 'test-entrypoint',
      name: 'build:surface-index',
      paths: surfaceIndexFiles,
      featureId: 'W0-SURFACE-INDEX-CROSSCHECK',
      introducedAt: '2026-04-21'
    }));
  }

  const phase9TestEntryFiles = [
    'package.json',
    '.github/workflows/ci.yml',
    'environment/tests/ci/validate-runtime-contracts.js'
  ];
  const hasPhase9TestScript = typeof scripts['test:phase9'] === 'string'
    && scripts['test:phase9'].includes('environment/tests/');
  const hasPhase9TestFiles = await Promise.all(
    phase9TestEntryFiles.map((file) => pathExistsAt(localRepoRoot, file))
  ).then((values) => values.every(Boolean));

  if (hasPhase9TestScript && hasPhase9TestFiles) {
    surfaces.push(buildSurface({
      kind: 'test-entrypoint',
      name: 'test:phase9',
      paths: phase9TestEntryFiles,
      featureId: 'W0-PHASE9-TEST-ENTRYPOINT',
      introducedAt: '2026-04-22'
    }));
  }

  for (const definition of EXTRA_PHASE9_SURFACES) {
    if (await pathExistsAt(localRepoRoot, definition.file)) {
      surfaces.push(buildSurface({
        kind: definition.kind,
        name: definition.name,
        paths: [definition.file],
        featureId: definition.featureId,
        introducedAt: definition.introducedAt
      }));
    }
  }

  const cliDefinitions = await loadPhase9CliSurfaceDefinitions(localRepoRoot);
  for (const definition of cliDefinitions) {
    surfaces.push(buildSurface({
      kind: definition.kind,
      name: definition.canonicalCommand,
      paths: ['bin/vre'],
      featureId: definition.featureId,
      introducedAt: definition.introducedAt ?? null
    }));
  }

  const sorted = surfaces.sort((left, right) =>
    `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`)
  );
  validateSurfaceIndexShape(sorted);
  return sorted;
}

export async function writePhase9SurfaceIndex(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const index = await generatePhase9SurfaceIndex({ repoRoot: localRepoRoot });
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(path.join(localRepoRoot, SURFACE_INDEX_PATH), serialized, 'utf8');
  return index;
}

if (isDirectRun(import.meta)) {
  await runValidator('build-phase9-surface-index', async () => {
    const index = await writePhase9SurfaceIndex();
    const outputPath = path.join(repoRoot, SURFACE_INDEX_PATH);
    const persisted = JSON.parse(await readFile(outputPath, 'utf8'));
    validateSurfaceIndexShape(persisted);
    assert(
      JSON.stringify(index) === JSON.stringify(persisted),
      `${SURFACE_INDEX_PATH} differs from generated output`
    );
  });
}
