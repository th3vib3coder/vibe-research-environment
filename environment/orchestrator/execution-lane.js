import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { now } from '../control/_io.js';
import { resolveProjectRoot } from '../control/_io.js';
import { appendObjectiveEvent } from '../objectives/resume-snapshot.js';
import {
  appendEscalationRecord,
  appendLaneRun,
  appendPhase9LaneRun,
  appendRecoveryRecord,
  listLaneRuns,
} from './ledgers.js';
import {
  AnalysisManifestValidationError,
  readAndValidateAnalysisManifest,
} from './analysis-manifest.js';
import { resolveOrchestratorPath } from './_paths.js';
import { selectLaneBinding } from './provider-gateway.js';
import { getQueueTask, appendQueueStatusTransition } from './queue.js';
import { getDefaultRecoveryPolicy } from './recovery.js';
import { readContinuityProfile, readLanePolicies } from './state.js';
import { getTaskEntry } from './task-registry.js';
import { getTaskAdapter } from './task-adapters.js';

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

const SAFE_RUN_ANALYSIS_ENV_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
]);
const APPROVED_NODE_SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const ALLOWED_OUTPUT_ROOTS = new Set(['artifacts', 'outputs', 'results']);
const PHASE9_LANE_RUNS_FILE = '.vibe-science-environment/orchestrator/lane-runs.jsonl';
const PHASE9_RUN_LOGS_DIR = '.vibe-science-environment/orchestrator/analysis-run-logs';
const RUN_ANALYSIS_COMMAND = 'run-analysis';

export class RunAnalysisCliError extends Error {
  constructor({ code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'RunAnalysisCliError';
    this.command = RUN_ANALYSIS_COMMAND;
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function toRepoRelative(projectRoot, targetPath) {
  return normalizeSlashes(path.relative(projectRoot, targetPath));
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function sanitizeRunAnalysisEnv() {
  const env = Object.create(null);
  for (const key of SAFE_RUN_ANALYSIS_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function resolveProjectLocalPath(projectRoot, repoRelativePath, label) {
  if (typeof repoRelativePath !== 'string' || repoRelativePath.trim() === '') {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_INVALID',
      message: `${label} must be a non-empty string.`,
    });
  }

  const resolvedPath = path.resolve(projectRoot, repoRelativePath);
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_INVALID',
      message: `${label} must stay inside the project root.`,
    });
  }
  return resolvedPath;
}

function ensureAllowedOutputRoots(manifest) {
  const candidatePaths = [
    ...manifest.outputs.map((entry) => entry.path),
    ...manifest.expectedArtifacts.map((entry) => entry.path),
  ];

  for (const repoRelativePath of candidatePaths) {
    const normalized = normalizeSlashes(repoRelativePath);
    const [rootSegment] = normalized.split('/');
    if (!ALLOWED_OUTPUT_ROOTS.has(rootSegment)) {
      throw new RunAnalysisCliError({
        code: 'E_ANALYSIS_TEMPLATE_INVALID',
        message:
          `Output path ${repoRelativePath} must stay inside approved artifact roots: ` +
          `${[...ALLOWED_OUTPUT_ROOTS].join(', ')}.`,
      });
    }
  }
}

function ensureApprovedCommandTemplate(projectRoot, manifest) {
  if (manifest.script.language === 'notebook') {
    throw new RunAnalysisCliError({
      code: 'E_NOTEBOOK_EXECUTION_DEFERRED',
      message: 'run-analysis v1 supports scripts only; notebook execution is deferred by the frozen Wave 3 plan.',
    });
  }

  if (manifest.script.language !== 'other') {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_UNSUPPORTED',
      message: 'run-analysis v1 supports only the reviewed Node-script command template (`script.language=other`, `runner=other`).',
    });
  }

  if (manifest.command.runner !== 'other') {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_UNSUPPORTED',
      message: `run-analysis v1 supports only runner=other; received ${manifest.command.runner}.`,
    });
  }

  if (manifest.budget.allowNetwork !== false || manifest.safety.externalCall !== false) {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_INVALID',
      message: 'run-analysis v1 requires allowNetwork=false and safety.externalCall=false.',
    });
  }

  ensureAllowedOutputRoots(manifest);

  const scriptAbsolutePath = resolveProjectLocalPath(projectRoot, manifest.script.path, 'script.path');
  const extension = path.extname(manifest.script.path).toLowerCase();
  if (!APPROVED_NODE_SCRIPT_EXTENSIONS.has(extension)) {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_UNSUPPORTED',
      message:
        `run-analysis v1 supports only Node-compatible script extensions ` +
        `(${[...APPROVED_NODE_SCRIPT_EXTENSIONS].join(', ')}).`,
    });
  }

  if (!Array.isArray(manifest.command.argv) || manifest.command.argv.length === 0) {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_INVALID',
      message: 'command.argv must contain the script path as argv[0].',
    });
  }

  if (manifest.command.argv[0] !== manifest.script.path) {
    throw new RunAnalysisCliError({
      code: 'E_ANALYSIS_TEMPLATE_INVALID',
      message: 'Approved command template requires command.argv[0] to equal script.path.',
    });
  }

  const declaredPathTokens = new Set([
    manifest.script.path,
    ...manifest.inputs.map((entry) => entry.path),
    ...manifest.outputs.map((entry) => entry.path),
    ...manifest.expectedArtifacts.map((entry) => entry.path),
  ]);

  for (const token of manifest.command.argv.slice(1)) {
    if (typeof token !== 'string') {
      throw new RunAnalysisCliError({
        code: 'E_ANALYSIS_TEMPLATE_INVALID',
        message: 'command.argv entries must be strings.',
      });
    }
    if (token.startsWith('-')) {
      continue;
    }
    if (!declaredPathTokens.has(token)) {
      throw new RunAnalysisCliError({
        code: 'E_ANALYSIS_TEMPLATE_INVALID',
        message:
          `Unapproved argv token "${token}". run-analysis v1 allows only flags and ` +
          `paths already declared in script/input/output/expectedArtifacts.`,
      });
    }
    resolveProjectLocalPath(projectRoot, token, `command.argv token ${token}`);
  }

  return {
    command: process.execPath,
    args: manifest.command.argv,
    scriptAbsolutePath,
  };
}

