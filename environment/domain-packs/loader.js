import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';

const DOMAIN_PACKS_CORE_BUNDLE = 'domain-packs-core';
const DOMAIN_PACK_SCHEMA = 'domain-pack.schema.json';
const DOMAIN_CONFIG_SCHEMA = 'domain-config.schema.json';
const DOMAIN_PACK_MANIFEST_FILE = 'pack.domain-pack.json';
const DOMAIN_PACKS_SEGMENTS = ['environment', 'domain-packs'];
const DOMAIN_CONFIG_SEGMENTS = ['.vibe-science-environment', 'domain-config.json'];

export function domainPacksDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...DOMAIN_PACKS_SEGMENTS);
}

export function domainPackDir(projectPath, packId) {
  return resolveInside(domainPacksDir(projectPath), packId);
}

export function domainPackManifestPath(projectPath, packId) {
  return resolveInside(domainPackDir(projectPath, packId), DOMAIN_PACK_MANIFEST_FILE);
}

export function domainConfigPath(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...DOMAIN_CONFIG_SEGMENTS);
}

export async function readInstalledBundles(projectPath) {
  const installStatePath = resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    '.install-state.json',
  );

  try {
    const installState = await readJson(installStatePath);
    return Array.isArray(installState.bundles) ? [...installState.bundles] : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function isDomainPacksCoreInstalled(projectPath) {
  return (await readInstalledBundles(projectPath)).includes(DOMAIN_PACKS_CORE_BUNDLE);
}

export async function listDomainPackIds(projectPath) {
  if (!(await isDomainPacksCoreInstalled(projectPath))) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(domainPacksDir(projectPath), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const packIds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    packIds.push(entry.name);
  }

  return packIds.sort((left, right) => left.localeCompare(right));
}

export async function validateDomainPack(projectPath, pack, options = {}) {
  const validate = await loadValidator(projectPath, DOMAIN_PACK_SCHEMA);
  assertValid(validate, pack, options.context ?? 'domain pack');
  return pack;
}

export async function validateDomainConfig(projectPath, config, options = {}) {
  const validate = await loadValidator(projectPath, DOMAIN_CONFIG_SCHEMA);
  assertValid(validate, config, options.context ?? 'domain config');
  return config;
}

export async function readDomainPackManifest(projectPath, packId) {
  const pack = await readJson(domainPackManifestPath(projectPath, packId));
  await validateDomainPack(projectPath, pack, {
    context: `Domain pack ${packId}`,
  });

  if (pack.packId !== packId) {
    throw new Error(`Domain pack directory mismatch: ${packId} declares packId ${pack.packId}.`);
  }

  return {
    ...pack,
    manifestPath: toProjectRelativePath('environment', 'domain-packs', packId, DOMAIN_PACK_MANIFEST_FILE),
  };
}

export async function readDomainConfig(projectPath) {
  try {
    const config = await readJson(domainConfigPath(projectPath));
    await validateDomainConfig(projectPath, config, {
      context: 'domain config',
    });
    return config;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeDomainConfig(projectPath, config) {
  await validateDomainConfig(projectPath, config, {
    context: 'domain config',
  });

  const configPath = domainConfigPath(projectPath);
  await mkdir(path.dirname(configPath), { recursive: true });
  await atomicWriteJson(configPath, config);
  return configPath;
}

export function buildDomainConfigFromPack(pack, options = {}) {
  const deliverablePresets = deriveDeliverablePresets(pack.deliverableTemplates ?? []);

  return {
    schemaVersion: 'vibe-env.domain-config.v1',
    activePackId: pack.packId,
    displayName: options.displayName ?? pack.displayName,
    updatedAt: options.updatedAt ?? now(),
    authorityBoundary: 'presets-only',
    literatureSources: cloneValue(pack.literatureSources ?? []),
    workflowPresets: {
      defaultExperimentFields: cloneValue(pack.experimentPresets?.defaultFields ?? []),
      commonConfounders: cloneValue(pack.experimentPresets?.commonConfounders ?? []),
    },
    deliverablePresets,
    expectedConnectors: cloneValue(pack.expectedConnectors ?? []),
  };
}

function deriveDeliverablePresets(deliverableTemplates) {
  const templates = Array.isArray(deliverableTemplates)
    ? deliverableTemplates.map((entry) => String(entry))
    : [];

  const reportTemplate = templates[0] ?? null;
  const writingPackTemplate =
    templates.find((entry) => /advisor|writing/u.test(entry)) ??
    templates[1] ??
    null;

  return {
    reportTemplate,
    writingPackTemplate,
  };
}

function toProjectRelativePath(...segments) {
  return path.posix.join(
    ...segments.map((segment) => String(segment).replaceAll('\\', '/')),
  );
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
