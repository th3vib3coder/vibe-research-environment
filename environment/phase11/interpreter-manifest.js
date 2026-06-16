const INTERPRETER_LANGUAGES = new Set(['python', 'r', 'notebook']);
const INTERPRETER_RUNNERS = new Set(['python', 'Rscript', 'jupyter']);
const PYTHON_314_HEAVY_STACK = new Set(['numba', 'pynndescent', 'umap', 'scanpy']);

export class InterpreterManifestEnvironmentError extends Error {
  constructor(issue) {
    super(`${issue.code}: ${issue.message}`);
    this.name = 'InterpreterManifestEnvironmentError';
    this.code = issue.code;
    this.issue = issue;
  }
}

function addIssue(issues, code, message, pathValue = null) {
  issues.push({ code, message, path: pathValue });
}

function isInterpreterManifest(manifest) {
  return INTERPRETER_LANGUAGES.has(manifest?.script?.language)
    || INTERPRETER_RUNNERS.has(manifest?.command?.runner);
}

function dependencyNames(environment = {}) {
  return new Set(
    (environment.dependencyPins ?? [])
      .map((pin) => String(pin.name ?? '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function isPython314(version) {
  return /^3\.14(?:\.|$)/u.test(String(version ?? '').trim());
}

function hasPersonalOrAbsoluteExecutableHint(value) {
  const hint = String(value ?? '');
  return /^[A-Za-z]:/u.test(hint)
    || hint.startsWith('/')
    || /(?:^|[\\/])Users[\\/]/u.test(hint);
}

function hasHashOrDeferredReason(ref) {
  if (!ref || typeof ref !== 'object') return false;
  if (/^[a-f0-9]{64}$/u.test(String(ref.sha256 ?? ''))) return true;
  return typeof ref.hashDeferredReason === 'string' && ref.hashDeferredReason.trim() !== '';
}

function dependencyPinsHaveExactVersions(environment = {}) {
  return (environment.dependencyPins ?? []).every((pin) =>
    typeof pin.version === 'string' && pin.version.trim() !== ''
  );
}

function hasPython314HeavyStack(environment = {}) {
  if (
    environment.interpreterKind !== 'python'
    || !isPython314(environment.interpreterVersion)
  ) {
    return false;
  }

  const names = dependencyNames(environment);
  return [...PYTHON_314_HEAVY_STACK].some((name) => names.has(name));
}

function expectedInterpreterKind(manifest) {
  switch (manifest?.script?.language) {
    case 'python':
      return 'python';
    case 'r':
      return 'r';
    case 'notebook':
      return 'notebook';
    default:
      return null;
  }
}

function expectedRunner(manifest) {
  switch (manifest?.script?.language) {
    case 'python':
      return 'python';
    case 'r':
      return 'Rscript';
    case 'notebook':
      return 'jupyter';
    default:
      return null;
  }
}

export function evaluateInterpreterManifestEnvironment(manifest) {
  const issues = [];

  if (!isInterpreterManifest(manifest)) {
    return {
      ok: true,
      runnable: false,
      scientificReady: false,
      opensExecutor: false,
      requiresEnvironment: false,
      issues
    };
  }

  const environment = manifest.environment;
  if (!environment || typeof environment !== 'object') {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_ENV_REQUIRED',
      'Python/R/notebook analysis manifests require a pinned interpreter environment.',
      'environment'
    );
  }

  const expectedKind = expectedInterpreterKind(manifest);
  if (environment && expectedKind && environment.interpreterKind !== expectedKind) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_KIND_MISMATCH',
      `script.language=${manifest.script.language} requires environment.interpreterKind=${expectedKind}.`,
      'environment.interpreterKind'
    );
  }

  const expectedCommandRunner = expectedRunner(manifest);
  if (expectedCommandRunner && manifest.command?.runner !== expectedCommandRunner) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_RUNNER_MISMATCH',
      `script.language=${manifest.script.language} requires command.runner=${expectedCommandRunner}.`,
      'command.runner'
    );
  }

  if (environment?.resolutionStatus !== 'resolved') {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_ENV_BLOCKED',
      'Interpreter environment must be resolved before it can be runnable.',
      'environment.resolutionStatus'
    );
  }

  if (environment && hasPython314HeavyStack(environment)) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_PY314_HEAVY_STACK_BLOCKED',
      'Python 3.14 with numba/pynndescent/UMAP/scanpy is a known fail-closed seam.',
      'environment.dependencyPins'
    );
  }

  if (environment && hasPersonalOrAbsoluteExecutableHint(environment.executableHint)) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_PERSONAL_EXECUTABLE_FORBIDDEN',
      'Interpreter executableHint must be non-personal and non-absolute.',
      'environment.executableHint'
    );
  }

  if (environment && !hasHashOrDeferredReason(environment.dependencyLock)) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_LOCK_HASH_REQUIRED',
      'Interpreter dependency lock requires a hash or explicit deferred-hash reason.',
      'environment.dependencyLock'
    );
  }

  if (environment && !dependencyPinsHaveExactVersions(environment)) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_DEP_VERSION_REQUIRED',
      'Interpreter dependency pins require exact non-empty versions.',
      'environment.dependencyPins'
    );
  }

  if (manifest.budget?.allowNetwork !== false || manifest.safety?.externalCall !== false) {
    addIssue(
      issues,
      'E_PHASE11_INTERPRETER_NETWORK_FORBIDDEN',
      'Interpreter manifests require allowNetwork=false and safety.externalCall=false.',
      'budget.allowNetwork'
    );
  }

  const ok = issues.length === 0;
  return {
    ok,
    runnable: ok && environment?.resolutionStatus === 'resolved',
    scientificReady: false,
    opensExecutor: false,
    requiresEnvironment: true,
    issues
  };
}

export function assertInterpreterManifestEnvironment(manifest) {
  const result = evaluateInterpreterManifestEnvironment(manifest);
  if (!result.ok) {
    throw new InterpreterManifestEnvironmentError(result.issues[0]);
  }
  return result;
}

export function assertInterpreterManifestEnvironmentPaths(manifest, resolvePath) {
  if (!isInterpreterManifest(manifest) || !manifest.environment || typeof resolvePath !== 'function') {
    return;
  }

  const refs = [
    { ref: manifest.environment.dependencyLock, label: 'environment.dependencyLock.path' },
    ...(manifest.environment.environmentFiles ?? []).map((ref, index) => ({
      ref,
      label: `environment.environmentFiles[${index}].path`
    }))
  ];

  for (const { ref, label } of refs) {
    if (ref?.path) {
      resolvePath(ref.path, label);
    }
  }
}
