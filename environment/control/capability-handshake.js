import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertValid, loadValidator, readJson, resolveProjectRoot } from './_io.js';
import {
  connectorManifestsDir,
  isConnectorsCoreInstalled,
  readConnectorManifest
} from '../connectors/manifest.js';
import { getConnectorHealthOverview } from '../connectors/health.js';
import {
  automationDefinitionsDir,
  isAutomationCoreInstalled,
  readAutomationDefinition
} from '../automation/definitions.js';
import { getAutomationOverview } from '../automation/artifacts.js';
import {
  domainPacksDir,
  domainPackManifestPath,
  isDomainPacksCoreInstalled,
  readDomainPackManifest
} from '../domain-packs/loader.js';
import {
  KERNEL_PROJECTION_NAMES,
  KERNEL_PROJECTION_SCHEMA_VERSION,
  resolveKernelReader
} from '../lib/kernel-bridge.js';
import { getTaskRegistry } from '../orchestrator/task-registry.js';
import { getMemoryFreshness } from '../memory/status.js';

export const HANDSHAKE_SCHEMA_VERSION = 'phase9.capability-handshake.v1';
export const HANDSHAKE_SCHEMA_FILE = 'phase9-capability-handshake.schema.json';
export const HANDSHAKE_ARTIFACT_PATH = '.vibe-science-environment/control/capability-handshake.json';
export const ACTIVE_OBJECTIVE_POINTER_PATH = '.vibe-science-environment/objectives/active-objective.json';
export const PROJECTION_PROBE_FIXTURE_PATH =
  'environment/tests/fixtures/phase9/capability-handshake/valid-projection-probe-shape.json';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PROJECT_ROOT = resolveProjectRoot(path.join(MODULE_DIR, '..', '..'));

export const OPERATOR_ARTIFACT_PATHS = Object.freeze([
  '.vibe-science-environment/objectives/<OBJ-ID>/resume-snapshot.json',
  '.vibe-science-environment/objectives/<OBJ-ID>/digest-latest.md',
  '.vibe-science-environment/objectives/<OBJ-ID>/events.jsonl',
  '.vibe-science-environment/objectives/<OBJ-ID>/handoffs.jsonl',
  '.vibe-science-environment/objectives/<OBJ-ID>/BLOCKER.flag'
]);

const REVIEWED_MISSING_SURFACE_RULES = Object.freeze([
  {
    surface: 'capabilities --json',
    present: async () => false
  },
  {
    surface: 'run-analysis',
    present: async () => false
  },
  {
    surface: 'research-loop',
    present: async () => false
  },
  {
    surface: 'analysis-manifest schema',
    present: async (projectRoot) =>
      pathExists(path.join(projectRoot, 'environment', 'schemas', 'phase9-analysis-manifest.schema.json'))
  },
  {
    surface: 'plugin handshake injection',
    present: async (projectRoot) =>
      pathExists(path.join(path.dirname(projectRoot), 'vibe-science', 'plugin', 'scripts', 'handshake-inject.js'))
  },
  {
    surface: 'scheduler runtime',
    present: async (projectRoot) =>
      pathExists(path.join(projectRoot, 'environment', 'scheduler', 'windows-task-scheduler.js'))
  },
  {
    surface: 'reviewer-2 bridge',
    present: async (projectRoot) =>
      pathExists(path.join(path.dirname(projectRoot), 'vibe-science', 'plugin', 'scripts', 'r2-bridge-writer.js'))
  }
]);

const NAMED_EXPORT_PATTERN =
  /^export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gmu;

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function resolveSchemaHostRoot(projectRoot, schemaFile) {
  const targetSchemaPath = path.join(projectRoot, 'environment', 'schemas', schemaFile);
  if (await pathExists(targetSchemaPath)) {
    return projectRoot;
  }
  return MODULE_PROJECT_ROOT;
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function collectIsoTimestamps(value, collector = []) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      collector.push(value);
    }
    return collector;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectIsoTimestamps(item, collector);
    }
    return collector;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectIsoTimestamps(entry, collector);
    }
  }

  return collector;
}

