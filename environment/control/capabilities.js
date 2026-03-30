/**
 * Capability snapshot — tracks what the kernel exposes and what's installed.
 * Unknown advanced features default to false (spec Doc 03A).
 */

import path from 'node:path';
import {
  controlDir, readJson, atomicWriteJson,
  loadValidator, assertValid, now
} from './_io.js';

const SCHEMA = 'capabilities-snapshot.schema.json';
const FILE   = 'capabilities.json';

function filePath(projectPath) {
  return path.join(controlDir(projectPath), FILE);
}

function conservativeDefaults() {
  return {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: false,
      projections: {
        overview: false,
        claimHeads: false,
        unresolvedClaims: false,
        citationChecks: false
      },
      advanced: {
        governanceProfileAtCreation: false,
        claimSearch: false
      }
    },
    install: { bundles: [] },
    updatedAt: now()
  };
}

export async function getCapabilitiesSnapshot(projectPath) {
  try {
    return await readJson(filePath(projectPath));
  } catch (err) {
    if (err.code === 'ENOENT') return conservativeDefaults();
    throw err;
  }
}

export async function publishCapabilitiesSnapshot(projectPath, snapshot) {
  const validate = await loadValidator(projectPath, SCHEMA);
  assertValid(validate, snapshot, 'capabilities snapshot');
  await atomicWriteJson(filePath(projectPath), snapshot);
  return snapshot;
}

export async function refreshCapabilitiesSnapshot(projectPath, reader) {
  const probed = {
    schemaVersion: 'vibe-env.capabilities.v1',
    kernel: {
      dbAvailable: Boolean(reader?.dbAvailable),
      projections: {
        overview: false,
        claimHeads: false,
        unresolvedClaims: false,
        citationChecks: false
      },
      advanced: {
        governanceProfileAtCreation: false,
        claimSearch: false
      }
    },
    install: { bundles: [] },
    updatedAt: now()
  };

  if (reader?.dbAvailable) {
    // Probe each projection — call it and see if it returns usable data
    const probe = async (fn) => {
      try { const r = await fn(); return r !== null && r !== undefined; }
      catch { return false; }
    };
    probed.kernel.projections.overview         = await probe(() => reader.getProjectOverview());
    probed.kernel.projections.claimHeads        = await probe(() => reader.listClaimHeads());
    probed.kernel.projections.unresolvedClaims  = await probe(() => reader.listUnresolvedClaims());
    probed.kernel.projections.citationChecks    = await probe(() => reader.listCitationChecks());
  }

  return publishCapabilitiesSnapshot(projectPath, probed);
}
