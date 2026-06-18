import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { AUTONOMY_TIER_ENV } from '../../../autonomous/gate.js';
import {
  assertL0NotHaltedBeforeIteration,
  buildL0HaltRequest,
  l0HaltRequestPath,
  l0HaltRequestToReadinessGuardEvidence
} from '../../../autonomous/l0/halt.js';
import { classifyL0Readiness } from '../../../autonomous/l0/preflight.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from '../../cli/_fixture.js';

const baseCapabilities = Object.freeze({
  kernel: {
    mode: 'full',
    projections: {
      unavailable: []
    }
  },
  memory: {
    fresh: true,
    lastSyncAt: '2026-06-18T10:00:00.000Z'
  },
  degradedReasons: []
});

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

describe('Phase 13 L0 operator halt request contract', () => {
  it('builds reviewed runtime evidence without claiming process-kill semantics', () => {
    const request = buildL0HaltRequest({
      operator: 'Carmine',
      reason: 'operator halt before L0 resume',
      requestedAt: '2026-06-18T12:00:00.000Z'
    });

    assert.equal(request.schemaVersion, 'phase13.l0-halt-request.v1');
    assert.equal(request.evidenceClass, 'reviewed-runtime-evidence');
    assert.equal(request.requestedBy, 'Carmine');
    assert.equal(request.interruptSemantics, 'checked-before-next-l0-iteration');
    assert.equal(request.interruptsWithinOneIteration, true);
    assert.equal(request.resumeRequiresOperatorGo, true);
    assert.equal(request.actualProcessKill, false);
    assert.equal(request.runtimeOpened, false);
    assert.equal(request.l0RuntimeAllowed, false);
  });

  it('rejects missing reason and non-operator halt requests before writing artifacts', async () => {
    assert.throws(
      () => buildL0HaltRequest({ operator: 'Carmine', reason: '   ' }),
      (error) => error.code === 'E_L0_HALT_REASON_REQUIRED'
    );
    assert.throws(
      () => buildL0HaltRequest({ operator: 'Claude', reason: 'agent halt' }),
      (error) => error.code === 'E_L0_HALT_OPERATOR_INVALID'
    );
  });

  it('fails closed while the autonomy tier is off and writes no halt artifact', async () => {
    const projectRoot = await createCliFixtureProject('vre-phase13-halt-tier-off-');
    try {
      const result = await runVre(projectRoot, [
        'autonomous',
        'halt',
        '--json',
        '--operator',
        'Carmine',
        '--reason',
        'tier off must not write'
      ], {
        env: { [AUTONOMY_TIER_ENV]: '' }
      });

      assert.equal(result.code, 2, `stdout=${result.stdout} stderr=${result.stderr}`);
      assert.equal(result.stderr, '');
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.code, 'E_AUTONOMY_DISABLED');
      assert.equal(payload.runtimeOpened, false);
      assert.equal(await pathExists(l0HaltRequestPath(projectRoot)), false);
    } finally {
      await cleanupCliFixtureProject(projectRoot);
    }
  });

  it('fails closed on missing CLI operator, missing reason, or invalid operator', async () => {
    const cases = [
      {
        args: ['autonomous', 'halt', '--json', '--reason', 'missing operator'],
        code: 'E_L0_HALT_OPERATOR_REQUIRED'
      },
      {
        args: ['autonomous', 'halt', '--json', '--operator', 'Carmine'],
        code: 'E_L0_HALT_REASON_REQUIRED'
      },
      {
        args: ['autonomous', 'halt', '--json', '--operator', 'Codex', '--reason', 'agent halt'],
        code: 'E_L0_HALT_OPERATOR_INVALID'
      }
    ];

    for (const entry of cases) {
      const projectRoot = await createCliFixtureProject('vre-phase13-halt-invalid-');
      try {
        const result = await runVre(projectRoot, entry.args, {
          env: { [AUTONOMY_TIER_ENV]: 'phase13' }
        });

        assert.equal(result.code, 3, `${entry.code} stdout=${result.stdout}`);
        assert.equal(result.stderr, '');
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.code, entry.code);
        assert.equal(payload.runtimeOpened, false);
        assert.equal(await pathExists(l0HaltRequestPath(projectRoot)), false);
      } finally {
        await cleanupCliFixtureProject(projectRoot);
      }
    }
  });

  it('writes a confined halt request artifact without opening L0 runtime', async () => {
    const projectRoot = await createCliFixtureProject('vre-phase13-halt-write-');
    try {
      const result = await runVre(projectRoot, [
        'autonomous',
        'halt',
        '--json',
        '--operator',
        'Elisa',
        '--reason',
        'operator halt before next L0 iteration'
      ], {
        env: { [AUTONOMY_TIER_ENV]: 'phase13' }
      });

      assert.equal(result.code, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
      assert.equal(result.stderr, '');
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, true);
      assert.equal(payload.command, 'autonomous halt');
      assert.equal(payload.requestedBy, 'Elisa');
      assert.equal(payload.evidenceClass, 'reviewed-runtime-evidence');
      assert.equal(payload.interruptSemantics, 'checked-before-next-l0-iteration');
      assert.equal(payload.actualProcessKill, false);
      assert.equal(payload.runtimeOpened, false);
      assert.equal(payload.l0RuntimeAllowed, false);
      assert.equal(payload.haltRequestPath, '.vibe-science-environment/autonomous/l0/halt-request.json');

      const artifact = JSON.parse(await readFile(l0HaltRequestPath(projectRoot), 'utf8'));
      assert.equal(artifact.requestedBy, 'Elisa');
      assert.equal(artifact.reason, 'operator halt before next L0 iteration');
      assert.equal(artifact.runtimeOpened, false);
      assert.equal(artifact.l0RuntimeAllowed, false);
    } finally {
      await cleanupCliFixtureProject(projectRoot);
    }
  });

  it('fails closed at the pre-iteration guard when a halt request exists', async () => {
    const projectRoot = await createCliFixtureProject('vre-phase13-halt-guard-');
    try {
      await runVre(projectRoot, [
        'autonomous',
        'halt',
        '--json',
        '--operator',
        'Carmine',
        '--reason',
        'stop before next iteration'
      ], {
        env: { [AUTONOMY_TIER_ENV]: 'phase13' }
      });

      await assert.rejects(
        () => assertL0NotHaltedBeforeIteration(projectRoot),
        (error) => {
          assert.equal(error.code, 'E_L0_OPERATOR_HALT_REQUESTED');
          assert.equal(error.extra.runtimeOpened, false);
          assert.equal(error.extra.l0RuntimeAllowed, false);
          assert.equal(error.extra.actualProcessKill, false);
          return true;
        }
      );
    } finally {
      await cleanupCliFixtureProject(projectRoot);
    }
  });

  it('feeds reviewed halt evidence into the L0 readiness classifier without weakening blockers', () => {
    const haltRequest = buildL0HaltRequest({
      operator: 'Carmine',
      reason: 'reviewed halt evidence',
      requestedAt: '2026-06-18T12:00:00.000Z'
    });
    const result = classifyL0Readiness({
      capabilities: baseCapabilities,
      guardEvidence: l0HaltRequestToReadinessGuardEvidence(haltRequest)
    });

    assert.equal(result.ready, true);
    assert.equal(result.haltEvidenceClass, 'reviewed-runtime-evidence');
    assert.equal(result.runtimeOpened, false);
    assert.equal(result.l0RuntimeAllowed, false);
    assert.deepEqual(result.blockers, []);
  });

  it('keeps status and run fail-closed under the enabled autonomy tier', async () => {
    const projectRoot = await createCliFixtureProject('vre-phase13-halt-neighbors-');
    try {
      for (const action of ['status', 'run']) {
        const result = await runVre(projectRoot, ['autonomous', action, '--json'], {
          env: { [AUTONOMY_TIER_ENV]: 'phase13' }
        });
        assert.equal(result.code, 2, `${action} stdout=${result.stdout}`);
        assert.equal(result.stderr, '');
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.code, 'E_PHASE13_AUTONOMY_NOT_IMPLEMENTED');
        assert.equal(payload.runtimeOpened, false);
      }
    } finally {
      await cleanupCliFixtureProject(projectRoot);
    }
  });
});
