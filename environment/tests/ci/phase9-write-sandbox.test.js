import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePhase9WriteSandbox } from './phase9-write-sandbox.js';

test('phase9 write-sandbox allowlist stays aligned with the reviewed repo surfaces', async () => {
  await validatePhase9WriteSandbox();
});

test('phase9 write-sandbox rejects a reviewed raw-fs import when the file is missing from the allowlist', async () => {
  const contents = new Map([
    ['environment/orchestrator/clean-surface.js', "export const ok = true;\n"],
    ['environment/orchestrator/raw-write-surface.js', "import { writeFile } from 'node:fs/promises';\nexport { writeFile };\n"]
  ]);

  await assert.rejects(
    validatePhase9WriteSandbox({
      files: [...contents.keys()],
      allowMissingFiles: true,
      allowlist: {
        version: 1,
        entries: []
      },
      readTextImpl: async (file) => contents.get(file)
    }),
    /Reviewed write-sandbox allowlist is missing environment\/orchestrator\/raw-write-surface\.js/u
  );
});

test('phase9 write-sandbox rejects stale allowlist imports that no longer match the reviewed file', async () => {
  const contents = new Map([
    ['environment/objectives/store.js', "export const noop = true;\n"]
  ]);

  await assert.rejects(
    validatePhase9WriteSandbox({
      files: [...contents.keys()],
      allowMissingFiles: true,
      allowlist: {
        version: 1,
        entries: [
          {
            path: 'environment/objectives/store.js',
            imports: ['node:fs/promises']
          }
        ]
      },
      readTextImpl: async (file) => contents.get(file)
    }),
    /Stale write-sandbox allowlist import node:fs\/promises for environment\/objectives\/store\.js/u
  );
});

test('phase9 write-sandbox rejects reviewed dynamic imports that bypass the static from-clause pattern', async () => {
  const contents = new Map([
    ['environment/orchestrator/raw-dynamic-import.js', "const fs = await import('node:fs/promises');\nexport default fs;\n"]
  ]);

  await assert.rejects(
    validatePhase9WriteSandbox({
      files: [...contents.keys()],
      allowMissingFiles: true,
      allowlist: {
        version: 1,
        entries: []
      },
      readTextImpl: async (file) => contents.get(file)
    }),
    /Reviewed write-sandbox allowlist is missing environment\/orchestrator\/raw-dynamic-import\.js/u
  );
});

test('phase9 write-sandbox rejects reviewed CommonJS requires of raw child-process paths', async () => {
  const contents = new Map([
    ['environment/orchestrator/raw-require.js', "const cp = require('node:child_process');\nexport default cp;\n"]
  ]);

  await assert.rejects(
    validatePhase9WriteSandbox({
      files: [...contents.keys()],
      allowMissingFiles: true,
      allowlist: {
        version: 1,
        entries: []
      },
      readTextImpl: async (file) => contents.get(file)
    }),
    /Reviewed write-sandbox allowlist is missing environment\/orchestrator\/raw-require\.js/u
  );
});
