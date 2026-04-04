import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWithMiddleware } from '../../control/middleware.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function createInstallFixture(prefix = 'vre-install-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(root, 'environment'), { recursive: true });
  await cp(path.join(repoRoot, 'environment', 'templates'), path.join(root, 'environment', 'templates'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'environment', 'schemas'), path.join(root, 'environment', 'schemas'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'environment', 'install', 'bundles'), path.join(root, 'environment', 'install', 'bundles'), {
    recursive: true
  });
  return root;
}

export async function cleanupInstallFixture(projectRoot) {
  await rm(projectRoot, { recursive: true, force: true });
}

export async function bootstrapCoreInstall(projectRoot) {
  return runWithMiddleware({
    projectPath: projectRoot,
    commandName: '/flow-status',
    scope: 'flow-status',
    reader: { dbAvailable: false, error: 'bridge unavailable' },
    commandFn: async () => ({
      summary: 'bootstrap',
      payload: {}
    })
  });
}

export async function writeInstallStateFixture(projectRoot, bundles = ['governance-core', 'control-plane']) {
  const installStatePath = path.join(projectRoot, '.vibe-science-environment', '.install-state.json');
  await mkdir(path.dirname(installStatePath), { recursive: true });
  const payload = {
    schemaVersion: 'vibe-env.install.v1',
    installedAt: '2026-03-31T10:00:00Z',
    bundles,
    bundleManifestVersion: '1.0.0',
    operations: [],
    source: {
      version: '0.1.0',
      commit: 'test-fixture'
    }
  };
  await writeFile(installStatePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await applyInstalledBundleBootstrapPaths(projectRoot);
  return payload;
}

export async function doctorWorkspaceState(projectRoot) {
  const checks = [];
  const rootEntries = await readdir(path.join(projectRoot, '.vibe-science-environment'), {
    withFileTypes: true
  }).catch(() => []);

  const hasFlows = rootEntries.some((entry) => entry.name === 'flows');
  const hasControl = rootEntries.some((entry) => entry.name === 'control');

  checks.push({ check: 'flows-dir', status: hasFlows ? 'ok' : 'error' });
  checks.push({ check: 'control-dir', status: hasControl ? 'ok' : 'error' });

  const sessionPath = path.join(projectRoot, '.vibe-science-environment', 'control', 'session.json');
  try {
    await readFile(sessionPath, 'utf8');
    checks.push({ check: 'session-snapshot', status: 'ok' });
  } catch {
    checks.push({ check: 'session-snapshot', status: 'error' });
  }

  const installedBundles = await readInstalledBundleManifests(projectRoot);
  for (const bundle of installedBundles) {
    for (const bootstrapPath of bundle.bootstrapPaths ?? []) {
      const targetPath = path.join(projectRoot, ...bootstrapPath.split('/').filter(Boolean));
      const exists = await stat(targetPath).then(() => true).catch(() => false);
      checks.push({
        check: `bundle:${bundle.bundleId}:${bootstrapPath}`,
        status: exists ? 'ok' : 'error'
      });
    }
  }

  return {
    ok: checks.every((check) => check.status === 'ok'),
    checks
  };
}

export async function repairWorkspaceState(projectRoot) {
  await bootstrapCoreInstall(projectRoot);
  await applyInstalledBundleBootstrapPaths(projectRoot);
}

export async function uninstallWorkspaceState(projectRoot) {
  const installedBundles = await readInstalledBundleManifests(projectRoot);
  const bootstrapPaths = [...new Set(
    installedBundles.flatMap((bundle) => bundle.bootstrapPaths ?? [])
  )].sort((left, right) => right.length - left.length);

  if (bootstrapPaths.length === 0) {
    bootstrapPaths.push(
      '.vibe-science-environment/control/',
      '.vibe-science-environment/flows/'
    );
  }

  for (const bootstrapPath of bootstrapPaths) {
    const absolutePath = path.join(projectRoot, ...bootstrapPath.split('/').filter(Boolean));
    await rm(absolutePath, {
      recursive: true,
      force: true
    });
    await pruneEmptyWorkspaceAncestors(projectRoot, absolutePath);
  }

  await unlink(path.join(projectRoot, '.vibe-science-environment', '.install-state.json')).catch(() => {});
  await pruneEmptyWorkspaceAncestors(
    projectRoot,
    path.join(projectRoot, '.vibe-science-environment', '.install-state.json'),
  );
}

export async function upgradeInstallState(projectRoot, version) {
  const installStatePath = path.join(projectRoot, '.vibe-science-environment', '.install-state.json');
  const current = JSON.parse(await readFile(installStatePath, 'utf8'));
  current.bundleManifestVersion = version;
  current.source.version = version;
  await writeFile(installStatePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  return current;
}

async function applyInstalledBundleBootstrapPaths(projectRoot) {
  const installedBundles = await readInstalledBundleManifests(projectRoot);

  for (const bundle of installedBundles) {
    for (const bootstrapPath of bundle.bootstrapPaths ?? []) {
      await mkdir(path.join(projectRoot, ...bootstrapPath.split('/').filter(Boolean)), {
        recursive: true
      });
    }
  }
}

async function readInstalledBundleManifests(projectRoot) {
  const installStatePath = path.join(projectRoot, '.vibe-science-environment', '.install-state.json');

  let installState;
  try {
    installState = JSON.parse(await readFile(installStatePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const bundleIds = Array.isArray(installState.bundles) ? installState.bundles : [];
  const manifests = [];

  for (const bundleId of bundleIds) {
    const manifestPath = path.join(projectRoot, 'environment', 'install', 'bundles', `${bundleId}.bundle.json`);
    manifests.push(JSON.parse(await readFile(manifestPath, 'utf8')));
  }

  return manifests;
}

async function pruneEmptyWorkspaceAncestors(projectRoot, startPath) {
  const workspaceRoot = path.join(projectRoot, '.vibe-science-environment');
  let current = path.dirname(startPath);

  while (current.startsWith(workspaceRoot) && current.length >= workspaceRoot.length) {
    const entries = await readdir(current).catch(() => null);
    if (entries == null || entries.length > 0) {
      return;
    }

    await rm(current, { recursive: false, force: true }).catch(() => {});

    if (current === workspaceRoot) {
      return;
    }

    current = path.dirname(current);
  }
}
