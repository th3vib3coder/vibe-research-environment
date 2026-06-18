import { readFile } from 'node:fs/promises';

import { assert, collectFiles, isDirectRun, runValidator } from './_helpers.js';
import {
  isAutonomyEnabled,
  listAutonomousEntrypoints
} from '../../autonomous/gate.js';
import {
  DISPATCH_TABLE,
  IMPLEMENTED_PHASE9_COMMANDS
} from '../../../bin/vre';
import { getTaskRegistry } from '../../orchestrator/task-registry.js';

const ALLOWED_AUTONOMOUS_IMPORTERS = new Set([
  'bin/vre'
]);

function includesAutonomousRuntime(value) {
  return /autonomous/iu.test(value);
}

async function assertProductionImportBoundary() {
  const files = await collectFiles('.', {
    include: (file) =>
      file.endsWith('.js') &&
      (
        file === 'bin/vre' ||
        file.startsWith('environment/')
      ) &&
      !file.startsWith('environment/autonomous/') &&
      !file.startsWith('environment/tests/') &&
      !file.startsWith('environment/evals/')
  });

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assertNoAutonomousTreeImport(file, text);
  }
}

export function assertNoAutonomousTreeImport(file, text) {
  const importsAutonomousTree =
    /from\s+['"][^'"]*environment\/autonomous/u.test(text) ||
    /from\s+['"][^'"]*\.\.\/autonomous/u.test(text) ||
    /import\([^)]*environment\/autonomous/u.test(text) ||
    /import\([^)]*\.\.\/autonomous/u.test(text);
  if (importsAutonomousTree && !ALLOWED_AUTONOMOUS_IMPORTERS.has(file)) {
    throw new Error(`E_PHASE13_BASE_IMPORTS_AUTONOMOUS ${file}`);
  }
}

async function assertTaskRegistryIsolation() {
  const registry = await getTaskRegistry();
  const autonomousKinds = [...registry.keys()]
    .filter((taskKind) => includesAutonomousRuntime(taskKind));
  assert(
    autonomousKinds.length === 0,
    `E_PHASE13_AUTONOMOUS_TASK_KIND_EXPOSED ${autonomousKinds.join(',')}`
  );
}

async function assertCliSurfaceIsolation() {
  const executableCommands = [
    ...Object.keys(DISPATCH_TABLE),
    ...IMPLEMENTED_PHASE9_COMMANDS
  ];
  const autonomousCommands = executableCommands
    .filter((command) => command.startsWith('autonomous'));
  assert(
    autonomousCommands.length === 0,
    `E_PHASE13_AUTONOMOUS_COMMAND_EXPOSED ${autonomousCommands.join(',')}`
  );
}

async function assertProviderAndSchedulerIsolation() {
  const files = [
    'environment/orchestrator/provider-gateway.js',
    'environment/orchestrator/windows-task-scheduler.js',
    'environment/orchestrator/autonomy-runtime.js'
  ];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert(
      !text.includes('environment/autonomous') && !text.includes('../autonomous'),
      `E_PHASE13_RUNTIME_IMPORTS_AUTONOMOUS ${file}`
    );
  }
}

async function assertEntrypointsDefaultOff() {
  assert(isAutonomyEnabled({}) === false, 'E_PHASE13_AUTONOMY_DEFAULT_ON');
  const entrypoints = await listAutonomousEntrypoints();
  assert(entrypoints.length > 0, 'E_PHASE13_ENTRYPOINTS_EMPTY');
  for (const entrypoint of entrypoints) {
    assert(
      entrypoint.command.startsWith('autonomous '),
      `E_PHASE13_ENTRYPOINT_COMMAND ${entrypoint.command}`
    );
    assert(
      entrypoint.runtimeOpened === false,
      `E_PHASE13_ENTRYPOINT_RUNTIME_OPENED ${entrypoint.command}`
    );
  }
}

export default async function validateEditionIsolation() {
  await assertEntrypointsDefaultOff();
  await assertCliSurfaceIsolation();
  await assertTaskRegistryIsolation();
  await assertProviderAndSchedulerIsolation();
  await assertProductionImportBoundary();
}

if (isDirectRun(import.meta)) {
  await runValidator('validate-edition-isolation', validateEditionIsolation);
}