function latestIsoTimestamp(value) {
  const timestamps = collectIsoTimestamps(value, []);
  if (timestamps.length === 0) {
    return null;
  }

  return timestamps
    .map((timestamp) => ({ timestamp, parsed: Date.parse(timestamp) }))
    .filter((entry) => !Number.isNaN(entry.parsed))
    .sort((left, right) => right.parsed - left.parsed)[0]?.timestamp ?? null;
}

function parseNamedExports(source) {
  const exportNames = [];
  for (const match of source.matchAll(NAMED_EXPORT_PATTERN)) {
    const exportName = match[1];
    if (exportName !== 'INTERNALS') {
      exportNames.push(exportName);
    }
  }
  return uniqueSorted(exportNames);
}

async function loadCliMetadata(projectRoot) {
  const moduleUrl = pathToFileURL(path.join(projectRoot, 'bin', 'vre')).href;
  const mod = await import(moduleUrl);
  return {
    DISPATCH_TABLE: mod.DISPATCH_TABLE ?? {},
    PHASE9_STUB_DEFINITIONS: Array.isArray(mod.PHASE9_STUB_DEFINITIONS)
      ? mod.PHASE9_STUB_DEFINITIONS
      : [],
    resolveKernelRoot: typeof mod.resolveKernelRoot === 'function'
      ? mod.resolveKernelRoot
      : () => ({ kernelRoot: null, source: 'not-found' })
  };
}

async function readPackageName(projectRoot) {
  try {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8')
    );
    return typeof packageJson.name === 'string' ? packageJson.name : null;
  } catch {
    return null;
  }
}

async function detectVrePresence(projectRoot) {
  const [packageName, hasSchemasDir, hasBinVre] = await Promise.all([
    readPackageName(projectRoot),
    pathExists(path.join(projectRoot, 'environment', 'schemas')),
    pathExists(path.join(projectRoot, 'bin', 'vre'))
  ]);

  return packageName === 'vibe-research-environment' && hasSchemasDir && hasBinVre;
}

