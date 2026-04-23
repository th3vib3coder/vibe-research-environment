import {
  ManifestNotFoundError,
  ManifestValidationError,
  readManifest
} from '../lib/manifest.js';
import {
  mutateObjectiveArtifactsIndex,
  readObjectiveRecord
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
  // Fetch the experiment manifest OUTSIDE the objective-record lock: it
  // reads a different file and, if it fails, we want to fail BEFORE
  // touching the objective record. This mirrors the fail-closed ordering
  // that resume-snapshot divergence detection uses upstream.
  const experimentManifest = await readExistingExperimentManifest(projectPath, experimentId);

  // Read-modify-write the artifacts index atomically under the per-objective
  // record lock owned by mutateObjectiveArtifactsIndex. The mutator MUST
  // return the same reference for the no-op path so the store skips a
  // redundant write. See Round 56 in the plan log for the concurrent-bind
  // regression test that pins this semantic.
  const { objectiveRecord, artifactsIndexChanged } = await mutateObjectiveArtifactsIndex(
    projectPath,
    objectiveId,
    (currentIndex) => {
      const existingExperiments = Array.isArray(currentIndex?.experiments)
        ? currentIndex.experiments.filter(
            (candidate) => typeof candidate === 'string' && candidate.trim() !== ''
          )
        : [];
      const deduped = [...new Set(existingExperiments)];
      if (deduped.includes(experimentId)) {
        return currentIndex;
      }
      return {
        ...currentIndex,
        experiments: [...deduped, experimentId]
      };
    },
    {
      updatedAt: options.updatedAt
    }
  );

  return {
    experimentManifest,
    objectiveRecord,
    createdBinding: artifactsIndexChanged
  };
}
