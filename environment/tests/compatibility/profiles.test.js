import test from 'node:test';
import assert from 'node:assert/strict';

const NON_NEGOTIABLE_HOOKS = [
  'confounder_check',
  'stop_blocking',
  'integrity_degradation_tracking',
  'schema_file_protection'
];

const MODE_HOOKS = {
  default: [...NON_NEGOTIABLE_HOOKS, 'observer_scans', 'pattern_extraction', 'calibration_hints', 'memory_sync_reminders'],
  strict: [...NON_NEGOTIABLE_HOOKS, 'observer_scans', 'pattern_extraction', 'calibration_hints', 'memory_sync_reminders']
};

function applyDisabledHooks(mode, disabledHooks) {
  const disabled = new Set(disabledHooks);
  return MODE_HOOKS[mode].filter((hook) => !disabled.has(hook) || NON_NEGOTIABLE_HOOKS.includes(hook));
}

test('default mode still includes all non-negotiable safeguards', () => {
  assert.ok(NON_NEGOTIABLE_HOOKS.every((hook) => MODE_HOOKS.default.includes(hook)));
});

test('disabled hooks cannot suppress non-negotiable safeguards', () => {
  const resultingHooks = applyDisabledHooks('default', ['observer_scans', 'stop_blocking', 'confounder_check']);
  assert.ok(resultingHooks.includes('stop_blocking'));
  assert.ok(resultingHooks.includes('confounder_check'));
  assert.ok(!resultingHooks.includes('observer_scans'));
});

test('strict mode keeps the default advisory surface while tightening failure semantics', () => {
  assert.deepEqual(MODE_HOOKS.strict, MODE_HOOKS.default);
});