async function ensureManifestFilesExist(projectRoot, manifest) {
  const pathsToCheck = [
    { repoRelativePath: manifest.script.path, label: 'script.path' },
    ...manifest.inputs.map((entry) => ({
      repoRelativePath: entry.path,
      label: `input path (${entry.kind})`,
    })),
  ];

  for (const { repoRelativePath, label } of pathsToCheck) {
    const absolutePath = resolveProjectLocalPath(projectRoot, repoRelativePath, label);
    if (!(await pathExists(absolutePath))) {
      throw new RunAnalysisCliError({
        code: 'E_ANALYSIS_INPUT_MISSING',
        message: `${label} does not exist: ${repoRelativePath}`,
      });
    }
  }
}

function buildTaskId(manifest) {
  return `${manifest.taskKind}:${manifest.analysisId}`;
}

function buildProvenanceHash(fields) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(fields));
  return hash.digest('hex');
}

function buildExecutionLogPaths(projectRoot, manifest) {
  const stamp = now()
    .replace(/[:.]/gu, '-')
    .replace('T', '-')
    .replace('Z', '');
  const baseName = `${manifest.analysisId}-${stamp}-${process.pid}`;
  const stdoutPath = path.join(projectRoot, PHASE9_RUN_LOGS_DIR, `${baseName}.stdout.log`);
  const stderrPath = path.join(projectRoot, PHASE9_RUN_LOGS_DIR, `${baseName}.stderr.log`);
  return {
    stdoutPath,
    stderrPath,
    stdoutPathRelative: toRepoRelative(projectRoot, stdoutPath),
    stderrPathRelative: toRepoRelative(projectRoot, stderrPath),
  };
}

