import {
  atomicWriteJson,
  assertValid,
  controlDir,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot
} from './_io.js';

const SCHEMA_FILE = 'capabilities-snapshot.schema.json';
const CAPABILITIES_FILE = 'capabilities.json';

function capabilitiesPath(projectPath) {
  return resolveInside(controlDir(projectPath), CAPABILITIES_FILE);
}

function advancedDefaults() {
  return {
    governanceProfileAtCreation: false,
    claimSearch: false
  };
}

function projectionDefaults() {
  return {
    overview: false,
    claimHeads: false,
    unresolvedClaims: false,
    citationChecks: false
  };
}

async function detectBundlesFromInstallState(projectPath) {
  const installStatePath = resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    '.install-state.json'
  );

  try {
    const installState = await readJson(installStatePath);
    if (Array.isArray(installState.bundles)) {
      return [...installState.bundles].sort();
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return null;
}

async function detectInstalledBundles(projectPath) {
  return (await detectBundlesFromInstallState(projectPath)) ?? [];
}

function extractAdvancedCapabilities(reader) {
  const defaults = advancedDefaults();
  const sources = [reader?.capabilities, reader?.advancedCapabilities];

  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const key of Object.keys(defaults)) {
      if (typeof source[key] === 'boolean') {
        defaults[key] = source[key];
      }
    }
  }

  return defaults;
}

async function probeProjection(candidate) {
  if (typeof candidate !== 'function') {
    return false;
  }

  try {
    const result = await candidate();
    return result !== null && result !== undefined;
  } catch {
    return false;
  }
}

async function buildConservativeSnapshot(projectPath) {
  return {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: false,
      projections: projectionDefaults(),
      advanced: advancedDefaults()
    },
    install: {
      bundles: await detectInstalledBundles(projectPath)
    },
    updatedAt: now()
  };
}

export async function getCapabilitiesSnapshot(projectPath) {
  try {
    return await readJson(capabilitiesPath(projectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return buildConservativeSnapshot(projectPath);
    }

    throw error;
  }
}

export async function publishCapabilitiesSnapshot(projectPath, snapshot) {
  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, snapshot, 'capabilities snapshot');
  await atomicWriteJson(capabilitiesPath(projectPath), snapshot);
  return snapshot;
}

export async function refreshCapabilitiesSnapshot(projectPath, reader) {
  const snapshot = await buildConservativeSnapshot(projectPath);
  snapshot.kernel.dbAvailable = Boolean(reader?.dbAvailable);

  if (snapshot.kernel.dbAvailable) {
    snapshot.kernel.projections = {
      overview: await probeProjection(() => reader.getProjectOverview?.()),
      claimHeads: await probeProjection(() => reader.listClaimHeads?.()),
      unresolvedClaims: await probeProjection(() => reader.listUnresolvedClaims?.()),
      citationChecks: await probeProjection(() => reader.listCitationChecks?.())
    };
  }

  snapshot.kernel.advanced = extractAdvancedCapabilities(reader);
  snapshot.updatedAt = now();

  return publishCapabilitiesSnapshot(projectPath, snapshot);
}

export const INTERNALS = {
  advancedDefaults,
  detectInstalledBundles,
  extractAdvancedCapabilities,
  projectionDefaults
};
