import {
  assert,
  pathExists,
  validateWithSchema,
  formatErrors,
  isDirectRun,
  readJson
} from './_helpers.js';

const templateSchemaPairs = [
  ['environment/templates/session-snapshot.v1.json', 'environment/schemas/session-snapshot.schema.json'],
  ['environment/templates/attempt-record.v1.json', 'environment/schemas/attempt-record.schema.json'],
  ['environment/templates/flow-index.v1.json', 'environment/schemas/flow-index.schema.json'],
  ['environment/templates/literature-flow-state.v1.json', 'environment/schemas/literature-flow-state.schema.json'],
  ['environment/templates/experiment-flow-state.v1.json', 'environment/schemas/experiment-flow-state.schema.json'],
  ['environment/templates/experiment-manifest.v1.json', 'environment/schemas/experiment-manifest.schema.json']
];

const activeSchemaFiles = [
  'session-snapshot.schema.json',
  'capabilities-snapshot.schema.json',
  'attempt-record.schema.json',
  'event-record.schema.json',
  'decision-record.schema.json',
  'flow-index.schema.json',
  'literature-flow-state.schema.json',
  'experiment-flow-state.schema.json',
  'schema-validation-record.schema.json',
  'experiment-manifest.schema.json',
  'costs-record.schema.json',
  'install-state.schema.json'
];

export default async function validateRuntimeContracts() {
  for (const schemaFile of activeSchemaFiles) {
    assert(await pathExists(`environment/schemas/${schemaFile}`), `Missing active schema: ${schemaFile}`);
    assert(
      await pathExists(`environment/tests/schemas/${schemaFile.replace('.json', '.test.js')}`),
      `Missing schema test for ${schemaFile}`
    );
  }

  for (const [templatePath, schemaPath] of templateSchemaPairs) {
    const template = await readJson(templatePath);
    const result = await validateWithSchema(schemaPath, template);
    assert(result.ok, `Template ${templatePath} failed ${schemaPath}: ${formatErrors(result.errors)}`);
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-runtime-contracts', validateRuntimeContracts);
}