function resolveRunAnalysisTimeoutMs(maxRuntimeSeconds, env = process.env) {
  const manifestTimeoutMs = Math.max(1, maxRuntimeSeconds) * 1000;
  // Operator-level cap. seq 073 promised VRE_RUN_ANALYSIS_TIMEOUT_MS as a
  // feature flag but the runtime ignored it; Round 59 closes that gap by
  // allowing operators to tighten a permissive manifest budget without
  // widening it. The env var can only REDUCE the manifest timeout, never
  // extend it, so a misconfigured manifest cannot bypass an operator cap.
  const rawOverride = env.VRE_RUN_ANALYSIS_TIMEOUT_MS;
  if (typeof rawOverride !== 'string' || rawOverride.trim() === '') {
    return manifestTimeoutMs;
  }
  const parsed = Number.parseInt(rawOverride, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return manifestTimeoutMs;
  }
  return Math.min(parsed, manifestTimeoutMs);
}

async function executeApprovedManifest(projectRoot, approvedTemplate, maxRuntimeSeconds) {
  const timeoutMs = resolveRunAnalysisTimeoutMs(maxRuntimeSeconds);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(approvedTemplate.command, approvedTemplate.args, {
        cwd: projectRoot,
        env: sanitizeRunAnalysisEnv(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: `spawn failed: ${error.message}\n`,
        endedAt: now(),
        timedOut: false,
        spawnError: error,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killTimer = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 1_000);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr: `${stderr}spawn error: ${error.message}\n`,
        endedAt: now(),
        timedOut: false,
        spawnError: error,
      });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        endedAt: now(),
        timedOut,
        spawnError: null,
      });
    });
  });
}

async function persistExecutionLogs(projectRoot, manifest, execution) {
  const paths = buildExecutionLogPaths(projectRoot, manifest);
  await mkdir(path.dirname(paths.stdoutPath), { recursive: true });
  await writeFile(paths.stdoutPath, execution.stdout ?? '', 'utf8');
  await writeFile(paths.stderrPath, execution.stderr ?? '', 'utf8');
  return paths;
}

async function collectMissingRequiredOutputs(projectRoot, manifest) {
  const requiredOutputPaths = [
    ...manifest.outputs.map((entry) => entry.path),
    ...manifest.expectedArtifacts
      .filter((entry) => entry.required)
      .map((entry) => entry.path),
  ];
  const deduped = [...new Set(requiredOutputPaths)];
  const missing = [];

  for (const repoRelativePath of deduped) {
    const absolutePath = resolveProjectLocalPath(projectRoot, repoRelativePath, `output path ${repoRelativePath}`);
    if (!(await pathExists(absolutePath))) {
      missing.push(repoRelativePath);
    }
  }

  return missing.sort((left, right) => left.localeCompare(right));
}

function coerceRunAnalysisError(error) {
  if (error instanceof RunAnalysisCliError) {
    return error;
  }

  if (error instanceof AnalysisManifestValidationError) {
    const message = error.message;
    if (/active objective pointer/u.test(message)) {
      return new RunAnalysisCliError({
        code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
        message,
      });
    }
    if (/does not match active objective/u.test(message)) {
      return new RunAnalysisCliError({
        code: 'E_OBJECTIVE_ID_MISMATCH',
        message,
      });
    }
    if (/existing experiment manifest/u.test(message) || /not bound to objective/u.test(message)) {
      return new RunAnalysisCliError({
        code: 'E_EXPERIMENT_BINDING_MISSING',
        message,
      });
    }
    if (/human approval/u.test(message)) {
      return new RunAnalysisCliError({
        code: 'E_HUMAN_APPROVAL_REQUIRED',
        message,
      });
    }
    return new RunAnalysisCliError({
      code: 'E_ANALYSIS_MANIFEST_INVALID',
      message,
    });
  }

  return new RunAnalysisCliError({
    code: 'E_ANALYSIS_RUN_FAILED',
    message: error?.message ?? 'run-analysis failed',
  });
}