async function collectMarkdownContracts(projectRoot) {
  const commandsDir = path.join(projectRoot, 'commands');
  if (!(await pathExists(commandsDir))) {
    return [];
  }

  const names = [];
  for (const entry of (await readdir(commandsDir, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }
    names.push(entry.name.replace(/\.md$/u, ''));
  }

  return names;
}

async function guessFixturePath(projectRoot, schemaFile) {
  if (!schemaFile.startsWith('phase9-')) {
    return null;
  }

  const fixtureDir = path.join(
    projectRoot,
    'environment',
    'tests',
    'fixtures',
    'phase9',
    schemaFile.replace(/^phase9-/u, '').replace(/\.schema\.json$/u, '')
  );
  if (!(await pathExists(fixtureDir))) {
    return null;
  }

  for (const candidate of [
    'valid-full.json',
    'valid-active.json',
    'valid-basic.json',
    'valid-mid-loop.json',
    'valid-complete.json',
    'valid-subprocess.json',
    'valid-degraded-no-kernel.json'
  ]) {
    const absolutePath = path.join(fixtureDir, candidate);
    if (await pathExists(absolutePath)) {
      return toRepoRelative(projectRoot, absolutePath);
    }
  }

  return null;
}

async function collectSchemas(projectRoot) {
  const schemasDir = path.join(projectRoot, 'environment', 'schemas');
  const entries = [];

  for (const entry of (await readdir(schemasDir, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (!entry.isFile() || !entry.name.endsWith('.schema.json')) {
      continue;
    }

    const absolutePath = path.join(schemasDir, entry.name);
    const schema = JSON.parse(await readFile(absolutePath, 'utf8'));
    entries.push({
      name: typeof schema.$id === 'string' ? schema.$id : entry.name.replace(/\.schema\.json$/u, ''),
      schemaVersion: typeof schema.$id === 'string'
        ? schema.$id
        : (schema.properties?.schemaVersion?.const ?? entry.name.replace(/\.schema\.json$/u, '')),
      path: toRepoRelative(projectRoot, absolutePath),
      fixturePath: await guessFixturePath(projectRoot, entry.name),
      owner: 'vre'
    });
  }

  return entries;
}

function toAvailabilityStatus(runtimeStatus) {
  switch (runtimeStatus) {
    case 'ok':
    case 'ready':
    case 'completed':
    case 'unknown':
      return 'available';
    default:
      return 'degraded';
  }
}

async function listJsonFilesInDirectory(directoryPath, suffix) {
  try {
    return (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function listDirectoryNames(directoryPath) {
  try {
    return (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function collectConnectors(projectRoot) {
  const degradedReasons = [];
  const manifestFiles = await listJsonFilesInDirectory(connectorManifestsDir(projectRoot), '.connector.json');
  const runtimeInstalled = await isConnectorsCoreInstalled(projectRoot);
  const healthById = new Map();

  if (runtimeInstalled) {
    try {
      const overview = await getConnectorHealthOverview(projectRoot);
      for (const entry of overview.connectors ?? []) {
        healthById.set(entry.connectorId, entry);
      }
      degradedReasons.push(...(overview.warnings ?? []));
    } catch (error) {
      degradedReasons.push(`connector health overview unavailable: ${error.message}`);
    }
  }

  const connectors = [];
  for (const fileName of manifestFiles) {
    const connectorId = fileName.replace(/\.connector\.json$/u, '');
    const relativePath = toRepoRelative(projectRoot, path.join(connectorManifestsDir(projectRoot), fileName));

    try {
      const manifest = await readConnectorManifest(projectRoot, fileName);
      const health = healthById.get(manifest.connectorId) ?? null;
      const degradedReason = !runtimeInstalled
        ? `connector ${manifest.connectorId} is degraded: connectors-core bundle is not installed`
        : health && toAvailabilityStatus(health.healthStatus) === 'degraded'
          ? `connector ${manifest.connectorId} is degraded: ${health.failureMessage ?? `health status ${health.healthStatus}`}`
          : null;

      if (degradedReason) {
        degradedReasons.push(degradedReason);
      }

      connectors.push({
        id: manifest.connectorId,
        path: relativePath,
        status: degradedReason == null ? 'available' : 'degraded',
        capabilities: Array.isArray(manifest.capabilitiesProvided)
          ? [...manifest.capabilitiesProvided].sort()
          : [],
        degradedReason
      });
    } catch (error) {
      const degradedReason = `connector ${connectorId} is degraded: ${error.message}`;
      degradedReasons.push(degradedReason);
      connectors.push({
        id: connectorId,
        path: relativePath,
        status: 'degraded',
        capabilities: [],
        degradedReason
      });
    }
  }

  return {
    connectors,
    degradedReasons
  };
}

async function collectAutomations(projectRoot) {
  const degradedReasons = [];
  const definitionFiles = await listJsonFilesInDirectory(
    automationDefinitionsDir(projectRoot),
    '.automation.json'
  );
  const runtimeInstalled = await isAutomationCoreInstalled(projectRoot);
  const overviewById = new Map();

  if (runtimeInstalled) {
    try {
      const overview = await getAutomationOverview(projectRoot);
      for (const entry of overview.automations ?? []) {
        overviewById.set(entry.automationId, entry);
      }
      degradedReasons.push(...(overview.warnings ?? []));
    } catch (error) {
      degradedReasons.push(`automation overview unavailable: ${error.message}`);
    }
  }

  const automations = [];
  for (const fileName of definitionFiles) {
    const automationId = fileName.replace(/\.automation\.json$/u, '');
    const relativePath = toRepoRelative(
      projectRoot,
      path.join(automationDefinitionsDir(projectRoot), fileName)
    );

    try {
      const definition = await readAutomationDefinition(projectRoot, fileName);
      const overview = overviewById.get(definition.automationId) ?? null;
      const degradedReason = !runtimeInstalled
        ? `automation ${definition.automationId} is degraded: automation-core bundle is not installed`
        : overview && toAvailabilityStatus(overview.status) === 'degraded'
          ? `automation ${definition.automationId} is degraded: ${overview.degradedReason ?? `runtime status ${overview.status}`}`
          : null;

      if (degradedReason) {
        degradedReasons.push(degradedReason);
      }

      automations.push({
        id: definition.automationId,
        path: relativePath,
        scheduleKind: definition.schedule?.cadence ?? definition.triggerType ?? 'unknown',
        status: degradedReason == null ? 'available' : 'degraded',
        targetCommand: definition.commandSurface ?? 'unknown'
      });
    } catch (error) {
      degradedReasons.push(`automation ${automationId} is degraded: ${error.message}`);
      automations.push({
        id: automationId,
        path: relativePath,
        scheduleKind: 'unknown',
        status: 'degraded',
        targetCommand: 'unknown'
      });
    }
  }

  return {
    automations,
    degradedReasons
  };
}

async function collectDomainPacks(projectRoot) {
  const degradedReasons = [];
  const packIds = await listDirectoryNames(domainPacksDir(projectRoot));
  const runtimeInstalled = await isDomainPacksCoreInstalled(projectRoot);
  const domainPacks = [];

  for (const packId of packIds) {
    const relativePath = toRepoRelative(projectRoot, domainPackManifestPath(projectRoot, packId));

    try {
      const manifest = await readDomainPackManifest(projectRoot, packId);
      const degradedReason = !runtimeInstalled
        ? `domain pack ${manifest.packId} is degraded: domain-packs-core bundle is not installed`
        : null;

      if (degradedReason) {
        degradedReasons.push(degradedReason);
      }

      domainPacks.push({
        id: manifest.packId,
        path: relativePath,
        domain: manifest.packId,
        status: degradedReason == null ? 'available' : 'degraded',
        exposedRules: Array.isArray(manifest.doesNotModify)
          ? [...manifest.doesNotModify].sort()
          : []
      });
    } catch (error) {
      degradedReasons.push(`domain pack ${packId} is degraded: ${error.message}`);
      domainPacks.push({
        id: packId,
        path: relativePath,
        domain: packId,
        status: 'degraded',
        exposedRules: []
      });
    }
  }

  return {
    domainPacks,
    degradedReasons
  };
}

async function collectMemoryApis(projectRoot) {
  const allowlistPath = path.join(projectRoot, 'environment', 'control', 'approved-memory-apis.json');
  const entries = JSON.parse(await readFile(allowlistPath, 'utf8'));
  const degradedReasons = [];

  const memoryApis = [];
  for (const entry of entries) {
    const absoluteModulePath = path.join(projectRoot, entry.modulePath);
    let status = 'available';
    let source = null;

    try {
      source = await readFile(absoluteModulePath, 'utf8');
    } catch {
      status = 'degraded';
      degradedReasons.push(
        `memory API ${entry.name} is reviewed but its module is unavailable: ${entry.modulePath}`
      );
    }

    if (source != null) {
      const exportNames = parseNamedExports(source);
      if (!exportNames.includes(entry.exportName)) {
        status = 'degraded';
        degradedReasons.push(
          `memory API ${entry.name} is reviewed but export ${entry.exportName} is missing from ${entry.modulePath}`
        );
      }
    }

    memoryApis.push({
      name: entry.name,
      modulePath: entry.modulePath,
      exportName: entry.exportName,
      status,
      summary: entry.summary,
      safeToExpose: Boolean(entry.safeToExpose),
      category: entry.category
    });
  }

  return {
    memoryApis,
    degradedReasons
  };
}

async function readObjectiveState(projectRoot) {
  const pointerPath = path.join(projectRoot, ACTIVE_OBJECTIVE_POINTER_PATH);
  if (!(await pathExists(pointerPath))) {
    return {
      objective: {
        activePointer: null,
        activeObjectiveId: null,
        status: null
      },
      degradedReasons: []
    };
  }

  const degradedReasons = [];
  let pointer;
  try {
    pointer = await readJson(pointerPath);
    const schemaHostRoot = await resolveSchemaHostRoot(
      projectRoot,
      'phase9-active-objective-pointer.schema.json'
    );
    const validatePointer = await loadValidator(
      schemaHostRoot,
      'phase9-active-objective-pointer.schema.json'
    );
    assertValid(validatePointer, pointer, 'phase9 active objective pointer');
  } catch (error) {
    degradedReasons.push(`objective pointer is unreadable or invalid: ${error.message}`);
    return {
      objective: {
        activePointer: ACTIVE_OBJECTIVE_POINTER_PATH,
        activeObjectiveId: null,
        status: null
      },
      degradedReasons
    };
  }

  const objectiveRelativePath = pointer.objectiveRecordPath;
  const objectiveAbsolutePath = path.join(projectRoot, objectiveRelativePath);
  if (!(await pathExists(objectiveAbsolutePath))) {
    degradedReasons.push(
      `objective pointer references a missing objective record: ${objectiveRelativePath}`
    );
    return {
      objective: {
        activePointer: ACTIVE_OBJECTIVE_POINTER_PATH,
        activeObjectiveId: pointer.objectiveId ?? null,
        status: null
      },
      degradedReasons
    };
  }

  try {
    const objectiveRecord = await readJson(objectiveAbsolutePath);
    const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, 'phase9-objective.schema.json');
    const validateObjective = await loadValidator(schemaHostRoot, 'phase9-objective.schema.json');
    assertValid(validateObjective, objectiveRecord, 'phase9 objective record');
    return {
      objective: {
        activePointer: ACTIVE_OBJECTIVE_POINTER_PATH,
        activeObjectiveId: pointer.objectiveId ?? objectiveRecord.objectiveId ?? null,
        status: objectiveRecord.status ?? null
      },
      degradedReasons
    };
  } catch (error) {
    degradedReasons.push(
      `objective record referenced by the active pointer is unreadable or invalid: ${objectiveRelativePath}`
    );
    return {
      objective: {
        activePointer: ACTIVE_OBJECTIVE_POINTER_PATH,
        activeObjectiveId: pointer.objectiveId ?? null,
        status: null
      },
      degradedReasons
    };
  }
}

function buildUnavailableProbe(name, degradedReason) {
  return {
    name,
    status: 'unavailable',
    schemaVersion: KERNEL_PROJECTION_SCHEMA_VERSION,
    sourceTimestamp: null,
    degradedReason,
    fixturePath: PROJECTION_PROBE_FIXTURE_PATH
  };
}

function determineKernelMode({ kernelRoot, readerDbAvailable, availableCount }) {
  if (!kernelRoot) {
    return 'missing';
  }
  if (!readerDbAvailable || availableCount !== KERNEL_PROJECTION_NAMES.length) {
    return 'degraded';
  }
  return 'full';
}

async function buildKernelSection(projectRoot, options = {}) {
  const degradedReasons = [];
  const cliMetadata = await loadCliMetadata(projectRoot);
  const discovery = options.kernelRoot !== undefined
    ? { kernelRoot: options.kernelRoot, source: 'override' }
    : cliMetadata.resolveKernelRoot(projectRoot);
  const reader = await resolveKernelReader({
    kernelRoot: discovery.kernelRoot
  });

  const probes = [];
  const unavailable = [];
  const availableNames = [];
  const valuesByProjection = new Map();

  for (const projectionName of KERNEL_PROJECTION_NAMES) {
    if (typeof reader[projectionName] !== 'function') {
      const degradedReason = reader.error ?? `kernel bridge is missing projection ${projectionName}`;
      probes.push(buildUnavailableProbe(projectionName, degradedReason));
      unavailable.push({ name: projectionName, reason: degradedReason });
      continue;
    }

    try {
      const data = await reader[projectionName]();
      const sourceTimestamp = latestIsoTimestamp(data);
      probes.push({
        name: projectionName,
        status: 'available',
        schemaVersion: KERNEL_PROJECTION_SCHEMA_VERSION,
        sourceTimestamp,
        degradedReason: null,
        fixturePath: PROJECTION_PROBE_FIXTURE_PATH
      });
      valuesByProjection.set(projectionName, data);
      availableNames.push(projectionName);
    } catch (error) {
      const degradedReason = error?.message ?? String(error);
      probes.push(buildUnavailableProbe(projectionName, degradedReason));
      unavailable.push({ name: projectionName, reason: degradedReason });
    }
  }

  const mode = determineKernelMode({
    kernelRoot: discovery.kernelRoot,
    readerDbAvailable: Boolean(reader.dbAvailable),
    availableCount: availableNames.length
  });
  const unreachableReason = mode === 'full'
    ? null
    : (reader.error ?? unavailable[0]?.reason ?? `kernel ${mode}`);

  if (mode !== 'full' && unreachableReason) {
    degradedReasons.push(`kernel ${mode}: ${unreachableReason}`);
  }

  const alerts = valuesByProjection.get('listObserverAlerts');
  const alertsCount = Array.isArray(alerts) ? alerts.length : 0;

  const unresolvedClaims = valuesByProjection.get('listUnresolvedClaims');
  const unresolvedR2Count = Array.isArray(unresolvedClaims) ? unresolvedClaims.length : 0;
  if (Array.isArray(unresolvedClaims)) {
    degradedReasons.push(
      'kernel unresolvedR2Count is currently derived from listUnresolvedClaims until a dedicated R2 projection lands'
    );
  } else {
    degradedReasons.push(
      'kernel unresolvedR2Count is unavailable because listUnresolvedClaims is not currently available'
    );
  }

  const lastKernelActivity = latestIsoTimestamp([...valuesByProjection.values()]);

  return {
    kernel: {
      mode,
      dbAvailable: Boolean(reader.dbAvailable),
      unreachableReason,
      projections: {
        probes,
        availableNames: uniqueSorted(availableNames),
        unavailable
      },
      alertsCount,
      unresolvedR2Count,
      lastKernelActivity
    },
    degradedReasons
  };
}

async function buildMissingSurfaces(projectRoot) {
  const missing = [];
  for (const rule of REVIEWED_MISSING_SURFACE_RULES) {
    if (!(await rule.present(projectRoot))) {
      missing.push(rule.surface);
    }
  }
  return uniqueSorted(missing);
}

export async function generateCapabilityHandshake(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, HANDSHAKE_SCHEMA_FILE);
  const vrePresent = await detectVrePresence(projectRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const degradedReasons = [];

  const handshake = {
    schemaVersion: HANDSHAKE_SCHEMA_VERSION,
    generatedAt,
    vrePresent,
    vrePath: vrePresent ? projectRoot : null,
    kernel: {
      mode: 'missing',
      dbAvailable: false,
      unreachableReason: 'VRE root unavailable',
      projections: {
        probes: KERNEL_PROJECTION_NAMES.map((projectionName) =>
          buildUnavailableProbe(projectionName, 'VRE root unavailable')
        ),
        availableNames: [],
        unavailable: KERNEL_PROJECTION_NAMES.map((projectionName) => ({
          name: projectionName,
          reason: 'VRE root unavailable'
        }))
      },
      alertsCount: 0,
      unresolvedR2Count: 0,
      lastKernelActivity: null
    },
    vre: {
      executableCommands: [],
      markdownOnlyContracts: [],
      queueableTaskKinds: [],
      schemas: [],
      connectors: [],
      automations: [],
      domainPacks: [],
      memoryApis: [],
      operatorSurface: {
        commands: [],
        doctorCommands: [],
        artifactPaths: []
      },
      missingSurfaces: []
    },
    objective: {
      activePointer: null,
      activeObjectiveId: null,
      status: null
    },
    memory: {
      fresh: false,
      lastSyncAt: null
    },
    degradedReasons: []
  };

  if (!vrePresent) {
    degradedReasons.push('VRE_MISSING: target root is unavailable or does not look like vibe-research-environment');
  } else {
    const cliMetadata = await loadCliMetadata(projectRoot);
    const executableCommands = uniqueSorted(Object.keys(cliMetadata.DISPATCH_TABLE));
    const markdownContracts = await collectMarkdownContracts(projectRoot);
    const markdownOnlyContracts = markdownContracts.filter(
      (commandName) => !Object.prototype.hasOwnProperty.call(cliMetadata.DISPATCH_TABLE, commandName)
    );

    handshake.vre.executableCommands = executableCommands;
    handshake.vre.markdownOnlyContracts = uniqueSorted(markdownOnlyContracts);
    handshake.vre.operatorSurface = {
      commands: uniqueSorted(
        cliMetadata.PHASE9_STUB_DEFINITIONS
          .filter((definition) => definition.kind !== 'doctor-surface')
          .map((definition) => definition.canonicalCommand)
      ),
      doctorCommands: uniqueSorted(
        cliMetadata.PHASE9_STUB_DEFINITIONS
          .filter((definition) => definition.kind === 'doctor-surface')
          .map((definition) => definition.canonicalCommand)
      ),
      artifactPaths: [...OPERATOR_ARTIFACT_PATHS]
    };
    handshake.vre.missingSurfaces = await buildMissingSurfaces(projectRoot);

    try {
      const registry = await getTaskRegistry();
      handshake.vre.queueableTaskKinds = uniqueSorted([...registry.keys()]);
    } catch (error) {
      degradedReasons.push(`task registry unavailable: ${error.message}`);
    }

    handshake.vre.schemas = await collectSchemas(projectRoot);
    const connectorState = await collectConnectors(projectRoot);
    handshake.vre.connectors = connectorState.connectors;
    degradedReasons.push(...connectorState.degradedReasons);

    const automationState = await collectAutomations(projectRoot);
    handshake.vre.automations = automationState.automations;
    degradedReasons.push(...automationState.degradedReasons);

    const domainPackState = await collectDomainPacks(projectRoot);
    handshake.vre.domainPacks = domainPackState.domainPacks;
    degradedReasons.push(...domainPackState.degradedReasons);

    const { memoryApis, degradedReasons: memoryDegradedReasons } = await collectMemoryApis(projectRoot);
    handshake.vre.memoryApis = memoryApis;
    degradedReasons.push(...memoryDegradedReasons);

    const objectiveState = await readObjectiveState(projectRoot);
    handshake.objective = objectiveState.objective;
    degradedReasons.push(...objectiveState.degradedReasons);

    const memoryFreshness = await getMemoryFreshness(projectRoot);
    handshake.memory = {
      fresh: Boolean(memoryFreshness.hasSyncState) &&
        memoryFreshness.status === 'ok' &&
        memoryFreshness.isStale === false,
      lastSyncAt: memoryFreshness.lastSyncAt ?? null
    };
    if (memoryFreshness.warning) {
      degradedReasons.push(memoryFreshness.warning);
    }

    const kernelSection = await buildKernelSection(projectRoot, options);
    handshake.kernel = kernelSection.kernel;
    degradedReasons.push(...kernelSection.degradedReasons);
  }

  handshake.degradedReasons = uniqueSorted(
    degradedReasons.filter((reason) => typeof reason === 'string' && reason.trim() !== '')
  );

  const validate = await loadValidator(schemaHostRoot, HANDSHAKE_SCHEMA_FILE);
  assertValid(validate, handshake, 'phase9 capability handshake');
  return handshake;
}

export const INTERNALS = {
  buildMissingSurfaces,
  collectAutomations,
  collectConnectors,
  collectDomainPacks,
  collectIsoTimestamps,
  collectMarkdownContracts,
  collectMemoryApis,
  collectSchemas,
  latestIsoTimestamp,
  parseNamedExports,
  readObjectiveState
};
