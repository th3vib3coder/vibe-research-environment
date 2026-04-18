#!/usr/bin/env node
/**
 * Fake sibling kernel CLI for WP-156 integration tests.
 *
 * Reads a JSON payload on stdin, takes the projection name from argv[2],
 * and writes a canned envelope to stdout matching the WP-150 contract:
 *   {ok: true, projection, projectPath, data: {...}}
 *
 * Trigger strings in the projection argument drive failure-mode coverage
 * for WP-155/WP-156/WP-157:
 *   __bridge_test_timeout__        → hangs forever (setInterval keeps event loop alive)
 *   __bridge_test_bad_envelope__   → writes non-JSON to stdout
 *   __bridge_test_kernel_error__   → writes {ok:false, error, projection}
 *   __bridge_test_mismatch__       → writes envelope whose projection field disagrees
 *
 * Any other projection name returns canned deterministic data.
 *
 * No external dependencies — stdlib only. Deterministic: same input ⇒ same output.
 */
'use strict';

const projection = process.argv[2] || '<missing>';
let stdinBuf = '';

process.stdin.on('data', (chunk) => {
  stdinBuf += chunk.toString('utf8');
});

process.stdin.on('end', () => {
  let input;
  try {
    input = stdinBuf.trim() === '' ? {} : JSON.parse(stdinBuf);
  } catch (err) {
    process.stderr.write(`fake-kernel-sibling: invalid stdin JSON: ${err.message}\n`);
    process.exit(2);
    return;
  }
  const projectPath = typeof input.projectPath === 'string' && input.projectPath.length > 0
    ? input.projectPath
    : '/fake/project';

  if (projection === '__bridge_test_timeout__') {
    // Keep the event loop alive forever; never write stdout, never exit.
    setInterval(() => {}, 60_000);
    return;
  }

  if (projection === '__bridge_test_bad_envelope__') {
    process.stdout.write('this is not json');
    process.exit(0);
    return;
  }

  if (projection === '__bridge_test_kernel_error__') {
    process.stdout.write(JSON.stringify({
      ok: false,
      projection,
      error: 'fake kernel reported failure for contract coverage',
    }));
    process.exit(0);
    return;
  }

  if (projection === '__bridge_test_mismatch__') {
    // Deliberately mis-report the projection field so the bridge catches drift.
    process.stdout.write(JSON.stringify({
      ok: true,
      projection: 'someOtherProjection',
      projectPath,
      data: {},
    }));
    process.exit(0);
    return;
  }

  if (projection === '__bridge_test_missing_data__') {
    process.stdout.write(JSON.stringify({
      ok: true,
      projection,
      projectPath,
      // data intentionally omitted
    }));
    process.exit(0);
    return;
  }

  const data = buildCannedData(projection);
  const envelope = {
    ok: true,
    projection,
    projectPath,
    data,
  };
  process.stdout.write(JSON.stringify(envelope));
  process.exit(0);
});

function buildCannedData(name) {
  switch (name) {
    case 'listClaimHeads':
      return [{
        claimId: 'claim-0001',
        state: 'CREATED',
        title: 'Fake claim head',
        updatedAt: '2026-04-17T00:00:00.000Z',
      }];
    case 'listUnresolvedClaims':
      return [];
    case 'listCitationChecks':
      return [];
    case 'getProjectOverview':
      return {
        projectId: 'fake-project-id',
        profile: 'default',
        updatedAt: '2026-04-17T00:00:00.000Z',
        claimCounts: { created: 0, reviewed: 0, promoted: 0 },
      };
    case 'listLiteratureSearches':
      return [];
    case 'listObserverAlerts':
      return [];
    case 'listGateChecks':
      return [{
        hook: 'schema_file_protection',
        status: 'ok',
        description: 'Non-negotiable: protects kernel schema files.',
      }, {
        hook: 'confounder_check',
        status: 'ok',
      }, {
        hook: 'stop_blocking',
        status: 'ok',
      }, {
        hook: 'integrity_degradation_tracking',
        status: 'ok',
      }];
    case 'getStateSnapshot':
      return {
        profile: 'default',
        sequences: [['CREATED', 'R2_REVIEWED', 'PROMOTED']],
        lastTransitionAt: '2026-04-17T00:00:00.000Z',
      };
    default:
      return { note: `fake-kernel-sibling has no canned response for "${name}"` };
  }
}
