import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULE_PATH = '../../orchestrator/governance-logger.js';

async function loadModule() {
  return import(MODULE_PATH);
}

async function withTempDir(prefix, fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function writeStubCli(tempDir, body) {
  await mkdir(tempDir, { recursive: true });
  const cliPath = path.join(tempDir, 'governance-log.js');
  await writeFile(cliPath, body, 'utf8');
  return cliPath;
}

function successStub({ eventId = 'EV-PLG-1', marker = false } = {}) {
  return [
    "const fs = require('node:fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    marker ? "  fs.writeFileSync(process.env.MARKER_PATH, JSON.stringify({ argv1: process.argv[1], stdin: JSON.parse(stdin) }));" : '',
    `  process.stdout.write(JSON.stringify({ ok: true, eventId: '${eventId}', code: 'OK' }) + '\\n');`,
    '});',
    '',
  ].join('\n');
}

async function expectRejectCode(thunk, code) {
  try {
    await thunk();
    assert.fail(`expected ${code}`);
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
}

function baseEvent() {
  return {
    event_type: 'objective_started',
    objective_id: 'OBJ-GOV-WRAPPER-001',
    source_component: 'vre/orchestrator/governance-logger',
    details: { mode: 'test' },
  };
}

test('logGovernanceEventViaPlugin resolves successful plugin CLI output', async () => {
  await withTempDir('vre-governance-logger-ok-', async (tempDir) => {
    const { logGovernanceEventViaPlugin } = await loadModule();
    const cliPath = await writeStubCli(tempDir, successStub());

    const result = await logGovernanceEventViaPlugin(baseEvent(), {
      pluginCliPath: cliPath,
      pluginProjectRoot: tempDir,
    });

    assert.deepEqual(result, { ok: true, eventId: 'EV-PLG-1', code: 'OK' });
  });
});

test('logGovernanceEventViaPlugin rejects when plugin CLI times out', async () => {
  await withTempDir('vre-governance-logger-timeout-', async (tempDir) => {
    const { logGovernanceEventViaPlugin } = await loadModule();
    const cliPath = await writeStubCli(tempDir, "setTimeout(() => {}, 10_000);\n");

    await expectRejectCode(
      () => logGovernanceEventViaPlugin(baseEvent(), {
        pluginCliPath: cliPath,
        timeoutMs: 100,
      }),
      'E_GOVERNANCE_BRIDGE_TIMEOUT',
    );
  });
});

test('logGovernanceEventViaPlugin passes through plugin validation failures', async () => {
  await withTempDir('vre-governance-logger-nonzero-', async (tempDir) => {
    const { logGovernanceEventViaPlugin } = await loadModule();
    const cliPath = await writeStubCli(tempDir, [
      "process.stdout.write(JSON.stringify({ ok: false, code: 'E_BRIDGE_VALIDATION' }) + '\\n');",
      'process.exit(1);',
      '',
    ].join('\n'));

    await expectRejectCode(
      () => logGovernanceEventViaPlugin(baseEvent(), { pluginCliPath: cliPath }),
      'E_BRIDGE_VALIDATION',
    );
  });
});

test('logGovernanceEventViaPlugin rejects non-JSON plugin output', async () => {
  await withTempDir('vre-governance-logger-bad-output-', async (tempDir) => {
    const { logGovernanceEventViaPlugin } = await loadModule();
    const cliPath = await writeStubCli(tempDir, "process.stdout.write('not json');\n");

    await expectRejectCode(
      () => logGovernanceEventViaPlugin(baseEvent(), { pluginCliPath: cliPath }),
      'E_GOVERNANCE_BRIDGE_BAD_OUTPUT',
    );
  });
});

test('governance plugin CLI resolution honors explicit env, root env, and sibling fallback', async () => {
  await withTempDir('vre-governance-logger-env-', async (tempDir) => {
    const {
      logGovernanceEventViaPlugin,
      resolveGovernancePluginCliPath,
    } = await loadModule();
    const originalCli = process.env.VIBE_SCIENCE_PLUGIN_CLI;
    const originalRoot = process.env.VIBE_SCIENCE_PLUGIN_ROOT;
    try {
      const markerA = path.join(tempDir, 'marker-a.json');
      const cliA = await writeStubCli(path.join(tempDir, 'explicit'), successStub({
        eventId: 'EV-ENV-CLI',
        marker: true,
      }));
      process.env.VIBE_SCIENCE_PLUGIN_CLI = cliA;
      delete process.env.VIBE_SCIENCE_PLUGIN_ROOT;
      const resultA = await logGovernanceEventViaPlugin(baseEvent(), {
        env: { ...process.env, MARKER_PATH: markerA },
      });
      assert.equal(resultA.eventId, 'EV-ENV-CLI');
      const markerPayloadA = JSON.parse(await readFile(markerA, 'utf8'));
      assert.equal(path.resolve(markerPayloadA.argv1), path.resolve(cliA));

      const pluginRoot = path.join(tempDir, 'root-env');
      const scriptsDir = path.join(pluginRoot, 'scripts');
      await mkdir(scriptsDir, { recursive: true });
      const cliB = await writeStubCli(scriptsDir, successStub({
        eventId: 'EV-ROOT-ENV',
        marker: true,
      }));
      const markerB = path.join(tempDir, 'marker-b.json');
      delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
      process.env.VIBE_SCIENCE_PLUGIN_ROOT = pluginRoot;
      const resultB = await logGovernanceEventViaPlugin(baseEvent(), {
        env: { ...process.env, MARKER_PATH: markerB },
      });
      assert.equal(resultB.eventId, 'EV-ROOT-ENV');
      const markerPayloadB = JSON.parse(await readFile(markerB, 'utf8'));
      assert.equal(path.resolve(markerPayloadB.argv1), path.resolve(cliB));

      delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
      delete process.env.VIBE_SCIENCE_PLUGIN_ROOT;
      assert.equal(
        resolveGovernancePluginCliPath({ cwd: repoRoot }),
        path.resolve(repoRoot, '..', 'vibe-science', 'plugin', 'scripts', 'governance-log.js'),
      );
    } finally {
      if (originalCli === undefined) delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
      else process.env.VIBE_SCIENCE_PLUGIN_CLI = originalCli;
      if (originalRoot === undefined) delete process.env.VIBE_SCIENCE_PLUGIN_ROOT;
      else process.env.VIBE_SCIENCE_PLUGIN_ROOT = originalRoot;
    }
  });
});
