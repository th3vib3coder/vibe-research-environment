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
import { logGovernanceEventViaPlugin } from '../orchestrator/governance-logger.js';
import { KernelBridgeContractMismatchError } from '../lib/kernel-bridge.js';

const SCHEMA_FILE = 'capabilities-snapshot.schema.json';
const CAPABILITIES_FILE = 'capabilities.json';
const CAPABILITIES_GOVERNANCE_SOURCE_COMPONENT = 'vre/control/capabilities';
const CAPABILITIES_PROJECTION_METHODS = Object.freeze({
  overview: 'getProjectOverview',
  claimHeads: 'listClaimHeads',
  unresolvedClaims: 'listUnresolvedClaims',
  citationChecks: 'listCitationChecks'
});

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
    citationChecks: false,
    truthMismatch: []
  };
}

async function recordKernelTruthMismatchGovernanceEvent(projectionName) {
  try {
    await logGovernanceEventViaPlugin({
      event_type: 'kernel_vre_truth_mismatch',
      objective_id: null,
      source_component: CAPABILITIES_GOVERNANCE_SOURCE_COMPONENT,
      severity: 'critical',
      details: {
        projectionName,
        errorClass: 'KernelBridgeContractMismatchError'
      }
    });
  } catch (error) {
    const code = error?.code ?? error?.name ?? 'UNKNOWN';
    process.stderr.write(`[phase9-governance] kernel_vre_truth_mismatch telemetry failed: ${code}\n`);
  }
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

async function probeProjection(candidate, { projectionKey, projectionName, truthMismatch }) {
  if (typeof candidate !== 'function') {
    return false;
  }

  try {
    const result = await candidate();
    return result !== null && result !== undefined;
  } catch (error) {
    if (error instanceof KernelBridgeContractMismatchError) {
      await recordKernelTruthMismatchGovernanceEvent(projectionName);
      truthMismatch.push(projectionKey);
    }
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
    const truthMismatch = [];
    snapshot.kernel.projections = {
      overview: await probeProjection(() => reader.getProjectOverview?.(), {
        projectionKey: 'overview',
        projectionName: CAPABILITIES_PROJECTION_METHODS.overview,
        truthMismatch
      }),
      claimHeads: await probeProjection(() => reader.listClaimHeads?.(), {
        projectionKey: 'claimHeads',
        projectionName: CAPABILITIES_PROJECTION_METHODS.claimHeads,
        truthMismatch
      }),
      unresolvedClaims: await probeProjection(() => reader.listUnresolvedClaims?.(), {
        projectionKey: 'unresolvedClaims',
        projectionName: CAPABILITIES_PROJECTION_METHODS.unresolvedClaims,
        truthMismatch
      }),
      citationChecks: await probeProjection(() => reader.listCitationChecks?.(), {
        projectionKey: 'citationChecks',
        projectionName: CAPABILITIES_PROJECTION_METHODS.citationChecks,
        truthMismatch
      }),
      truthMismatch
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
