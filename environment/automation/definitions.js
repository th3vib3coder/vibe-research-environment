import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  loadValidator,
  readJson,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';

const AUTOMATION_CORE_BUNDLE = 'automation-core';
const AUTOMATION_DEFINITION_SCHEMA = 'automation-definition.schema.json';
const AUTOMATION_DEFINITION_SUFFIX = '.automation.json';
const AUTOMATION_DEFINITIONS_SEGMENTS = ['environment', 'automation', 'definitions'];
const AUTOMATION_RUNS_SEGMENTS = ['.vibe-science-environment', 'automation', 'runs'];
const AUTOMATION_ARTIFACTS_SEGMENTS = ['.vibe-science-environment', 'automation', 'artifacts'];

export function automationDefinitionsDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...AUTOMATION_DEFINITIONS_SEGMENTS);
}

export function automationRunsDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...AUTOMATION_RUNS_SEGMENTS);
}

export function automationArtifactsDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...AUTOMATION_ARTIFACTS_SEGMENTS);
}

export function automationRunLogPath(projectPath, automationId) {
  return resolveInside(automationRunsDir(projectPath), `${automationId}.jsonl`);
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

export async function isAutomationCoreInstalled(projectPath) {
  return (await readInstalledBundles(projectPath)).includes(AUTOMATION_CORE_BUNDLE);
}

export async function listAutomationDefinitionFiles(projectPath) {
  if (!(await isAutomationCoreInstalled(projectPath))) {
    return [];
  }

  const entries = await readdir(automationDefinitionsDir(projectPath), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(AUTOMATION_DEFINITION_SUFFIX))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function validateAutomationDefinition(projectPath, definition, options = {}) {
  const validate = await loadValidator(projectPath, AUTOMATION_DEFINITION_SCHEMA);
  assertValid(validate, definition, options.context ?? 'automation definition');
  return definition;
}

export async function readAutomationDefinition(projectPath, fileName) {
  const definition = await readJson(resolveInside(automationDefinitionsDir(projectPath), fileName));
  await validateAutomationDefinition(projectPath, definition, {
    context: `Automation definition ${fileName}`,
  });
  return definition;
}

export async function getAutomationRegistry(projectPath) {
  const runtimeInstalled = await isAutomationCoreInstalled(projectPath);
  const installedBundles = await readInstalledBundles(projectPath);

  if (!runtimeInstalled) {
    return {
      runtimeInstalled,
      installedBundles,
      automations: [],
      warnings: [],
    };
  }

  const definitionFiles = await listAutomationDefinitionFiles(projectPath);
  const automations = [];
  const automationIds = new Set();
  const commandSurfaces = new Map();
  const artifactDirectories = new Map();

  for (const fileName of definitionFiles) {
    const definition = await readAutomationDefinition(projectPath, fileName);

    if (automationIds.has(definition.automationId)) {
      throw new Error(`Duplicate automation id: ${definition.automationId}`);
    }
    automationIds.add(definition.automationId);

    if (commandSurfaces.has(definition.commandSurface)) {
      throw new Error(
        `Duplicate automation command surface: ${definition.commandSurface} used by ${commandSurfaces.get(definition.commandSurface)} and ${definition.automationId}`,
      );
    }
    commandSurfaces.set(definition.commandSurface, definition.automationId);

    if (artifactDirectories.has(definition.artifactDirectory)) {
      throw new Error(
        `Automation artifact directory overlap: ${definition.artifactDirectory} claimed by ${artifactDirectories.get(definition.artifactDirectory)} and ${definition.automationId}`,
      );
    }
    artifactDirectories.set(definition.artifactDirectory, definition.automationId);

    automations.push({
      ...definition,
      definitionPath: toProjectRelativePath('environment', 'automation', 'definitions', fileName),
    });
  }

  automations.sort((left, right) => left.automationId.localeCompare(right.automationId));

  return {
    runtimeInstalled,
    installedBundles,
    automations,
    warnings: [],
  };
}

export async function getAutomationById(projectPath, automationId) {
  const registry = await getAutomationRegistry(projectPath);
  const definition = registry.automations.find((entry) => entry.automationId === automationId) ?? null;

  if (definition == null) {
    throw new Error(`Unknown automation: ${automationId}`);
  }

  return definition;
}

function toProjectRelativePath(...segments) {
  return path.posix.join(
    ...segments.map((segment) => String(segment).replaceAll('\\', '/')),
  );
}
