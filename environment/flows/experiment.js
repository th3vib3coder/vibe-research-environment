import {
  readFlowIndex,
  writeFlowIndex,
  writeFlowState
} from '../lib/flow-state.js';
import {
  createManifest,
  listManifests,
  updateManifest
} from '../lib/manifest.js';
import { getExperimentDomainPresets } from '../domain-packs/resolver.js';
import { discoverBundlesByExperiment } from './results-discovery.js';

const FLOW_NAME = 'experiment';

const COMMAND_NAMES = {
  list: '/flow-experiment',
  register: '/flow-experiment --register',
  update: '/flow-experiment --update',
  blockers: '/flow-experiment --blockers'
};

function cloneValue(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function summarizeManifest(manifest) {
  return {
    id: manifest.experimentId,
    title: manifest.title,
    status: manifest.status,
    createdAt: manifest.createdAt,
    latestAttemptId: manifest.latestAttemptId ?? null,
    relatedClaims: cloneValue(manifest.relatedClaims ?? []),
    outputArtifacts: cloneValue(manifest.outputArtifacts ?? []),
    blockers: cloneValue(manifest.blockers ?? [])
  };
}

function stageFromManifests(manifests) {
  if (manifests.some((manifest) => manifest.status === 'blocked' && manifest.blockers.length > 0)) {
    return 'experiment-blocked';
  }

  if (manifests.some((manifest) => manifest.status === 'active')) {
    return 'experiment-running';
  }

  if (manifests.some((manifest) => manifest.status === 'planned')) {
    return 'experiment-planning';
  }

  if (manifests.some((manifest) => manifest.status === 'completed')) {
    return 'experiment-review';
  }

  return null;
}

function blockersFromManifests(manifests, options = {}) {
  const blockers = [];

  for (const manifest of manifests) {
    if (manifest.status !== 'blocked') {
      continue;
    }

    for (const blocker of manifest.blockers) {
      blockers.push(`${manifest.experimentId}: ${blocker}`);
    }
  }

  const unresolvedClaimIds = normalizeClaimIds(options.unresolvedClaims);
  for (const manifest of manifests) {
    for (const claimId of manifest.relatedClaims) {
      if (unresolvedClaimIds.has(claimId)) {
        blockers.push(`${manifest.experimentId}: linked claim ${claimId} is unresolved`);
      }
    }
  }

  for (const gateCheck of normalizeGateChecks(options.gateChecks)) {
    blockers.push(gateCheck);
  }

  return uniqueStrings(blockers).slice(0, 5);
}

function nextActionsFromManifests(manifests) {
  const actions = [];

  for (const manifest of manifests) {
    if (manifest.status === 'blocked' && manifest.blockers.length > 0) {
      actions.push(`resolve blockers for ${manifest.experimentId}`);
      continue;
    }

    if (manifest.status === 'planned') {
      actions.push(`start ${manifest.experimentId}`);
      continue;
    }

    if (manifest.status === 'active') {
      actions.push(`review outputs for ${manifest.experimentId}`);
      continue;
    }

    if (manifest.status === 'completed') {
      actions.push(`review ${manifest.experimentId} results`);
    }
  }

  if (actions.length === 0) {
    actions.push('register a new experiment manifest');
  }

  return uniqueStrings(actions).slice(0, 5);
}

function matchesFilters(manifest, filters = {}) {
  if (filters.status && manifest.status !== filters.status) {
    return false;
  }

  if (filters.claimId && !manifest.relatedClaims.includes(filters.claimId)) {
    return false;
  }

  return true;
}

async function syncExperimentState(projectPath, manifests, options = {}) {
  const summary = {
    experiments: manifests.map(summarizeManifest),
    updatedAt: new Date().toISOString()
  };

  const timestamp = options.timestamp ?? summary.updatedAt;
  const blockers = blockersFromManifests(manifests, options);
  const nextActions = nextActionsFromManifests(manifests);
  const index = await readFlowIndex(projectPath);

  const nextIndex = {
    ...index,
    schemaVersion: index.schemaVersion ?? 'vibe.flow.index.v1',
    activeFlow: FLOW_NAME,
    currentStage: stageFromManifests(manifests),
    nextActions,
    blockers,
    lastCommand: options.commandName ?? COMMAND_NAMES.list,
    updatedAt: timestamp
  };

  await writeFlowState(projectPath, FLOW_NAME, summary);
  await writeFlowIndex(projectPath, nextIndex);

  return {
    summary,
    index: nextIndex,
    blockers,
    nextActions
  };
}

export async function registerExperiment(projectPath, data, options = {}) {
  const domain = await getExperimentDomainPresets(projectPath);
  const manifest = await createManifest(projectPath, data);
  const synced = await syncExperimentState(projectPath, await listManifests(projectPath), {
    ...options,
    commandName: COMMAND_NAMES.register
  });
  return {
    manifest,
    domain,
    summary: synced.summary,
    index: synced.index
  };
}

export async function updateExperiment(projectPath, experimentId, patch, options = {}) {
  const domain = await getExperimentDomainPresets(projectPath);
  const manifest = await updateManifest(projectPath, experimentId, patch);
  const synced = await syncExperimentState(projectPath, await listManifests(projectPath), {
    ...options,
    commandName: COMMAND_NAMES.update
  });
  return {
    manifest,
    domain,
    summary: synced.summary,
    index: synced.index
  };
}

export async function listExperiments(projectPath, filters = {}, options = {}) {
  const domain = await getExperimentDomainPresets(projectPath);
  const manifests = await listManifests(projectPath);
  const synced = await syncExperimentState(projectPath, manifests, {
    ...options,
    commandName: COMMAND_NAMES.list
  });

  const filtered = manifests.filter((manifest) => matchesFilters(manifest, filters));
  const limit = Number.isInteger(filters.limit) && filters.limit >= 0 ? filters.limit : null;
  const visible = limit == null ? filtered : filtered.slice(0, limit);

  return {
    domain,
    experiments: await buildViewSummaries(projectPath, visible),
    summary: synced.summary,
    index: synced.index
  };
}

export async function surfaceBlockers(projectPath, options = {}) {
  const domain = await getExperimentDomainPresets(projectPath);
  const manifests = await listManifests(projectPath);
  const synced = await syncExperimentState(projectPath, manifests, {
    ...options,
    commandName: COMMAND_NAMES.blockers
  });

  const blockers = manifests
    .filter((manifest) => {
      if (manifest.status !== (options.status ?? 'blocked')) {
        return false;
      }

      if (options.claimId && !manifest.relatedClaims.includes(options.claimId)) {
        return false;
      }

      return manifest.blockers.length > 0;
    })
    ;

  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : null;
  const visible = limit == null ? blockers : blockers.slice(0, limit);

  return {
    domain,
    blockers: await buildViewSummaries(projectPath, visible),
    blockerMessages: synced.blockers,
    summary: synced.summary,
    index: synced.index
  };
}

async function buildViewSummaries(projectPath, manifests) {
  if (!Array.isArray(manifests) || manifests.length === 0) {
    return [];
  }

  const { bundlesByExperiment } = await discoverBundlesByExperiment(
    projectPath,
    manifests.map((manifest) => manifest.experimentId)
  );

  return manifests.map((manifest) => {
    const summary = summarizeManifest(manifest);
    const resultBundle = bundlesByExperiment.get(manifest.experimentId) ?? null;
    return resultBundle == null
      ? summary
      : {
          ...summary,
          resultBundle
        };
  });
}

function normalizeClaimIds(unresolvedClaims) {
  if (!Array.isArray(unresolvedClaims)) {
    return new Set();
  }

  const claimIds = unresolvedClaims
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        return entry.claimId ?? entry.id ?? null;
      }
      return null;
    })
    .filter((value) => typeof value === 'string' && value.trim() !== '');

  return new Set(claimIds);
}

function normalizeGateChecks(gateChecks) {
  if (!Array.isArray(gateChecks)) {
    return [];
  }

  return gateChecks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const experimentId = typeof entry.experimentId === 'string' ? entry.experimentId : null;
    const status = typeof entry.status === 'string' ? entry.status : null;
    if (status && status.toUpperCase() !== 'FAIL') {
      return [];
    }

    const message = entry.message ?? entry.reason ?? entry.gateName ?? entry.name ?? null;
    if (typeof message !== 'string' || message.trim() === '') {
      return [];
    }

    return [`${experimentId ?? 'gate-check'}: ${message.trim()}`];
  });
}

function uniqueStrings(values) {
  return [...new Set(values)];
}
