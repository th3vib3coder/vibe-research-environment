import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { syncMemory } from '../../memory/sync.js';
import { KernelBridgeContractMismatchError } from '../../lib/kernel-bridge.js';
import { createFixtureProject, cleanupFixtureProject } from '../integration/_fixture.js';

const GOVERNANCE_CAPTURE_STUB = path.join(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'governance-log-capture-stub.js',
);

async function readGovernanceEvents(capturePath) {
  try {
    const raw = await readFile(capturePath, 'utf8');
    return raw
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function withGovernanceCapture(capturePath, fn, overrides = {}) {
  const previousCapturePath = process.env.VRE_GOVERNANCE_CAPTURE_PATH;
  const previousPluginCli = process.env.VIBE_SCIENCE_PLUGIN_CLI;
  await mkdir(path.dirname(capturePath), { recursive: true });
  process.env.VRE_GOVERNANCE_CAPTURE_PATH = capturePath;
  process.env.VIBE_SCIENCE_PLUGIN_CLI = overrides.pluginCliPath ?? GOVERNANCE_CAPTURE_STUB;
  try {
    return await fn();
  } finally {
    if (previousCapturePath == null) {
      delete process.env.VRE_GOVERNANCE_CAPTURE_PATH;
    } else {
      process.env.VRE_GOVERNANCE_CAPTURE_PATH = previousCapturePath;
    }
    if (previousPluginCli == null) {
      delete process.env.VIBE_SCIENCE_PLUGIN_CLI;
    } else {
      process.env.VIBE_SCIENCE_PLUGIN_CLI = previousPluginCli;
    }
  }
}

async function captureStderr(fn) {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  try {
    return {
      result: await fn(),
      stderr,
    };
  } finally {
    process.stderr.write = originalWrite;
  }
}

function assertKernelTruthMismatchEvent(event, projectionName) {
  assert.equal(event.event_type, 'kernel_vre_truth_mismatch');
  assert.equal(event.source_component, 'vre/memory/sync');
  assert.equal(event.objective_id, null);
  assert.equal(event.severity, 'critical');
  assert.deepEqual(event.details, {
    projectionName,
    errorClass: 'KernelBridgeContractMismatchError',
  });
}

function assertNoDetailsLeak(event, forbiddenValues) {
  const serialized = JSON.stringify(event.details);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `governance details leaked ${value}`);
  }
}

function createReader({ throwOn = {} } = {}) {
  return {
    dbAvailable: true,
    async getProjectOverview() {
      if (throwOn.getProjectOverview != null) {
        throw throwOn.getProjectOverview();
      }
      return {
        activeClaimCount: 0,
        unresolvedAlertCount: 0,
        pendingSeedCount: 0,
        activePatternCount: 0,
        recentGateFailures: [],
      };
    },
    async listClaimHeads() {
      if (throwOn.listClaimHeads != null) {
        throw throwOn.listClaimHeads();
      }
      return [];
    },
    async listUnresolvedClaims() {
      if (throwOn.listUnresolvedClaims != null) {
        throw throwOn.listUnresolvedClaims();
      }
      return [];
    },
  };
}

test('syncMemory emits kernel truth mismatch and sanitizes memory warnings', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-truth-mismatch-');
  const capturePath = path.join(projectRoot, 'memory-governance.jsonl');
  const sentinel = 'SECRET-seq127-flow-mismatch C:/private/path';

  try {
    const result = await withGovernanceCapture(capturePath, () => syncMemory(projectRoot, {
      syncedAt: '2026-04-02T19:00:00Z',
      reader: createReader({
        throwOn: {
          getProjectOverview: () => new KernelBridgeContractMismatchError(
            `memory mismatch ${sentinel}`,
            { projection: 'getProjectOverview' },
          ),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 1);
    assertKernelTruthMismatchEvent(events[0], 'getProjectOverview');
    assertNoDetailsLeak(events[0], [sentinel, 'SECRET-seq127-flow-mismatch', 'C:/private/path']);
    assert.match(result.warnings.join('\n'), /Kernel project overview unavailable: kernel truth mismatch/u);
    assert.equal(result.warnings.join('\n').includes('SECRET-seq127'), false);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('syncMemory preserves memory fallback when kernel truth telemetry fails', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-truth-fail-soft-');
  const capturePath = path.join(projectRoot, 'memory-missing-bridge.jsonl');
  const missingCli = path.join(projectRoot, 'missing-governance-cli.js');

  try {
    const { result, stderr } = await captureStderr(() => withGovernanceCapture(
      capturePath,
      () => syncMemory(projectRoot, {
        syncedAt: '2026-04-02T19:05:00Z',
        reader: createReader({
          throwOn: {
            listClaimHeads: () => new KernelBridgeContractMismatchError(
              'memory claim heads mismatch',
              { projection: 'listClaimHeads' },
            ),
          },
        }),
      }),
      { pluginCliPath: missingCli },
    ));

    assert.match(stderr, /kernel_vre_truth_mismatch telemetry failed/u);
    assert.match(result.warnings.join('\n'), /Kernel claim heads unavailable: kernel truth mismatch/u);
    assert.equal(result.state.status, 'partial');
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});

test('syncMemory preserves ordinary memory projection errors without governance emission', async () => {
  const projectRoot = await createFixtureProject('vre-memory-sync-ordinary-error-');
  const capturePath = path.join(projectRoot, 'memory-ordinary-error.jsonl');

  try {
    const result = await withGovernanceCapture(capturePath, () => syncMemory(projectRoot, {
      syncedAt: '2026-04-02T19:10:00Z',
      reader: createReader({
        throwOn: {
          listUnresolvedClaims: () => new Error('ordinary unresolved reader failure'),
        },
      }),
    }));
    const events = await readGovernanceEvents(capturePath);

    assert.equal(events.length, 0);
    assert.match(result.warnings.join('\n'), /Kernel unresolved claims unavailable: ordinary unresolved reader failure/u);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
