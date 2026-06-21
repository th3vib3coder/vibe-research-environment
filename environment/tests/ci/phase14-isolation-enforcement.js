import { readFile } from 'node:fs/promises';

import { assert, isDirectRun, runValidator } from './_helpers.js';

export const PHASE14_ISOLATION_SCRIPT = 'test:phase14-isolation';

export const REQUIRED_PHASE14_ISOLATION_SCRIPT_MEMBERS = Object.freeze([
  'environment/tests/ci/validate-edition-isolation.js',
  'environment/tests/autonomous/l0/halt.test.js',
  'environment/tests/ci/phase14-tracking-drift.js',
  'environment/tests/phase14/tracking-drift-ci-wired.test.js',
]);

export const REQUIRED_RUN_ALL_MEMBERS = Object.freeze([
  'validate-edition-isolation',
  'phase14-tracking-drift',
]);

const PHASE13_HALT_TEST = 'environment/tests/autonomous/l0/halt.test.js';

function scriptsFromPackage(packageJson) {
  return packageJson?.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts
    : {};
}

function assertScriptMember(scriptName, scriptValue, member) {
  assert(
    typeof scriptValue === 'string' && scriptValue.includes(member),
    `E_PHASE14_ISOLATION_SCRIPT_MEMBER_MISSING ${scriptName} ${member}`
  );
}

export function validatePhase14IsolationConfiguration({
  packageJson,
  runAllSource,
}) {
  const scripts = scriptsFromPackage(packageJson);
  const isolationScript = scripts[PHASE14_ISOLATION_SCRIPT];

  assert(
    typeof isolationScript === 'string' && isolationScript.trim().length > 0,
    `E_PHASE14_ISOLATION_SCRIPT_MISSING ${PHASE14_ISOLATION_SCRIPT}`
  );

  for (const member of REQUIRED_PHASE14_ISOLATION_SCRIPT_MEMBERS) {
    assertScriptMember(PHASE14_ISOLATION_SCRIPT, isolationScript, member);
  }

  const phase13Script = scripts['test:phase13'];
  assert(
    typeof phase13Script === 'string' && phase13Script.includes(PHASE13_HALT_TEST),
    `E_PHASE14_PHASE13_HALT_TEST_MISSING ${PHASE13_HALT_TEST}`
  );

  for (const member of REQUIRED_RUN_ALL_MEMBERS) {
    assert(
      typeof runAllSource === 'string' && runAllSource.includes(member),
      `E_PHASE14_RUN_ALL_MEMBER_MISSING ${member}`
    );
  }
}

export default async function validatePhase14IsolationEnforcement() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const runAllSource = await readFile('environment/tests/ci/run-all.js', 'utf8');
  validatePhase14IsolationConfiguration({ packageJson, runAllSource });
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase14-isolation-enforcement',
    validatePhase14IsolationEnforcement
  );
}