export async function runAnalysisCommand(projectPath, { manifestPath, dryRun = false } = {}) {
  try {
    const projectRoot = resolveProjectRoot(projectPath);
    const validated = await readAndValidateAnalysisManifest(projectRoot, manifestPath);
    const { manifest, objectiveRecord, activePointer, experimentManifest, manifestPath: absoluteManifestPath } = validated;

    if (objectiveRecord.status !== 'active') {
      throw new RunAnalysisCliError({
        code: 'E_OBJECTIVE_STATE_INVALID',
        message: `run-analysis requires objective ${objectiveRecord.objectiveId} to be active, not ${objectiveRecord.status}.`,
        extra: {
          objectiveId: objectiveRecord.objectiveId,
          status: objectiveRecord.status,
        },
      });
    }

    if (!activePointer) {
      throw new RunAnalysisCliError({
        code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
        message: 'run-analysis requires an active objective pointer.',
      });
    }

    if (!experimentManifest) {
      throw new RunAnalysisCliError({
        code: 'E_EXPERIMENT_REGISTRATION_UNSUPPORTED',
        message:
          'run-analysis v1 supports only existing experiment manifests; same-transaction experiment registration is deferred.',
      });
    }

    const approvedTemplate = ensureApprovedCommandTemplate(projectRoot, manifest);
    await ensureManifestFilesExist(projectRoot, manifest);

    const relativeManifestPath = toRepoRelative(projectRoot, absoluteManifestPath);
    const taskId = buildTaskId(manifest);

    if (dryRun) {
      return {
        ok: true,
        command: RUN_ANALYSIS_COMMAND,
        phase9: true,
        dryRun: true,
        objectiveId: manifest.objectiveId,
        experimentId: manifest.experimentId,
        analysisId: manifest.analysisId,
        taskId,
        manifestPath: relativeManifestPath,
        approvedCommand: {
          executable: approvedTemplate.command,
          argv: approvedTemplate.args,
        },
      };
    }

    const startedAt = now();
    const runningRecord = await appendPhase9LaneRun(projectRoot, {
      objectiveId: manifest.objectiveId,
      experimentId: manifest.experimentId,
      analysisId: manifest.analysisId,
      taskId,
      manifestPath: relativeManifestPath,
      scriptSha256: manifest.script.sha256,
      inputPaths: manifest.inputs.map((entry) => entry.path),
      outputPaths: manifest.outputs.map((entry) => entry.path),
      runner: manifest.command.runner,
      argv: manifest.command.argv,
      startedAt,
      endedAt: null,
      exitCode: null,
      stdoutPath: null,
      stderrPath: null,
      provenanceHash: buildProvenanceHash({
        manifestPath: relativeManifestPath,
        scriptSha256: manifest.script.sha256,
        taskId,
        startedAt,
        status: 'running',
      }),
      status: 'running',
    });

    const execution = await executeApprovedManifest(
      projectRoot,
      approvedTemplate,
      manifest.budget.maxRuntimeSeconds,
    );
    const logPaths = await persistExecutionLogs(projectRoot, manifest, execution);
    const missingOutputs = await collectMissingRequiredOutputs(projectRoot, manifest);
    const interrupted = execution.timedOut || execution.signal != null;
    const failed = execution.exitCode !== 0 || execution.spawnError != null || missingOutputs.length > 0;
    const finalStatus = interrupted ? 'interrupted' : failed ? 'failed' : 'complete';
    const finalRecord = await appendPhase9LaneRun(projectRoot, {
      objectiveId: manifest.objectiveId,
      experimentId: manifest.experimentId,
      analysisId: manifest.analysisId,
      taskId,
      manifestPath: relativeManifestPath,
      scriptSha256: manifest.script.sha256,
      inputPaths: manifest.inputs.map((entry) => entry.path),
      outputPaths: manifest.outputs.map((entry) => entry.path),
      runner: manifest.command.runner,
      argv: manifest.command.argv,
      startedAt,
      endedAt: execution.endedAt,
      exitCode: execution.exitCode,
      stdoutPath: logPaths.stdoutPathRelative,
      stderrPath: logPaths.stderrPathRelative,
      provenanceHash: buildProvenanceHash({
        manifestPath: relativeManifestPath,
        scriptSha256: manifest.script.sha256,
        taskId,
        startedAt,
        endedAt: execution.endedAt,
        exitCode: execution.exitCode,
        stdoutPath: logPaths.stdoutPathRelative,
        stderrPath: logPaths.stderrPathRelative,
        status: finalStatus,
        missingOutputs,
      }),
      status: finalStatus,
    });

    await appendObjectiveEvent(projectRoot, manifest.objectiveId, 'analysis-run', {
      analysisId: manifest.analysisId,
      experimentId: manifest.experimentId,
      taskId,
      manifestPath: relativeManifestPath,
      laneRecordSeq: finalRecord.recordSeq,
      status: finalStatus,
      exitCode: execution.exitCode,
      stdoutPath: logPaths.stdoutPathRelative,
      stderrPath: logPaths.stderrPathRelative,
      missingOutputs,
      dryRun: false,
    }, execution.endedAt);

    const resultDetails = {
      dryRun: false,
      objectiveId: manifest.objectiveId,
      experimentId: manifest.experimentId,
      analysisId: manifest.analysisId,
      taskId,
      manifestPath: relativeManifestPath,
      laneRunsPath: PHASE9_LANE_RUNS_FILE,
      runningRecordSeq: runningRecord.recordSeq,
      finalRecordSeq: finalRecord.recordSeq,
      status: finalStatus,
      exitCode: execution.exitCode,
      stdoutPath: logPaths.stdoutPathRelative,
      stderrPath: logPaths.stderrPathRelative,
      outputPaths: manifest.outputs.map((entry) => entry.path),
      missingOutputs,
    };

    if (finalStatus === 'complete') {
      return {
        ok: true,
        command: RUN_ANALYSIS_COMMAND,
        phase9: true,
        ...resultDetails,
      };
    }

    throw new RunAnalysisCliError({
      code:
        finalStatus === 'interrupted'
          ? 'E_ANALYSIS_RUN_INTERRUPTED'
          : execution.exitCode !== 0 || execution.spawnError != null
            ? 'E_ANALYSIS_RUN_FAILED'
            : 'E_EXPECTED_OUTPUT_MISSING',
      message:
        finalStatus === 'interrupted'
          ? `run-analysis was interrupted while executing ${manifest.analysisId}.`
          : missingOutputs.length > 0
            ? `run-analysis completed without all required outputs: ${missingOutputs.join(', ')}`
            : `run-analysis failed with exit code ${execution.exitCode}.`,
      extra: resultDetails,
    });
  } catch (error) {
    throw coerceRunAnalysisError(error);
  }
}

