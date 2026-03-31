import path from 'node:path';

import { assert, collectFiles, isDirectRun, pathExists, readText, repoRoot } from './_helpers.js';

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/gu;
const repoCodePathPattern = /`((?:\.claude|blueprints|commands|environment)\/[^`\s*]+)`/gu;
const deferredMarkers = [
  'Phase 2',
  'Phase 2-3',
  'Phase 3',
  'Phase 4',
  'PLANNED',
  'PREVIEW',
  'KERNEL PREREQUISITE'
];

function shouldCheckTarget(target) {
  return (
    target &&
    !target.startsWith('http://') &&
    !target.startsWith('https://') &&
    !target.startsWith('app://') &&
    !target.startsWith('#') &&
    !target.startsWith('file://') &&
    !target.includes('<') &&
    !target.startsWith('.vibe-science-environment/')
  );
}

async function resolveTarget(file, target) {
  const strippedTarget = target.split('#')[0];
  const relativeCandidate = path
    .relative(
      repoRoot,
      path.resolve(path.dirname(path.join(repoRoot, file)), strippedTarget)
    )
    .split(path.sep)
    .join('/');

  if (await pathExists(relativeCandidate)) {
    return relativeCandidate;
  }

  return strippedTarget;
}

function getLineForMatch(content, index) {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  const nextNewline = content.indexOf('\n', index);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;
  return content.slice(lineStart, lineEnd);
}

function isDeferredReference(line) {
  return deferredMarkers.some((marker) => line.includes(marker));
}

function shouldEnforceCodePath(file) {
  return (
    file === 'README.md' ||
    file.startsWith('commands/') ||
    file === 'blueprints/definitive-spec/09-install-and-lifecycle.md' ||
    file === 'blueprints/definitive-spec/14-testing-strategy.md'
  );
}

function getNearestHeading(content, index) {
  const beforeMatch = content.slice(0, index);
  const headingStart = beforeMatch.lastIndexOf('\n### ');
  if (headingStart === -1) {
    return '';
  }

  const headingLineStart = headingStart + 1;
  const headingLineEnd = content.indexOf('\n', headingLineStart);
  return headingLineEnd === -1
    ? content.slice(headingLineStart)
    : content.slice(headingLineStart, headingLineEnd);
}

function getContextWindow(content, index) {
  const windowStart = Math.max(0, index - 300);
  return content.slice(windowStart, index);
}

export default async function validateReferences() {
  const markdownFiles = await collectFiles('.', {
    include: (file) =>
      (file === 'README.md' ||
        file.startsWith('commands/') ||
        file.startsWith('blueprints/definitive-spec/')) &&
      file.endsWith('.md')
  });

  for (const file of markdownFiles) {
    const content = await readText(file);

    for (const match of content.matchAll(markdownLinkPattern)) {
      const target = match[1].trim();
      if (!shouldCheckTarget(target)) {
        continue;
      }

      const repoRelativeTarget = await resolveTarget(file, target);

      if (repoRelativeTarget.includes('*')) {
        continue;
      }

      assert(await pathExists(repoRelativeTarget), `Broken markdown link in ${file}: ${target}`);
    }

    for (const match of content.matchAll(repoCodePathPattern)) {
      const target = match[1].trim();
      if (!shouldCheckTarget(target) || target.includes('*')) {
        continue;
      }

      if (await pathExists(target)) {
        continue;
      }

      const line = getLineForMatch(content, match.index ?? 0);
      const heading = getNearestHeading(content, match.index ?? 0);
      const contextWindow = getContextWindow(content, match.index ?? 0);
      if (
        !shouldEnforceCodePath(file) ||
        isDeferredReference(line) ||
        isDeferredReference(heading) ||
        isDeferredReference(contextWindow)
      ) {
        continue;
      }

      assert(false, `Broken code-path reference in ${file}: ${target}`);
    }
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-references', validateReferences);
}
