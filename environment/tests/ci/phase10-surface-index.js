import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const SCHEMA_INTRODUCED_AT = '2026-06-09';
const SCHEMA_TASK = 'T10.0.2';
const LAW13_INTRODUCED_AT = '2026-06-09';
const LAW13_TASK = 'T10.0.3';
const CLAIM_EDGE_PROJECTION_INTRODUCED_AT = '2026-06-09';
const CLAIM_EDGE_PROJECTION_TASK = 'T10.0.4';
const CURATOR_ROLE_INTRODUCED_AT = '2026-06-09';
const CURATOR_ROLE_TASK = 'T10.0.5';
const DOMAIN_LIFECYCLE_INTRODUCED_AT = '2026-06-09';
const DOMAIN_LIFECYCLE_TASK = 'T10.0.6';
const LAW13_BRIDGE_INTRODUCED_AT = '2026-06-09';
const LAW13_BRIDGE_TASK = 'T10.0.7';

export const PHASE10_SCHEMA_CONTRACTS = Object.freeze([
  ['phase10.knowledge-domain.v1', 'phase10-knowledge-domain.schema.json', 'phase10-knowledge-domain.schema.test.js'],
  ['phase10.source-bundle.v1', 'phase10-source-bundle.schema.json', 'phase10-source-bundle.schema.test.js'],
  ['phase10.raw-document.v1', 'phase10-raw-document.schema.json', 'phase10-raw-document.schema.test.js'],
  ['phase10.provenance-link.v1', 'phase10-provenance-link.schema.json', 'phase10-provenance-link.schema.test.js'],
  ['phase10.wiki-page.v1', 'phase10-wiki-page.schema.json', 'phase10-wiki-page.schema.test.js'],
  ['phase10.computed-artifact.v1', 'phase10-computed-artifact.schema.json', 'phase10-computed-artifact.schema.test.js'],
  ['phase10.inbox-entry.v1', 'phase10-inbox-entry.schema.json', 'phase10-inbox-entry.schema.test.js'],
  ['phase10.query-record.v1', 'phase10-query-record.schema.json', 'phase10-query-record.schema.test.js'],
  ['phase10.presentation.v1', 'phase10-presentation.schema.json', 'phase10-presentation.schema.test.js'],
  ['phase10.export-recipe.v1', 'phase10-export-recipe.schema.json', 'phase10-export-recipe.schema.test.js'],
  ['phase10.marp-template.v1', 'phase10-marp-template.schema.json', 'phase10-marp-template.schema.test.js'],
  ['phase10.compile-policy.v1', 'phase10-compile-policy.schema.json', 'phase10-compile-policy.schema.test.js'],
  ['phase10.role-envelope.v1', 'phase10-role-envelope.schema.json', 'phase10-role-envelope.schema.test.js']
]);

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
    kind: 'lint-validator',
    name: 'phase10-law13-lint',
    paths: [
      'environment/phase10/law13-lint.js',
      'environment/tests/ci/phase10-law13-lint.js',
      'environment/tests/ci/phase10-law13-lint.test.js'
    ],
    task: LAW13_TASK,
    status: 'implemented-lint-foundation',
    introducedAt: LAW13_INTRODUCED_AT
  },
  {
    kind: 'projection-helper',
    name: 'phase10-claim-edge-projection',
    paths: [
      'environment/phase10/claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.js',
      'environment/tests/ci/phase10-claim-edge-projection.test.js'
    ],
    task: CLAIM_EDGE_PROJECTION_TASK,
    status: 'implemented-read-only-projection',
    introducedAt: CLAIM_EDGE_PROJECTION_INTRODUCED_AT
  },
  {
    kind: 'role-migration',
    name: 'phase10-curator-role',
    paths: [
      'environment/phase10/curator-role.js',
      'environment/orchestrator/agent-orchestration.js',
      'environment/orchestrator/task-registry/phase10-wiki-lint.json',
      'environment/orchestrator/task-registry/phase10-wiki-compile.json',
      'environment/tests/ci/phase10-curator-role.js',
      'environment/tests/ci/phase10-curator-role.test.js'
    ],
    task: CURATOR_ROLE_TASK,
    status: 'implemented-role-migration-foundation',
    introducedAt: CURATOR_ROLE_INTRODUCED_AT
  },
  {
    kind: 'lifecycle-cli',
    name: 'phase10-domain-lifecycle-cli',
    paths: [
      'bin/vre',
      'environment/phase10/domain-lifecycle.js',
      'environment/tests/cli/domain-cli.test.js',
      'environment/schemas/phase9-objective.schema.json'
    ],
    task: DOMAIN_LIFECYCLE_TASK,
    status: 'implemented-lifecycle-cli-foundation',
    introducedAt: DOMAIN_LIFECYCLE_INTRODUCED_AT
  },
  {
    kind: 'bridge-validator',
    name: 'phase10-law13-bridge',
    paths: [
      'environment/phase10/law13-bridge.js',
      'environment/tests/ci/phase10-law13-bridge.js',
      'environment/tests/ci/phase10-law13-bridge.test.js'
    ],
    task: LAW13_BRIDGE_TASK,
    status: 'implemented-bridge-validator',
    introducedAt: LAW13_BRIDGE_INTRODUCED_AT
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

function buildSurface({
  kind,
  name,
  paths,
  task = TASK,
  status = 'planned-or-active-scaffold',
  introducedAt = INTRODUCED_AT
}) {
  return {
    kind,
    name,
    paths,
    task,
    status,
    introducedAt
  };
}

async function maybeSchemaContractSurface(localRepoRoot, [schemaId, schemaFile, testFile]) {
  const schemaPath = `environment/schemas/${schemaFile}`;
  const testPath = `environment/tests/schemas/${testFile}`;
  if (!(await pathExistsAt(localRepoRoot, schemaPath)) || !(await pathExistsAt(localRepoRoot, testPath))) {
    return null;
  }

  return buildSurface({
    kind: 'schema-contract',
    name: schemaId,
    paths: [schemaPath, testPath],
    task: SCHEMA_TASK,
    status: 'implemented-schema-contract',
    introducedAt: SCHEMA_INTRODUCED_AT
  });
}

function scriptSurface(scriptName, command) {
  const paths = ['package.json'];
  if (command.includes('phase10-surface-index.js')) {
    paths.push('environment/tests/ci/phase10-surface-index.js');
  }
  if (command.includes('check-phase10-ledger.js')) {
    paths.push('environment/tests/ci/check-phase10-ledger.js');
  }
  if (command.includes('phase10-law13-lint.js')) {
    paths.push('environment/tests/ci/phase10-law13-lint.js');
  }
  if (command.includes('phase10-law13-bridge.js')) {
    paths.push('environment/tests/ci/phase10-law13-bridge.js');
  }
  if (command.includes('phase10-claim-edge-projection.js')) {
    paths.push('environment/tests/ci/phase10-claim-edge-projection.js');
  }
  if (command.includes('phase10-curator-role.js')) {
    paths.push('environment/tests/ci/phase10-curator-role.js');
  }
  if (command.includes('domain-cli.test.js')) {
    paths.push('environment/tests/cli/domain-cli.test.js');
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

  for (const contract of PHASE10_SCHEMA_CONTRACTS) {
    const surface = await maybeSchemaContractSurface(localRepoRoot, contract);
    if (surface) {
      surfaces.push(surface);
    }
  }

  for (const scriptName of [
    'build:phase10-surface-index',
    'check:phase10-ledger',
    'phase10:dependency-check',
    'phase10:claim-edge-projection',
    'phase10:curator-role',
    'phase10:domain-lifecycle',
    'phase10:law13-bridge',
    'phase10:law13-lint',
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