function classifyExecutionFailure(error) {
  if (error?.code === 'ENOENT') {
    return 'dependency-unavailable';
  }

  if (/schema|contract|validation/u.test(error?.message ?? '')) {
    return 'contract-mismatch';
  }

  return 'tool-failure';
}

async function nextAttemptNumber(projectPath, taskId) {
  const records = await listLaneRuns(projectPath, {
    laneId: 'execution',
    taskId,
  });
  return records.length + 1;
}

async function executeTaskClass(projectPath, task, input = {}) {
  const taskKind = task.targetRef?.kind ?? null;
  if (!taskKind) {
    throw new Error('Execution task requires targetRef.kind.');
  }

  const entry = await getTaskEntry(taskKind);
  if (!entry) {
    throw new Error(`Unsupported execution task kind: ${taskKind}`);
  }
  if (entry.lane !== 'execution') {
    throw new Error(`Task kind ${taskKind} is registered for ${entry.lane} lane, not execution.`);
  }

  const adapter = getTaskAdapter(taskKind);
  if (typeof adapter !== 'function') {
    throw new Error(`No execution adapter registered for task kind ${taskKind}.`);
  }

  return adapter(projectPath, input);
}

function buildDurableExecutionInput(task, options = {}) {
  const { taskId: _taskId, providerExecutors: _providerExecutors, ...transientInput } = options;
  return {
    ...(task.taskInput == null ? {} : cloneValue(task.taskInput)),
    ...transientInput,
  };
}

