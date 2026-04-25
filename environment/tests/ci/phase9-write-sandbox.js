import { assert, collectFiles, isDirectRun, pathExists, readJson, readText } from './_helpers.js';

const DEFAULT_ALLOWLIST_PATH = 'environment/tests/ci/phase9-write-sandbox-allowlist.json';
const REVIEWED_PREFIXES = ['environment/orchestrator/', 'environment/objectives/'];
const RAW_IMPORT_PATTERN = /from\s+['"](node:fs(?:\/promises)?|fs(?:\/promises)?|node:child_process|child_process)['"]/gu;

function collectRawImports(content) {
  const imports = new Set();
  let match;
  while ((match = RAW_IMPORT_PATTERN.exec(content)) !== null) {
    imports.add(match[1]);
  }
  return imports;
}

export async function validatePhase9WriteSandbox(options = {}) {
  const readJsonImpl = options.readJsonImpl ?? readJson;
  const readTextImpl = options.readTextImpl ?? readText;
  const allowlistPath = options.allowlistPath ?? DEFAULT_ALLOWLIST_PATH;
  const allowlist = options.allowlist ?? await readJsonImpl(allowlistPath);
  const files = options.files ?? await collectFiles('.', {
    include: (file) =>
      file.endsWith('.js') && REVIEWED_PREFIXES.some((prefix) => file.startsWith(prefix))
  });

  assert(
    allowlist != null && Array.isArray(allowlist.entries),
    `Phase 9 write-sandbox allowlist must expose an entries array: ${allowlistPath}`
  );

  const allowlistEntries = new Map();
  for (const entry of allowlist.entries) {
    assert(typeof entry?.path === 'string' && entry.path.trim() !== '', 'Write-sandbox allowlist rows need a non-empty path.');
    assert(Array.isArray(entry.imports), `Write-sandbox allowlist row ${entry.path} needs an imports array.`);
    assert(!allowlistEntries.has(entry.path), `Duplicate write-sandbox allowlist row: ${entry.path}`);
    allowlistEntries.set(entry.path, new Set(entry.imports));
  }

  const fileSet = new Set(files);
  for (const [file, allowedImports] of allowlistEntries.entries()) {
    assert(fileSet.has(file), `Write-sandbox allowlist references a non-reviewed or missing file: ${file}`);
    if (options.allowMissingFiles !== true) {
      assert(await pathExists(file), `Write-sandbox allowlist path is missing on disk: ${file}`);
    }

    const content = await readTextImpl(file);
    const rawImports = collectRawImports(content);
    for (const allowedImport of allowedImports) {
      assert(rawImports.has(allowedImport), `Stale write-sandbox allowlist import ${allowedImport} for ${file}`);
    }
  }

  for (const file of files) {
    const content = await readTextImpl(file);
    const rawImports = collectRawImports(content);
    if (rawImports.size === 0) {
      continue;
    }

    const allowedImports = allowlistEntries.get(file);
    assert(
      allowedImports != null,
      `Reviewed write-sandbox allowlist is missing ${file} for imports ${[...rawImports].join(', ')}`
    );
    for (const importSpecifier of rawImports) {
      assert(
        allowedImports.has(importSpecifier),
        `Reviewed write-sandbox allowlist for ${file} is missing ${importSpecifier}`
      );
    }
  }
}

if (isDirectRun(import.meta)) {
  try {
    await validatePhase9WriteSandbox();
    console.log('OK phase9-write-sandbox');
  } catch (error) {
    console.error(`FAIL phase9-write-sandbox: ${error.message}`);
    process.exitCode = 1;
  }
}
