import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function createFixtureProject(prefix) {
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

export async function cleanupFixtureProject(projectRoot) {
  await rm(projectRoot, { recursive: true, force: true });
}
