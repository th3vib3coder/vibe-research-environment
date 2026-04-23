import path from 'node:path';
import { readFile } from 'node:fs/promises';

import {
  assertValid,
  loadValidator,
  resolveProjectRoot
} from '../control/_io.js';
import {
  ManifestNotFoundError,
  readManifest
} from '../lib/manifest.js';
import {
  readActiveObjectivePointer,
  readObjectiveRecord,
  resolveSchemaHostRoot
} from '../objectives/store.js';

export const ANALYSIS_MANIFEST_SCHEMA_FILE = 'phase9-analysis-manifest.schema.json';
export const ANALYSIS_MANIFEST_SCHEMA_VERSION = 'phase9.analysis-manifest.v1';
export const ANALYSIS_MANIFEST_TASK_KIND = 'analysis-execution-run';

export class AnalysisManifestError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class AnalysisManifestValidationError extends AnalysisManifestError {}

async function loadAnalysisManifestValidator(projectRoot) {
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, ANALYSIS_MANIFEST_SCHEMA_FILE);
  return loadValidator(schemaHostRoot, ANALYSIS_MANIFEST_SCHEMA_FILE);
}

function resolveProjectLocalPath(projectRoot, repoRelativePath, label) {
  if (typeof repoRelativePath !== 'string' || repoRelativePath.trim() === '') {
    throw new AnalysisManifestValidationError(`${label} must be a non-empty string.`);
  }

  const resolvedPath = path.resolve(projectRoot, repoRelativePath);
  const relativePath = path.relative(projectRoot, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new AnalysisManifestValidationError(`${label} must stay inside the project root.`);
  }

  return resolvedPath;
}

function assertObjectiveExperimentBinding(objectiveRecord, experimentId) {
  const experiments = Array.isArray(objectiveRecord?.artifactsIndex?.experiments)
    ? objectiveRecord.artifactsIndex.experiments
    : [];

  if (!experiments.includes(experimentId)) {
    throw new AnalysisManifestValidationError(
      `Analysis manifest experimentId ${experimentId} is not bound to objective ${objectiveRecord.objectiveId}.`
    );
  }
}

export async function validateAnalysisManifest(projectPath, manifest) {
  const projectRoot = resolveProjectRoot(projectPath);
  const validate = await loadAnalysisManifestValidator(projectRoot);
  assertValid(validate, manifest, 'phase9 analysis manifest');

  resolveProjectLocalPath(projectRoot, manifest.script.path, 'script.path');
  for (const input of manifest.inputs) {
    resolveProjectLocalPath(projectRoot, input.path, `input path (${input.kind})`);
  }
  for (const output of manifest.outputs) {
    resolveProjectLocalPath(projectRoot, output.path, `output path (${output.kind})`);
  }
  for (const artifact of manifest.expectedArtifacts) {
    resolveProjectLocalPath(projectRoot, artifact.path, `expected artifact path (${artifact.kind})`);
  }

  const activePointer = await readActiveObjectivePointer(projectRoot);
  if (!activePointer) {
    throw new AnalysisManifestValidationError(
      'Analysis manifest requires an active objective pointer before execution can be sanctioned.'
    );
  }
  if (activePointer.objectiveId !== manifest.objectiveId) {
    throw new AnalysisManifestValidationError(
      `Analysis manifest objectiveId ${manifest.objectiveId} does not match active objective ${activePointer.objectiveId}.`
    );
  }

  let objectiveRecord;
  try {
    objectiveRecord = await readObjectiveRecord(projectRoot, manifest.objectiveId);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new AnalysisManifestValidationError(
        `Analysis manifest objectiveId ${manifest.objectiveId} does not reference an existing objective record.`,
        { cause: error }
      );
    }
    throw error;
  }

  if (manifest.safety.destructive || manifest.safety.treeWideWrite) {
    if (manifest.humanApproval.approved !== true) {
      throw new AnalysisManifestValidationError(
        'Analysis manifest requires explicit human approval for destructive or tree-wide execution.'
      );
    }
  }

  const registrationMode = manifest.experimentRegistration?.mode ?? 'existing';
  if (registrationMode === 'same-transaction-register') {
    resolveProjectLocalPath(
      projectRoot,
      manifest.experimentRegistration.registerInputPath,
      'experimentRegistration.registerInputPath'
    );
    return {
      manifest,
      objectiveRecord,
      activePointer,
      experimentManifest: null
    };
  }

  assertObjectiveExperimentBinding(objectiveRecord, manifest.experimentId);

  try {
    const experimentManifest = await readManifest(projectRoot, manifest.experimentId);
    return {
      manifest,
      objectiveRecord,
      activePointer,
      experimentManifest
    };
  } catch (error) {
    if (error instanceof ManifestNotFoundError) {
      throw new AnalysisManifestValidationError(
        `Analysis manifest experimentId ${manifest.experimentId} does not reference an existing experiment manifest.`,
        { cause: error }
      );
    }
    throw error;
  }
}

export async function readAndValidateAnalysisManifest(projectPath, manifestPath) {
  const projectRoot = resolveProjectRoot(projectPath);
  const absoluteManifestPath = resolveProjectLocalPath(projectRoot, manifestPath, 'manifestPath');
  const manifest = JSON.parse(await readFile(absoluteManifestPath, 'utf8'));
  const validation = await validateAnalysisManifest(projectRoot, manifest);
  return {
    ...validation,
    manifestPath: absoluteManifestPath
  };
}
