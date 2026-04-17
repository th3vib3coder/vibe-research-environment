import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assert,
  collectFiles,
  isDirectRun,
  pathExists,
  readText,
  repoRoot
} from './_helpers.js';
import {
  DISPATCH_TABLE,
  parseCommandFrontmatter
} from '../../../bin/vre';

const IMPORT_LINE_PATTERN = /(?:import|Import)\s+\{?\s*([a-zA-Z0-9_, ]+)\s*\}?\s+from\s+['"]([^'"]+)['"]/gu;
const MODULE_PATH_PATTERN = /environment\/[a-z0-9_\-/]+\.js(?![a-z0-9_-])/giu;

async function importRepoModule(repoRelativePath) {
  return import(pathToFileURL(path.join(repoRoot, repoRelativePath)).href);
}

function normalizeModulePath(value) {
  return value.replace(/^\.\//u, '').split(path.sep).join('/');
}

async function assertModuleExport(modulePath, exportName, label) {
  const normalizedModulePath = normalizeModulePath(modulePath);
  assert(
    await pathExists(normalizedModulePath),
    `${label} references missing module ${normalizedModulePath}`
  );

  const mod = await importRepoModule(normalizedModulePath);
  assert(
    typeof mod[exportName] === 'function',
    `${label} references ${normalizedModulePath}#${exportName}, not exported as a function`
  );
}

export async function validateCommandContract(contractPath, markdown) {
  const frontmatter = parseCommandFrontmatter(markdown);
  const dispatch = frontmatter.dispatch ?? null;
  const tableEntry = Object.entries(DISPATCH_TABLE)
    .find(([, entry]) => entry.contract === contractPath)?.[1] ?? null;

  if (dispatch != null) {
    for (const key of ['module', 'export', 'scope', 'wrappedByMiddleware']) {
      assert(Object.hasOwn(dispatch, key), `${contractPath} dispatch block missing ${key}`);
    }

    assert(
      tableEntry != null,
      `${contractPath} has dispatch frontmatter but is absent from DISPATCH_TABLE`
    );
    assert(dispatch.module === tableEntry.module, `${contractPath} dispatch module drifted from DISPATCH_TABLE`);
    assert(dispatch.export === tableEntry.export, `${contractPath} dispatch export drifted from DISPATCH_TABLE`);
    assert(dispatch.scope === tableEntry.scope, `${contractPath} dispatch scope drifted from DISPATCH_TABLE`);
    assert(
      dispatch.wrappedByMiddleware === tableEntry.wrappedByMiddleware,
      `${contractPath} dispatch wrappedByMiddleware drifted from DISPATCH_TABLE`
    );
    await assertModuleExport(dispatch.module, dispatch.export, contractPath);
  }

  for (const match of markdown.matchAll(MODULE_PATH_PATTERN)) {
    assert(await pathExists(match[0]), `${contractPath} references missing module ${match[0]}`);
  }

  for (const match of markdown.matchAll(IMPORT_LINE_PATTERN)) {
    const exportNames = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const modulePath = normalizeModulePath(match[2]);

    for (const exportName of exportNames) {
      await assertModuleExport(modulePath, exportName, contractPath);
    }
  }
}

export default async function validateCommandsToJs() {
  const commandFiles = await collectFiles('commands', {
    include: (file) => file.endsWith('.md')
  });

  for (const contractPath of commandFiles) {
    await validateCommandContract(contractPath, await readText(contractPath));
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-commands-to-js', validateCommandsToJs);
}
