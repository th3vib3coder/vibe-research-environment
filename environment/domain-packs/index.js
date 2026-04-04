import {
  isDomainPacksCoreInstalled,
  listDomainPackIds,
  readDomainPackManifest,
  readInstalledBundles,
} from './loader.js';

export async function getDomainPackRegistry(projectPath) {
  const runtimeInstalled = await isDomainPacksCoreInstalled(projectPath);
  const installedBundles = await readInstalledBundles(projectPath);

  if (!runtimeInstalled) {
    return {
      runtimeInstalled,
      installedBundles,
      packs: [],
      warnings: [],
    };
  }

  const packIds = await listDomainPackIds(projectPath);
  const packs = [];
  const seenPackIds = new Set();

  for (const packId of packIds) {
    const pack = await readDomainPackManifest(projectPath, packId);

    if (seenPackIds.has(pack.packId)) {
      throw new Error(`Duplicate domain pack id: ${pack.packId}`);
    }
    seenPackIds.add(pack.packId);

    packs.push(pack);
  }

  packs.sort((left, right) => left.packId.localeCompare(right.packId));

  return {
    runtimeInstalled,
    installedBundles,
    packs,
    warnings: [],
  };
}

export async function getDomainPackById(projectPath, packId) {
  const registry = await getDomainPackRegistry(projectPath);
  const pack = registry.packs.find((entry) => entry.packId === packId) ?? null;

  if (pack == null) {
    throw new Error(`Unknown domain pack: ${packId}`);
  }

  return pack;
}
