import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function createCliFixtureProject(prefix) {
  const root = await mkdtemp(path.join(repoRoot, `.tmp-${prefix}`));
  await cp(path.join(repoRoot, 'environment'), path.join(root, 'environment'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'bin'), path.join(root, 'bin'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'commands'), path.join(root, 'commands'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'package.json'), path.join(root, 'package.json'));
  await mkdir(path.join(root, '.vibe-science-environment'), { recursive: true });
  return root;
}

export async function cleanupCliFixtureProject(projectRoot) {
  await rm(projectRoot, { recursive: true, force: true });
}

export async function runVre(projectRoot, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'bin', 'vre'), ...args], {
      cwd: options.cwd ?? projectRoot,
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });
  });
}

export async function createNonRepoCwd() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-cli-not-root-'));
}
