import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
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

  return {
    ok: checks.every((check) => check.status === 'ok'),
    checks
  };
}

export async function repairWorkspaceState(projectRoot) {
  await bootstrapCoreInstall(projectRoot);
}

export async function uninstallWorkspaceState(projectRoot) {
  await rm(path.join(projectRoot, '.vibe-science-environment', 'control'), {
    recursive: true,
    force: true
  });
  await rm(path.join(projectRoot, '.vibe-science-environment', 'flows'), {
    recursive: true,
    force: true
  });
  await unlink(path.join(projectRoot, '.vibe-science-environment', '.install-state.json')).catch(() => {});
}

export async function upgradeInstallState(projectRoot, version) {
  const installStatePath = path.join(projectRoot, '.vibe-science-environment', '.install-state.json');
  const current = JSON.parse(await readFile(installStatePath, 'utf8'));
  current.bundleManifestVersion = version;
  current.source.version = version;
  await writeFile(installStatePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  return current;
}
