import { readInstalledBundles } from './manifest.js';
import {
  isConnectorsCoreInstalled,
  listConnectorManifestFiles,
  readConnectorManifest,
  toProjectRelativePath,
} from './manifest.js';

export async function getConnectorRegistry(projectPath) {
  const runtimeInstalled = await isConnectorsCoreInstalled(projectPath);
  const installedBundles = await readInstalledBundles(projectPath);

  if (!runtimeInstalled) {
    return {
      runtimeInstalled,
      installedBundles,
      connectors: [],
      warnings: [],
    };
  }

  const connectorFiles = await listConnectorManifestFiles(projectPath);
  const connectors = [];
  const connectorIds = new Set();
  const ownedWorkspacePaths = new Map();

  for (const fileName of connectorFiles) {
    const manifest = await readConnectorManifest(projectPath, fileName);

    if (connectorIds.has(manifest.connectorId)) {
      throw new Error(`Duplicate connector id: ${manifest.connectorId}`);
    }
    connectorIds.add(manifest.connectorId);

    for (const ownedPath of manifest.workspaceStatePaths ?? []) {
      if (ownedWorkspacePaths.has(ownedPath)) {
        throw new Error(
          `Connector workspace path overlap: ${ownedPath} claimed by ${ownedWorkspacePaths.get(ownedPath)} and ${manifest.connectorId}`,
        );
      }
      ownedWorkspacePaths.set(ownedPath, manifest.connectorId);
    }

    connectors.push({
      ...manifest,
      manifestPath: toProjectRelativePath('environment', 'connectors', 'manifests', fileName),
    });
  }

  connectors.sort((left, right) => left.connectorId.localeCompare(right.connectorId));

  return {
    runtimeInstalled,
    installedBundles,
    connectors,
    warnings: [],
  };
}

export async function getConnectorById(projectPath, connectorId) {
  const registry = await getConnectorRegistry(projectPath);
  const manifest = registry.connectors.find((entry) => entry.connectorId === connectorId) ?? null;

  if (manifest == null) {
    throw new Error(`Unknown connector: ${connectorId}`);
  }

  return manifest;
}
