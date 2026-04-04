import { getDomainPackById, getDomainPackRegistry } from './index.js';
import {
  buildDomainConfigFromPack,
  readDomainConfig,
  writeDomainConfig,
} from './loader.js';

const DEFAULT_WORKFLOW_PRESETS = Object.freeze({
  defaultExperimentFields: [],
  commonConfounders: [],
});

const DEFAULT_DELIVERABLE_PRESETS = Object.freeze({
  reportTemplate: null,
  writingPackTemplate: null,
});

export async function activateDomainPack(projectPath, packId, options = {}) {
  const pack = await getDomainPackById(projectPath, packId);
  const config = buildDomainConfigFromPack(pack, {
    displayName: options.displayName,
    updatedAt: options.updatedAt,
  });

  await writeDomainConfig(projectPath, config);
  return getDomainPackOverview(projectPath);
}

export async function getDomainPackOverview(projectPath) {
  try {
    const registry = await getDomainPackRegistry(projectPath);
    if (!registry.runtimeInstalled) {
      return buildDefaultOverview({
        runtimeInstalled: false,
        warnings: registry.warnings,
      });
    }

    let config;
    try {
      config = await readDomainConfig(projectPath);
    } catch (error) {
      return buildDefaultOverview({
        runtimeInstalled: true,
        configState: 'invalid',
        warnings: [`Ignoring invalid domain config: ${error.message}`],
      });
    }

    if (config == null) {
      return buildDefaultOverview({
        runtimeInstalled: true,
        configState: 'inactive',
        warnings: registry.warnings,
      });
    }

    const pack = registry.packs.find((entry) => entry.packId === config.activePackId) ?? null;
    if (pack == null) {
      return buildDefaultOverview({
        runtimeInstalled: true,
        hasActivation: true,
        configState: 'unknown-pack',
        configPath: toProjectRelativeConfigPath(),
        warnings: [
          ...registry.warnings,
          `Ignoring unknown active domain pack ${config.activePackId}; using default presets.`,
        ],
      });
    }

    return {
      runtimeInstalled: true,
      hasActivation: true,
      configState: 'resolved',
      configPath: toProjectRelativeConfigPath(),
      activePackId: pack.packId,
      displayName: config.displayName,
      manifestPath: pack.manifestPath,
      authorityBoundary: config.authorityBoundary,
      literatureSources: cloneValue(config.literatureSources ?? []),
      workflowPresets: cloneValue(config.workflowPresets ?? DEFAULT_WORKFLOW_PRESETS),
      deliverablePresets: cloneValue(config.deliverablePresets ?? DEFAULT_DELIVERABLE_PRESETS),
      expectedConnectors: cloneValue(config.expectedConnectors ?? pack.expectedConnectors ?? []),
      advisoryHints: cloneValue(pack.advisoryHints ?? []),
      domainAssumptions: cloneValue(pack.domainAssumptions ?? []),
      supportedWorkflows: cloneValue(pack.supportedWorkflows ?? []),
      doesNotModify: cloneValue(pack.doesNotModify ?? []),
      updatedAt: config.updatedAt ?? null,
      warnings: registry.warnings,
    };
  } catch (error) {
    return buildDefaultOverview({
      runtimeInstalled: true,
      configState: 'unavailable',
      warnings: [`Domain-pack registry unavailable: ${error.message}`],
    });
  }
}

export async function getLiteratureDomainPresets(projectPath) {
  const overview = await getDomainPackOverview(projectPath);
  return {
    activePackId: overview.activePackId,
    displayName: overview.displayName,
    literatureSources: cloneValue(overview.literatureSources),
    advisoryHints: cloneValue(overview.advisoryHints),
    warnings: cloneValue(overview.warnings),
  };
}

export async function getExperimentDomainPresets(projectPath) {
  const overview = await getDomainPackOverview(projectPath);
  return {
    activePackId: overview.activePackId,
    displayName: overview.displayName,
    defaultExperimentFields: cloneValue(overview.workflowPresets.defaultExperimentFields),
    commonConfounders: cloneValue(overview.workflowPresets.commonConfounders),
    advisoryHints: cloneValue(overview.advisoryHints),
    warnings: cloneValue(overview.warnings),
  };
}

export async function getResultsDomainPresets(projectPath) {
  const overview = await getDomainPackOverview(projectPath);
  return {
    activePackId: overview.activePackId,
    displayName: overview.displayName,
    reportTemplate: overview.deliverablePresets.reportTemplate,
    advisoryHints: cloneValue(overview.advisoryHints),
    warnings: cloneValue(overview.warnings),
  };
}

export async function getWritingDomainPresets(projectPath) {
  const overview = await getDomainPackOverview(projectPath);
  return {
    activePackId: overview.activePackId,
    displayName: overview.displayName,
    writingPackTemplate: overview.deliverablePresets.writingPackTemplate,
    commonConfounders: cloneValue(overview.workflowPresets.commonConfounders),
    advisoryHints: cloneValue(overview.advisoryHints),
    warnings: cloneValue(overview.warnings),
  };
}

function buildDefaultOverview({
  runtimeInstalled,
  hasActivation = false,
  configState = 'inactive',
  configPath = null,
  warnings = [],
}) {
  return {
    runtimeInstalled,
    hasActivation,
    configState,
    configPath,
    activePackId: null,
    displayName: 'Default Presets',
    manifestPath: null,
    authorityBoundary: 'presets-only',
    literatureSources: [],
    workflowPresets: cloneValue(DEFAULT_WORKFLOW_PRESETS),
    deliverablePresets: cloneValue(DEFAULT_DELIVERABLE_PRESETS),
    expectedConnectors: [],
    advisoryHints: [],
    domainAssumptions: [],
    supportedWorkflows: [],
    doesNotModify: [],
    updatedAt: null,
    warnings: cloneValue(warnings),
  };
}

function toProjectRelativeConfigPath() {
  return '.vibe-science-environment/domain-config.json';
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
