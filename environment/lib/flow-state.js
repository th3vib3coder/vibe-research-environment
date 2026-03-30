import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const FLOW_SPECS = {
  index: {
    fileName: 'index.json',
    schemaFile: 'flow-index.schema.json',
    templateFile: 'flow-index.v1.json'
  },
  literature: {
    fileName: 'literature.json',
    schemaFile: 'literature-flow-state.schema.json',
    templateFile: 'literature-flow-state.v1.json'
  },
  experiment: {
    fileName: 'experiment.json',
    schemaFile: 'experiment-flow-state.schema.json',
    templateFile: 'experiment-flow-state.v1.json'
  }
};

const validatorCache = new Map();

function resolveProjectRoot(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new TypeError('projectPath must be a non-empty string');
  }

  return path.resolve(projectPath);
}

function resolveInside(baseDir, ...segments) {
  const target = path.resolve(baseDir, ...segments);
  const relative = path.relative(baseDir, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Resolved path escapes base directory: ${target}`);
  }

  return target;
}

function getFlowsRoot(projectRoot) {
  return resolveInside(projectRoot, '.vibe-science-environment', 'flows');
}

function getSchemaPath(projectRoot, schemaFile) {
  return resolveInside(projectRoot, 'environment', 'schemas', schemaFile);
}

function getTemplatePath(projectRoot, templateFile) {
  return resolveInside(projectRoot, 'environment', 'templates', templateFile);
}

function getFlowPath(projectRoot, fileName) {
  return resolveInside(getFlowsRoot(projectRoot), fileName);
}

function getFlowSpec(flowName) {
  if (flowName === 'literature') {
    return FLOW_SPECS.literature;
  }

  if (flowName === 'experiment') {
    return FLOW_SPECS.experiment;
  }

  throw new RangeError(`Unsupported flow name: ${flowName}`);
}

async function readJson(filePath) {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents);
}

async function loadValidator(projectRoot, schemaFile) {
  const schemaPath = getSchemaPath(projectRoot, schemaFile);
  if (validatorCache.has(schemaPath)) {
    return validatorCache.get(schemaPath);
  }

  const schema = await readJson(schemaPath);
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  validatorCache.set(schemaPath, validate);
  return validate;
}

function formatValidationErrors(validate) {
  const errors = validate.errors ?? [];
  return errors
    .map((error) => {
      const where = error.instancePath || '(root)';
      return `${where} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

function assertValid(validate, data, label) {
  if (validate(data)) {
    return;
  }

  const details = formatValidationErrors(validate);
  throw new Error(`Invalid ${label}: ${details}`);
}

async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tempName = `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  const tempPath = path.join(dir, tempName);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;

  await writeFile(tempPath, serialized, 'utf8');

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function loadTemplate(projectRoot, spec, label) {
  const validate = await loadValidator(projectRoot, spec.schemaFile);
  const templatePath = getTemplatePath(projectRoot, spec.templateFile);
  const template = await readJson(templatePath);
  assertValid(validate, template, `${label} template`);
  return template;
}

async function readOrBootstrap(projectPath, spec, label) {
  const projectRoot = resolveProjectRoot(projectPath);
  const filePath = getFlowPath(projectRoot, spec.fileName);
  const validate = await loadValidator(projectRoot, spec.schemaFile);

  try {
    const current = await readJson(filePath);
    assertValid(validate, current, label);
    return current;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const template = await loadTemplate(projectRoot, spec, label);
  await atomicWriteJson(filePath, template);
  return template;
}

async function validateAndWrite(projectPath, spec, label, data) {
  const projectRoot = resolveProjectRoot(projectPath);
  const flowsRoot = getFlowsRoot(projectRoot);
  const filePath = getFlowPath(projectRoot, spec.fileName);
  const validate = await loadValidator(projectRoot, spec.schemaFile);

  assertValid(validate, data, label);
  await mkdir(flowsRoot, { recursive: true });
  await atomicWriteJson(filePath, data);
  return data;
}

export async function readFlowIndex(projectPath) {
  return readOrBootstrap(projectPath, FLOW_SPECS.index, 'flow index');
}

export async function writeFlowIndex(projectPath, data) {
  return validateAndWrite(projectPath, FLOW_SPECS.index, 'flow index', data);
}

export async function readFlowState(projectPath, flowName) {
  const spec = getFlowSpec(flowName);
  return readOrBootstrap(projectPath, spec, `${flowName} flow state`);
}

export async function writeFlowState(projectPath, flowName, data) {
  const spec = getFlowSpec(flowName);
  return validateAndWrite(projectPath, spec, `${flowName} flow state`, data);
}
