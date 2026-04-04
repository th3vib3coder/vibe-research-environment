import path from 'node:path';

import { resolveProjectRoot } from '../control/_io.js';

export function resolveExternalTargetRoot(projectPath, value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  const targetRoot = path.resolve(value.trim());
  const projectRoot = resolveProjectRoot(projectPath);

  if (isInsideProjectWorkspace(projectRoot, targetRoot)) {
    throw new Error(
      `${label} must resolve outside the project workspace; connector exports cannot target kernel-owned or outer-project paths.`,
    );
  }

  return targetRoot;
}

function isInsideProjectWorkspace(projectRoot, targetPath) {
  const normalizedProjectRoot = normalizeComparisonPath(projectRoot);
  const normalizedTargetPath = normalizeComparisonPath(targetPath);

  if (normalizedProjectRoot === normalizedTargetPath) {
    return true;
  }

  const relativePath = path.relative(normalizedProjectRoot, normalizedTargetPath);
  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

function normalizeComparisonPath(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved;
}
