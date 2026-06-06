#!/usr/bin/env node
import {
  runWave6AcceptanceAggregate,
  runWave6AcceptanceScenario,
  WAVE6_SCENARIOS,
  Wave6AcceptanceError
} from './wave6-harness.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    all: false,
    objectiveId: process.env.WAVE6_ACCEPTANCE_OBJECTIVE_ID ?? 'OBJ-W6-ACCEPTANCE',
    scenarioId: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--objective') {
      options.objectiveId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--objective=')) {
      options.objectiveId = arg.slice('--objective='.length);
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Wave6AcceptanceError(
        'E_WAVE6_CLI_USAGE',
        `Unknown Wave 6 acceptance option: ${arg}`
      );
    }
    if (options.scenarioId != null) {
      throw new Wave6AcceptanceError(
        'E_WAVE6_CLI_USAGE',
        `Only one scenario id is accepted; got ${options.scenarioId} and ${arg}.`
      );
    }
    options.scenarioId = arg;
  }

  if (!options.all && options.scenarioId == null) {
    throw new Wave6AcceptanceError(
      'E_WAVE6_CLI_USAGE',
      `Expected --all or one scenario id: ${WAVE6_SCENARIOS.map((scenario) => scenario.id).join(', ')}.`
    );
  }
  if (options.all && options.scenarioId != null) {
    throw new Wave6AcceptanceError(
      'E_WAVE6_CLI_USAGE',
      '--all cannot be combined with a scenario id.'
    );
  }
  return options;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  const options = parseArgs(process.argv);
  const result = options.all
    ? await runWave6AcceptanceAggregate({
      projectRoot: process.cwd(),
      objectiveId: options.objectiveId
    })
    : await runWave6AcceptanceScenario({
      projectRoot: process.cwd(),
      scenarioId: options.scenarioId,
      objectiveId: options.objectiveId
    });

  writeJson(result);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  writeJson({
    ok: false,
    code: error?.code ?? 'E_WAVE6_ACCEPTANCE_FAILED',
    message: error?.message ?? String(error)
  });
  process.exitCode = error?.code === 'E_WAVE6_CLI_USAGE' ? 3 : 2;
}
