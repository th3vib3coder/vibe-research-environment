import {
  ManifestNotFoundError,
  ManifestValidationError,
  readManifest
} from '../lib/manifest.js';
import {
  readObjectiveRecord,
  writeObjectiveArtifactsIndex
} from '../objectives/store.js';

export class ExperimentManifestBindingError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ExperimentManifestBindingValidationError extends ExperimentManifestBindingError {}

export function listObjectiveExperimentBindings(objectiveRecord) {
  const experiments = Array.isArray(objectiveRecord?.artifactsIndex?.experiments)
    ? objectiveRecord.artifactsIndex.experiments.filter(
        (experimentId) => typeof experimentId === 'string' && experimentId.trim() !== ''
      )
    : [];

  return [...new Set(experiments)];
}

export function assertObjectiveExperimentBinding(objectiveRecord, experimentId) {
  if (!listObjectiveExperimentBindings(objectiveRecord).includes(experimentId)) {
    throw new ExperimentManifestBindingValidationError(
      `Analysis manifest experimentId ${experimentId} is not bound to objective ${objectiveRecord?.objectiveId ?? '<unknown>'}.`
    );
  }
}

export async function readExistingExperimentManifest(projectPath, experimentId) {
  try {
    return await readManifest(projectPath, experimentId);
  } catch (error) {
    if (error instanceof ManifestNotFoundError || error instanceof ManifestValidationError) {
      throw new ExperimentManifestBindingValidationError(error.message, { cause: error });
    }
    throw error;
  }
}

export async function resolveObjectiveExperimentManifestBinding(projectPath, objectiveRecord, experimentId) {
  assertObjectiveExperimentBinding(objectiveRecord, experimentId);
  const experimentManifest = await readExistingExperimentManifest(projectPath, experimentId);
  return {
    objectiveRecord,
    experimentManifest
  };
}

export async function bindExperimentManifestToObjective(projectPath, objectiveId, experimentId, options = {}) {
  const experimentManifest = await readExistingExperimentManifest(projectPath, experimentId);
  const objectiveRecord = await readObjectiveRecord(projectPath, objectiveId);
  const existingBindings = listObjectiveExperimentBindings(objectiveRecord);

  if (existingBindings.includes(experimentId)) {
    return {
      experimentManifest,
      objectiveRecord,
      createdBinding: false
    };
  }

  const updatedRecord = await writeObjectiveArtifactsIndex(
    projectPath,
    objectiveId,
    {
      ...objectiveRecord.artifactsIndex,
      experiments: [...existingBindings, experimentId]
    },
    {
      updatedAt: options.updatedAt
    }
  );

  return {
    experimentManifest,
    objectiveRecord: updatedRecord,
    createdBinding: true
  };
}
