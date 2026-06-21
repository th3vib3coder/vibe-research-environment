import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validatePhase14IsolationConfiguration,
} from '../ci/phase14-isolation-enforcement.js';

function validPackageScripts() {
  return {
    scripts: {
      'test:phase13':
        'node --test environment/tests/autonomous/l0/halt.test.js',
      'test:phase14-isolation': [
        'node environment/tests/ci/validate-edition-isolation.js',
        'node --test environment/tests/autonomous/l0/halt.test.js',
        'node environment/tests/ci/phase14-tracking-drift.js',
        'node --test environment/tests/phase14/tracking-drift-ci-wired.test.js',
      ].join(' && '),
    },
  };
}

function validRunAllSource() {
  return [
    "['validate-edition-isolation', validateEditionIsolation],",
    "['phase14-tracking-drift', validatePhase14TrackingDrift],",
  ].join('\n');
}

test('phase14 isolation enforcement accepts the reviewed Option A wiring', () => {
  assert.doesNotThrow(() =>
    validatePhase14IsolationConfiguration({
      packageJson: validPackageScripts(),
      runAllSource: validRunAllSource(),
    })
  );
});

test('phase14 isolation enforcement rejects a missing named script', () => {
  const packageJson = validPackageScripts();
  delete packageJson.scripts['test:phase14-isolation'];

  assert.throws(
    () =>
      validatePhase14IsolationConfiguration({
        packageJson,
        runAllSource: validRunAllSource(),
      }),
    /E_PHASE14_ISOLATION_SCRIPT_MISSING/u
  );
});

test('phase14 isolation enforcement rejects missing script members', () => {
  for (const omitted of [
    'validate-edition-isolation.js',
    'environment/tests/autonomous/l0/halt.test.js',
    'phase14-tracking-drift.js',
    'tracking-drift-ci-wired.test.js',
  ]) {
    const packageJson = validPackageScripts();
    packageJson.scripts['test:phase14-isolation'] = packageJson.scripts[
      'test:phase14-isolation'
    ]
      .split(' && ')
      .filter((part) => !part.includes(omitted))
      .join(' && ');

    assert.throws(
      () =>
        validatePhase14IsolationConfiguration({
          packageJson,
          runAllSource: validRunAllSource(),
        }),
      /E_PHASE14_ISOLATION_SCRIPT_MEMBER_MISSING/u
    );
  }
});

test('phase14 isolation enforcement rejects run-all de-wiring', () => {
  for (const omitted of [
    'validate-edition-isolation',
    'phase14-tracking-drift',
  ]) {
    const runAllSource = validRunAllSource()
      .split('\n')
      .filter((line) => !line.includes(omitted))
      .join('\n');

    assert.throws(
      () =>
        validatePhase14IsolationConfiguration({
          packageJson: validPackageScripts(),
          runAllSource,
        }),
      /E_PHASE14_RUN_ALL_MEMBER_MISSING/u
    );
  }
});

test('phase14 isolation enforcement rejects test:phase13 without halt test', () => {
  const packageJson = validPackageScripts();
  packageJson.scripts['test:phase13'] = 'node --test unrelated.test.js';

  assert.throws(
    () =>
      validatePhase14IsolationConfiguration({
        packageJson,
        runAllSource: validRunAllSource(),
      }),
    /E_PHASE14_PHASE13_HALT_TEST_MISSING/u
  );
});
