import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';

export const PHASE10_SURFACE_INDEX_PATH = 'phase10-vre-surface-index.json';

export const PHASE10_SURFACE_INDEX_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'name', 'paths', 'task', 'status', 'introducedAt'],
    properties: {
      kind: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      paths: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 }
      },
      task: { type: 'string', minLength: 1 },
      status: { type: 'string', minLength: 1 },
      introducedAt: { type: 'string', minLength: 1 }
    }
  }
};

const INTRODUCED_AT = '2026-06-07';
const TASK = 'T10.0.1';

const STATIC_PHASE10_SURFACES = Object.freeze([
  {
    kind: 'feature-ledger',
    name: 'phase10-vre-feature-ledger',
    paths: ['phase10-vre-feature-ledger.md']
  },
  {
    kind: 'surface-index',
    name: 'phase10-vre-surface-index',
    paths: [PHASE10_SURFACE_INDEX_PATH]
  },
  {
    kind: 'ci-checker',
    name: 'phase10-surface-index-generator',
    paths: [
      'environment/tests/ci/phase10-surface-index.js',
      'environment/tests/ci/phase10-surface-index.test.js'
    ]
  },
  {
    kind: 'ci-checker',
    name: 'check-phase10-ledger',
    paths: [
      'environment/tests/ci/check-phase10-ledger.js',
      'environment/tests/ci/check-phase10-ledger.test.js'
    ]
  },
  {
    kind: 'hard-dependency',
    name: 'phase9.claim-edge.v1 dependency',
    paths: ['environment/schemas/phase9-claim-edge.schema.json']
  },
  {
    kind: 'hard-dependency',
    name: 'claims-edges dependency',
    paths: ['environment/claims/edges.js']
  },
  {
    kind: 'implementation-log',
    name: 'phase10-implementation-log',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-implementation-log.md']
  },
  {
    kind: 'registry',
    name: 'phase10-schema-registry',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-schema-registry.md']
  },
  {
    kind: 'ledger',
    name: 'phase10-lint-check-ledger',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-lint-check-ledger.md']
  },
  {
    kind: 'ledger',
    name: 'phase10-role-budget-ledger',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-role-budget-ledger.md']
  },
  {
    kind: 'ledger',
    name: 'phase10-export-guard-ledger',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-export-guard-ledger.md']
  },
  {
    kind: 'ledger',
    name: 'phase10-file-change-ledger',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-file-change-ledger.md']
  },
  {
    kind: 'ledger',
    name: 'phase10-change-trace-ledger',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-change-trace-ledger.md']
  },
  {
    kind: 'maintenance-notes',
    name: 'phase10-maintenance-notes',
    paths: ['../vibe-science/blueprints/private/phase10-implementation-plan/phase10-maintenance-notes.md']
  }
]);

function buildSurface({ kind, name, paths }) {
  return {
    kind,
    name,
    paths,
    task: TASK,
    status: 'planned-or-active-scaffold',
    introducedAt: INTRODUCED_AT
  };
}

function scriptSurface(scriptName, command) {
  const paths = ['package.json'];
  if (command.includes('phase10-surface-index.js')) {
    paths.push('environment/tests/ci/phase10-surface-index.js');
  }
  if (command.includes('check-phase10-ledger.js')) {
    paths.push('environment/tests/ci/check-phase10-ledger.js');
  }
  return buildSurface({
    kind: 'package-script',
    name: scriptName,
    paths
  });
}

async function loadPackageScripts(localRepoRoot) {
  const packageJson = JSON.parse(await readFile(path.join(localRepoRoot, 'package.json'), 'utf8'));
  return packageJson.scripts ?? {};
}

export function validatePhase10SurfaceIndexShape(value) {
  assert(Array.isArray(value), 'phase10 surface index must be an array');
  const seen = new Set();
  for (const [index, surface] of value.entries()) {
    assert(surface && typeof surface === 'object' && !Array.isArray(surface), `surface ${index} must be an object`);
    for (const key of ['kind', 'name', 'task', 'status', 'introducedAt']) {
      assert(typeof surface[key] === 'string' && surface[key].length > 0, `surface ${index} missing ${key}`);
    }
    assert(Array.isArray(surface.paths) && surface.paths.length > 0, `surface ${index} missing paths`);
    for (const surfacePath of surface.paths) {
      assert(typeof surfacePath === 'string' && surfacePath.length > 0, `surface ${index} has invalid path`);
      assert(!path.isAbsolute(surfacePath), `surface ${index} path must be repo/workspace relative: ${surfacePath}`);
    }
    const key = `${surface.kind}:${surface.name}`;
    assert(!seen.has(key), `duplicate phase10 surface index entry: ${key}`);
    seen.add(key);
  }
}

export async function generatePhase10SurfaceIndex(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const scripts = await loadPackageScripts(localRepoRoot);
  const surfaces = STATIC_PHASE10_SURFACES.map(buildSurface);

  for (const scriptName of [
    'build:phase10-surface-index',
    'check:phase10-ledger',
    'phase10:dependency-check',
    'test:phase10-scaffold'
  ]) {
    if (typeof scripts[scriptName] === 'string') {
      surfaces.push(scriptSurface(scriptName, scripts[scriptName]));
    }
  }

  const sorted = surfaces.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
  validatePhase10SurfaceIndexShape(sorted);
  return sorted;
}

export async function writePhase10SurfaceIndex(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const index = await generatePhase10SurfaceIndex(options);
  const outputPath = path.join(localRepoRoot, PHASE10_SURFACE_INDEX_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}

if (isDirectRun(import.meta)) {
  await runValidator('build-phase10-surface-index', async () => {
    const index = await writePhase10SurfaceIndex();
    console.log(`wrote ${PHASE10_SURFACE_INDEX_PATH} with ${index.length} surfaces`);
  });
}
