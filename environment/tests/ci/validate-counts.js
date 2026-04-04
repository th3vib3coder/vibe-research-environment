import { assert, collectFiles, isDirectRun } from './_helpers.js';

const expectedCounts = {
  bundleManifests: 10,
  schemas: 25,
  templates: 7,
  evalTasks: 15,
  evalMetrics: 5,
  evalBenchmarks: 3,
  controlTests: 7,
  compatibilityTests: 4,
  flowTests: 7,
  libTests: 11,
  evalTests: 2,
  installTests: 5,
  integrationTests: 10,
  schemaTests: 25,
  ciValidators: 9
};

export default async function validateCounts() {
  const actualCounts = {
    bundleManifests: (await collectFiles('environment/install/bundles', { include: (file) => file.endsWith('.bundle.json') })).length,
    schemas: (await collectFiles('environment/schemas', { include: (file) => file.endsWith('.schema.json') })).length,
    templates: (await collectFiles('environment/templates', { include: (file) => file.endsWith('.json') })).length,
    evalTasks: (await collectFiles('environment/evals/tasks', { include: (file) => file.endsWith('.json') && !file.endsWith('.gitkeep') })).length,
    evalMetrics: (await collectFiles('environment/evals/metrics', { include: (file) => file.endsWith('.js') && !file.endsWith('.gitkeep') })).length,
    evalBenchmarks: (await collectFiles('environment/evals/benchmarks', { include: (file) => file.endsWith('.json') && !file.endsWith('.gitkeep') })).length,
    controlTests: (await collectFiles('environment/tests/control', { include: (file) => file.endsWith('.test.js') })).length,
    compatibilityTests: (await collectFiles('environment/tests/compatibility', { include: (file) => file.endsWith('.test.js') })).length,
    flowTests: (await collectFiles('environment/tests/flows', { include: (file) => file.endsWith('.test.js') })).length,
    libTests: (await collectFiles('environment/tests/lib', { include: (file) => file.endsWith('.test.js') })).length,
    evalTests: (await collectFiles('environment/tests/evals', { include: (file) => file.endsWith('.test.js') })).length,
    installTests: (await collectFiles('environment/tests/install', { include: (file) => file.endsWith('.test.js') })).length,
    integrationTests: (await collectFiles('environment/tests/integration', { include: (file) => file.endsWith('.test.js') && !file.endsWith('_fixture.js') })).length,
    schemaTests: (await collectFiles('environment/tests/schemas', { include: (file) => file.endsWith('.test.js') })).length,
    ciValidators: (await collectFiles('environment/tests/ci', { include: (file) => file.endsWith('.js') && !file.endsWith('_helpers.js') && !file.endsWith('run-all.js') })).length
  };

  for (const [key, expected] of Object.entries(expectedCounts)) {
    assert(actualCounts[key] === expected, `Count mismatch for ${key}: expected ${expected}, got ${actualCounts[key]}`);
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-counts', validateCounts);
}
