export const metricId = 'snapshot-publish-success';
export const description = 'Checks that the canonical session snapshot was actually published and remained valid.';

export function evaluate(input) {
  const snapshotExists = input.snapshotExists ?? input.snapshot != null;
  const schemaValid = input.schemaValid ?? snapshotExists;
  const publishError = input.publishError ?? null;

  return {
    metricId,
    passed: snapshotExists && schemaValid && !publishError,
    value: snapshotExists && schemaValid && !publishError ? 1 : 0,
    details: {
      snapshotExists,
      schemaValid,
      publishError
    }
  };
}
