import test from 'node:test';
import assert from 'node:assert/strict';

const NON_NEGOTIABLE_HOOKS = [
  'confounder_check',
  'stop_blocking',
  'integrity_degradation_tracking',
  'schema_file_protection'
];

const PROFILE_HOOKS = {
  minimal: [...NON_NEGOTIABLE_HOOKS],
  standard: [...NON_NEGOTIABLE_HOOKS, 'observer_scans', 'pattern_extraction', 'calibration_hints', 'memory_sync_reminders'],
  strict: [...NON_NEGOTIABLE_HOOKS, 'observer_scans', 'pattern_extraction', 'calibration_hints', 'memory_sync_reminders']
};

function applyDisabledHooks(profile, disabledHooks) {
  const disabled = new Set(disabledHooks);
  return PROFILE_HOOKS[profile].filter((hook) => !disabled.has(hook) || NON_NEGOTIABLE_HOOKS.includes(hook));
}

test('minimal profile still runs all non-negotiable hooks', () => {
  assert.deepEqual(PROFILE_HOOKS.minimal, NON_NEGOTIABLE_HOOKS);
});

test('disabled hooks cannot suppress non-negotiable safeguards', () => {
  const resultingHooks = applyDisabledHooks('standard', ['observer_scans', 'stop_blocking', 'confounder_check']);
  assert.ok(resultingHooks.includes('stop_blocking'));
  assert.ok(resultingHooks.includes('confounder_check'));
  assert.ok(!resultingHooks.includes('observer_scans'));
});

test('strict profile keeps at least the standard advisory surface', () => {
  assert.deepEqual(PROFILE_HOOKS.strict, PROFILE_HOOKS.standard);
});