export async function runExecutionLane(projectPath, options = {}) {
  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) {
    throw new Error(`Queue task not found: ${options.taskId}`);
  }
  if (task.ownerLane !== 'execution') {
    throw new Error(`Task ${task.taskId} is not assigned to execution lane.`);
  }
  if (!['ready', 'queued'].includes(task.status)) {
    throw new Error(`Task ${task.taskId} is not ready for execution.`);
  }

  const [lanePolicies, continuityProfile] = await Promise.all([
    readLanePolicies(projectPath),
    readContinuityProfile(projectPath),
  ]);
  const binding = selectLaneBinding({
    laneId: 'execution',
    lanePolicies,
    continuityProfile,
    requiredCapability: 'programmatic',
    systemDefaultAllowApiFallback: false,
  });
  const attemptNumber = await nextAttemptNumber(projectPath, task.taskId);
  const startedAt = now();

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: 'running',
    statusReason: 'Execution lane started.',
  });

  try {
    const outcome = await executeTaskClass(projectPath, task, buildDurableExecutionInput(task, options));
    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'execution',
      taskId: task.taskId,
      providerRef: binding.providerRef,
      integrationKind: binding.integrationKind,
      fallbackApplied: binding.fallbackApplied,
      supervisionCapability: binding.supervisionCapability,
      status: 'completed',
      attemptNumber,
      startedAt,
      endedAt: now(),
      artifactRefs: outcome.artifactRefs,
      summary: outcome.summary,
      warningCount: outcome.warningCount ?? 0,
    });

    await appendQueueStatusTransition(projectPath, task.taskId, {
      status: 'completed',
      eventKind: 'closed',
      laneRunId: laneRun.laneRunId,
      artifactRefs: outcome.artifactRefs,
      statusReason: outcome.summary,
      escalationNeeded: false,
    });

    return {
      laneRun,
      task: await getQueueTask(projectPath, task.taskId),
      recovery: null,
      escalation: null,
      binding,
      payload: outcome.payload ?? null,
    };
  } catch (error) {
    const failureClass = classifyExecutionFailure(error);
    const recoveryPolicy = getDefaultRecoveryPolicy(failureClass);
    const attemptLimit = lanePolicies?.lanes?.execution?.retryPolicy?.maxAttempts ?? 1;
    const shouldEscalate = recoveryPolicy.escalateImmediately || attemptNumber >= attemptLimit;

    const laneRun = await appendLaneRun(projectPath, {
      laneId: 'execution',
      taskId: task.taskId,
      providerRef: binding.providerRef,
      integrationKind: binding.integrationKind,
      fallbackApplied: binding.fallbackApplied,
      supervisionCapability: binding.supervisionCapability,
      status: shouldEscalate ? 'escalated' : 'failed',
      attemptNumber,
      startedAt,
      endedAt: now(),
      artifactRefs: [],
      summary: error.message,
      errorCode: failureClass,
    });

    let escalation = null;
    if (shouldEscalate) {
      escalation = await appendEscalationRecord(projectPath, {
        taskId: task.taskId,
        laneRunId: laneRun.laneRunId,
        status: 'pending',
        triggerKind:
          failureClass === 'dependency-unavailable'
            ? 'blocked-prerequisite'
            : failureClass === 'contract-mismatch'
              ? 'contract-mismatch'
              : 'operator-request',
        decisionNeeded: `Resolve execution failure for ${task.taskId}: ${error.message}`,
        contextShown: [
          `queue/${task.taskId}`,
          `lane-run/${laneRun.laneRunId}`,
        ],
      });
    }

    const recovery = await appendRecoveryRecord(projectPath, {
      taskId: task.taskId,
      laneRunId: laneRun.laneRunId,
      failureClass,
      recoveryAction: shouldEscalate ? 'escalate-to-user' : recoveryPolicy.recoveryAction,
      attemptNumber,
      result: shouldEscalate ? 'escalated' : 'scheduled',
      escalationId: escalation?.escalationId ?? null,
      summary: error.message,
    });

    await appendQueueStatusTransition(projectPath, task.taskId, {
      status: shouldEscalate ? 'escalated' : 'blocked',
      eventKind: shouldEscalate ? 'escalation-link' : 'recovery-update',
      laneRunId: laneRun.laneRunId,
      statusReason: shouldEscalate
        ? 'Execution failed and requires operator intervention.'
        : 'Execution failed; bounded recovery recorded.',
      escalationNeeded: shouldEscalate,
    });

    return {
      laneRun,
      task: await getQueueTask(projectPath, task.taskId),
      recovery,
      escalation,
      binding,
      error,
    };
  }
}
