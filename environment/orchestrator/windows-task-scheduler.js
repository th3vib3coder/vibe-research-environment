import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import { now, readJsonl, resolveProjectRoot } from '../control/_io.js';
import {
  objectiveEventsPath,
  readActiveObjectivePointer,
  readObjectiveRecord,
  validateObjectiveRecord,
  writeObjectiveRecord
} from '../objectives/store.js';

const HEARTBEAT_PROBE_ENV = 'VRE_HEARTBEAT_PROBE_ONLY';
export const AUTO_WAKE_ID_SENTINEL = 'auto';
const WINDOWS_SCHEDULER_COMMANDS = new Set([
  'scheduler install',
  'scheduler status',
  'scheduler doctor',
  'scheduler remove',
  'objective doctor'
]);
const RUNTIME_MODES = new Set(['interactive', 'attended-batch', 'unattended-batch', 'resume-only']);
const SUPPORT_MODES = new Set(['full', 'conditional', 'unsupported']);
const NAMED_SUPPORT_CODES = new Set([
  'E_PLATFORM_SLEEP_MODE_UNSUPPORTED',
  'E_WAKE_TIMERS_DISABLED',
  'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED'
]);
const SYSTEM_PRINCIPAL_IDS = new Set(['SYSTEM', 'S-1-5-18']);
const SERVICE_ACCOUNT_LOGON_TYPES = new Set(['ServiceAccount', 'Password', 'S4U']);

function phase9SuccessPayload(command, extra = {}) {
  return {
    ok: true,
    command,
    phase9: true,
    ...extra
  };
}

export class SchedulerCliError extends Error {
  constructor({ command, code, message, exitCode = 1, extra = {} }) {
    super(message);
    this.name = 'SchedulerCliError';
    this.command = command;
    this.code = code;
    this.exitCode = exitCode;
    this.extra = extra;
  }
}

function normalizeSlashes(value) {
  return value.split(path.sep).join('/');
}

function quoteWindowsArgument(value) {
  if (value === '') {
    return '""';
  }
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/gu, '\\"')}"`;
}

function buildArgumentString(argv) {
  return argv.map((value) => quoteWindowsArgument(String(value))).join(' ');
}

function deterministicTaskName(repoRoot, objectiveId) {
  const workspaceBase = path.basename(resolveProjectRoot(repoRoot))
    .replace(/[^A-Za-z0-9_-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 24) || 'workspace';
  const workspaceHash = createHash('sha1')
    .update(resolveProjectRoot(repoRoot).toLowerCase())
    .digest('hex')
    .slice(0, 10);
  return `VRE-${workspaceBase}-${workspaceHash}-${objectiveId}`;
}

function heartbeatIntervalMinutes(objectiveRecord) {
  return Math.max(1, Math.ceil(objectiveRecord.budget.heartbeatIntervalSeconds / 60));
}

function expectedTaskDefinition(repoRoot, objectiveRecord) {
  const projectRoot = resolveProjectRoot(repoRoot);
  const taskName = deterministicTaskName(projectRoot, objectiveRecord.objectiveId);
  const argv = [
    path.join(projectRoot, 'bin', 'vre'),
    'research-loop',
    '--objective',
    objectiveRecord.objectiveId,
    '--heartbeat',
    '--wake-id',
    AUTO_WAKE_ID_SENTINEL,
    '--json'
  ];
  return {
    taskName,
    objectiveId: objectiveRecord.objectiveId,
    execute: process.execPath,
    argv,
    arguments: buildArgumentString(argv),
    workingDirectory: projectRoot,
    heartbeatIntervalSeconds: objectiveRecord.budget.heartbeatIntervalSeconds,
    repetitionMinutes: heartbeatIntervalMinutes(objectiveRecord),
    trigger: {
      type: 'once-repeating',
      repetitionMinutes: heartbeatIntervalMinutes(objectiveRecord)
    },
    settings: {
      wakeToRun: true,
      disallowStartIfOnBatteries: false,
      stopIfGoingOnBatteries: false
    },
    principal: {
      userId: 'SYSTEM',
      logonType: 'ServiceAccount',
      runLevel: 'Highest'
    }
  };
}

function extractObjectiveIdFromArguments(argumentsText) {
  if (typeof argumentsText !== 'string' || argumentsText.trim() === '') {
    return null;
  }
  const match = /--objective\s+(?:"([^"]+)"|(\S+))/u.exec(argumentsText);
  return match?.[1] ?? match?.[2] ?? null;
}

function ensureKnownCommand(command) {
  if (!WINDOWS_SCHEDULER_COMMANDS.has(command)) {
    throw new TypeError(`unknown scheduler command: ${command}`);
  }
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

async function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });
    child.stdin.end(options.input ?? '');
  });
}

async function runPowerShellJson(script) {
  const result = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
    input: script
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'PowerShell command failed');
  }
  return JSON.parse(result.stdout);
}

async function defaultDetectHostSupport() {
  if (process.platform !== 'win32') {
    return {
      supportMode: 'unsupported',
      code: 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED',
      reason: 'Phase 9 v1 canonical unattended scheduler is Windows Task Scheduler on Windows only.',
      platform: process.platform,
      adminConfirmed: false,
      hasS3: false,
      hasS0ix: false,
      wakeTimersEnabled: false,
      acConfirmed: false
    };
  }

  const probe = await runPowerShellJson(`
$admin = [bool](([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
$sleepModes = (& powercfg /A 2>&1 | Out-String)
$wakeTimers = (& powercfg /Q SCHEME_CURRENT SUB_SLEEP RTCWAKE 2>&1 | Out-String)
$battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$hasBattery = $null -ne $battery
$batteryStatus = if ($hasBattery) { [int]$battery.BatteryStatus } else { $null }
$acConfirmed = if (-not $hasBattery) { $true } else { $batteryStatus -ne 1 }
[pscustomobject]@{
  adminConfirmed = $admin
  hasS3 = [bool]($sleepModes -match '\\(S3\\)')
  hasS0ix = [bool]($sleepModes -match '\\(S0')
  wakeTimersEnabled = [bool]($wakeTimers -match '0x00000001')
  hasBattery = $hasBattery
  acConfirmed = [bool]$acConfirmed
  rawSleepModes = $sleepModes.Trim()
  rawWakeTimers = $wakeTimers.Trim()
} | ConvertTo-Json -Compress
`);

  if (!probe.hasS3 && !probe.hasS0ix) {
    return {
      supportMode: 'unsupported',
      code: 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED',
      reason: 'This workstation does not expose an S3 or S0ix sleep mode that Phase 9 can honestly arm for unattended wake.',
      platform: process.platform,
      ...probe
    };
  }

  if (!probe.wakeTimersEnabled) {
    return {
      supportMode: 'unsupported',
      code: 'E_WAKE_TIMERS_DISABLED',
      reason: 'Windows power policy currently prevents timer-based wake for the active power plan.',
      platform: process.platform,
      ...probe
    };
  }

  if (!probe.adminConfirmed) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: 'The reviewed Phase 9 v1 install path requires administrator rights to register a machine-level SYSTEM task.',
      platform: process.platform,
      ...probe
    };
  }

  if (probe.hasS3) {
    return {
      supportMode: 'full',
      code: null,
      reason: null,
      platform: process.platform,
      ...probe
    };
  }

  return {
    supportMode: 'conditional',
    code: null,
    reason: probe.acConfirmed
      ? 'S0ix/Modern Standby is available with wake timers enabled on AC, but this remains conditional rather than acceptance-grade.'
      : 'S0ix/Modern Standby is available, but AC is not confirmed so unattended wake remains conditional rather than acceptance-grade.',
    platform: process.platform,
    ...probe
  };
}

async function defaultRegisterTask(taskDefinition) {
  const startAt = new Date(Date.now() + 60_000).toISOString();
  await runPowerShellJson(`
$taskName = '${taskDefinition.taskName}'
$execute = '${taskDefinition.execute.replace(/'/gu, "''")}'
$arguments = '${taskDefinition.arguments.replace(/'/gu, "''")}'
$workingDirectory = '${taskDefinition.workingDirectory.replace(/'/gu, "''")}'
$startBoundary = [datetime]'${startAt}'
$repetitionMinutes = ${taskDefinition.repetitionMinutes}
$action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $workingDirectory
$trigger = New-ScheduledTaskTrigger -Once -At $startBoundary
$trigger.Repetition = New-ScheduledTaskRepetitionSettingsSet -Interval (New-TimeSpan -Minutes $repetitionMinutes) -Duration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -WakeToRun -DisallowStartIfOnBatteries:$false -StopIfGoingOnBatteries:$false
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
[pscustomobject]@{ registered = $true } | ConvertTo-Json -Compress
`);
}

async function defaultReadTask(taskName) {
  if (process.platform !== 'win32') {
    return {
      exists: false,
      taskName
    };
  }

  return runPowerShellJson(`
$taskName = '${taskName}'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  [pscustomobject]@{
    exists = $false
    taskName = $taskName
  } | ConvertTo-Json -Compress
  exit 0
}
$info = Get-ScheduledTaskInfo -TaskName $taskName
$xml = [xml](Export-ScheduledTask -TaskName $taskName)
$action = $task.Actions | Select-Object -First 1
[pscustomobject]@{
  exists = $true
  taskName = $taskName
  state = [string]$task.State
  lastRunTime = $info.LastRunTime
  nextRunTime = $info.NextRunTime
  execute = $action.Execute
  arguments = $action.Arguments
  workingDirectory = $action.WorkingDirectory
  wakeToRun = [string]$xml.Task.Settings.WakeToRun
  disallowStartIfOnBatteries = [string]$xml.Task.Settings.DisallowStartIfOnBatteries
  stopIfGoingOnBatteries = [string]$xml.Task.Settings.StopIfGoingOnBatteries
  runLevel = [string]$xml.Task.Principals.Principal.RunLevel
  userId = [string]$xml.Task.Principals.Principal.UserId
  logonType = [string]$xml.Task.Principals.Principal.LogonType
} | ConvertTo-Json -Compress
`);
}

async function defaultRemoveTask(taskName) {
  if (process.platform !== 'win32') {
    return { removed: false };
  }
  await runPowerShellJson(`
$taskName = '${taskName}'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  [pscustomobject]@{ removed = $false } | ConvertTo-Json -Compress
  exit 0
}
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false | Out-Null
[pscustomobject]@{ removed = $true } | ConvertTo-Json -Compress
`);
  return { removed: true };
}

async function defaultRunHeartbeatProbe(taskDefinition) {
  const result = await runProcess(taskDefinition.execute, taskDefinition.argv, {
    cwd: taskDefinition.workingDirectory,
    env: {
      [HEARTBEAT_PROBE_ENV]: '1'
    }
  });

  if (result.code !== 0) {
    return {
      ok: false,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      reason: result.stderr.trim() || result.stdout.trim() || 'research-loop heartbeat probe failed'
    };
  }

  let payload = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      reason: 'research-loop heartbeat probe did not emit valid JSON'
    };
  }

  if (payload?.ok !== true || payload?.probe !== 'heartbeat') {
    return {
      ok: false,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      reason: 'research-loop heartbeat probe reached bin/vre but did not report probe success'
    };
  }

  return {
    ok: true,
    exitCode: result.code,
    payload
  };
}

function schedulerDeps(overrides = {}) {
  return {
    detectHostSupport: defaultDetectHostSupport,
    registerTask: defaultRegisterTask,
    readTask: defaultReadTask,
    removeTask: defaultRemoveTask,
    runHeartbeatProbe: defaultRunHeartbeatProbe,
    readActiveObjectivePointer,
    readObjectiveRecord,
    validateObjectiveRecord,
    writeObjectiveRecord,
    readObjectiveEvents: (projectRoot, objectiveId) => readJsonl(objectiveEventsPath(projectRoot, objectiveId)),
    clock: now,
    ...overrides
  };
}

async function readValidatedObjectiveRecord(projectRoot, objectiveId, deps, command) {
  const objectiveRecord = await deps.readObjectiveRecord(projectRoot, objectiveId).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new SchedulerCliError({
        command,
        code: 'E_OBJECTIVE_NOT_FOUND',
        exitCode: 1,
        message: `Objective record not found for ${objectiveId}`
      });
    }
    throw error;
  });
  await deps.validateObjectiveRecord(projectRoot, objectiveRecord);
  return objectiveRecord;
}

function collectArtifactPathEntries(artifactsIndex = {}) {
  const candidates = [];
  for (const entries of Object.values(artifactsIndex)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (typeof entry === 'string' && /[\\/]/u.test(entry)) {
        candidates.push(entry);
      }
    }
  }
  return [...new Set(candidates)].sort((left, right) => left.localeCompare(right));
}

async function collectMissingArtifactPaths(projectRoot, objectiveRecord) {
  const artifactPaths = collectArtifactPathEntries(objectiveRecord.artifactsIndex);
  const missing = [];
  for (const artifactPath of artifactPaths) {
    if (!(await pathExists(path.join(projectRoot, artifactPath)))) {
      missing.push(artifactPath);
    }
  }
  return missing;
}

function hasUnresolvedStateConflict(events) {
  let stateConflictOpen = false;
  for (const event of events) {
    if (event?.kind === 'blocker-open' && event?.payload?.code === 'E_STATE_CONFLICT') {
      stateConflictOpen = true;
    }
    if (
      event?.kind === 'blocker-resolve' &&
      (event?.payload?.code === 'E_STATE_CONFLICT' ||
        event?.payload?.resolvedCode === 'E_STATE_CONFLICT')
    ) {
      stateConflictOpen = false;
    }
  }
  return stateConflictOpen;
}

function validateWakeOwner(objectiveRecord, command) {
  if (objectiveRecord.wakePolicy?.wakeOwner !== 'windows-task-scheduler') {
    throw new SchedulerCliError({
      command,
      code: 'PHASE9_USAGE',
      exitCode: 3,
      message: `${command} requires objective ${objectiveRecord.objectiveId} to declare wakeOwner=windows-task-scheduler`
    });
  }
}

function validateTaskAgainstContract(taskDefinition, installedTask, objectiveId, activePointer) {
  if (!installedTask?.exists) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Scheduler task ${taskDefinition.taskName} is not installed for objective ${objectiveId}.`
    };
  }

  const boundObjectiveId = extractObjectiveIdFromArguments(installedTask.arguments);
  if (boundObjectiveId !== objectiveId) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task binds ${boundObjectiveId ?? 'no objective id'}, not ${objectiveId}.`
    };
  }

  if (activePointer && activePointer.objectiveId !== objectiveId) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Active objective pointer references ${activePointer.objectiveId}, not ${objectiveId}.`
    };
  }

  if (
    installedTask.execute !== taskDefinition.execute ||
    installedTask.arguments !== taskDefinition.arguments ||
    installedTask.workingDirectory !== taskDefinition.workingDirectory
  ) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} does not match the reviewed VRE CLI invocation.`
    };
  }

  if (String(installedTask.wakeToRun).toLowerCase() !== 'true') {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} is missing WakeToRun=true.`
    };
  }

  if (String(installedTask.disallowStartIfOnBatteries).toLowerCase() !== 'false') {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} still suppresses battery start.`
    };
  }

  if (String(installedTask.stopIfGoingOnBatteries).toLowerCase() !== 'false') {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} still stops when Windows switches to battery.`
    };
  }

  if (!SYSTEM_PRINCIPAL_IDS.has(installedTask.userId)) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} is not persisted under the reviewed SYSTEM principal.`
    };
  }

  if (!SERVICE_ACCOUNT_LOGON_TYPES.has(installedTask.logonType)) {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} did not persist the reviewed credential/logon mode.`
    };
  }

  if (String(installedTask.runLevel).toLowerCase() !== 'highestavailable' && String(installedTask.runLevel).toLowerCase() !== 'highest') {
    return {
      supportMode: 'unsupported',
      code: 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      reason: `Registered scheduler task ${taskDefinition.taskName} is not using the reviewed highest run level.`
    };
  }

  return null;
}

async function schedulerStatusSnapshot(projectRoot, objectiveRecord, deps, options = {}) {
  const support = await deps.detectHostSupport(projectRoot, objectiveRecord);
  const taskDefinition = expectedTaskDefinition(projectRoot, objectiveRecord);
  const installedTask = await deps.readTask(taskDefinition.taskName, {
    projectRoot,
    objectiveRecord,
    taskDefinition
  });
  const activePointer = options.activePointer ?? await deps.readActiveObjectivePointer(projectRoot);
  const contractFailure = validateTaskAgainstContract(
    taskDefinition,
    installedTask,
    objectiveRecord.objectiveId,
    activePointer
  );
  const taskInstalled = Boolean(installedTask?.exists);
  const wakeSourceId = objectiveRecord.wakePolicy?.wakeSourceId ?? taskDefinition.taskName;

  if (support.supportMode === 'unsupported') {
    return {
      objectiveId: objectiveRecord.objectiveId,
      taskInstalled,
      taskDefinition,
      installedTask,
      wakeSourceId,
      supportMode: 'unsupported',
      code: support.code ?? 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED',
      reason: support.reason,
      activeObjectiveId: activePointer?.objectiveId ?? null
    };
  }

  if (contractFailure && options.requireInstalled) {
    return {
      objectiveId: objectiveRecord.objectiveId,
      taskInstalled,
      taskDefinition,
      installedTask,
      wakeSourceId,
      supportMode: 'unsupported',
      code: contractFailure.code,
      reason: contractFailure.reason,
      activeObjectiveId: activePointer?.objectiveId ?? null
    };
  }

  let supportMode = support.supportMode;
  let code = support.code ?? null;
  let reason = support.reason ?? null;
  if (supportMode !== 'unsupported' && contractFailure) {
    supportMode = 'unsupported';
    code = contractFailure.code;
    reason = contractFailure.reason;
  }

  let probe = null;
  if (options.runHeartbeatProbe && supportMode !== 'unsupported') {
    probe = await deps.runHeartbeatProbe(taskDefinition, {
      projectRoot,
      objectiveRecord
    });
    if (!probe.ok) {
      supportMode = 'unsupported';
      code = 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED';
      reason = `Dry-run heartbeat probe failed for ${taskDefinition.taskName}: ${probe.reason}`;
    }
  }

  return {
    objectiveId: objectiveRecord.objectiveId,
    taskInstalled,
    taskDefinition,
    installedTask,
    wakeSourceId,
    supportMode,
    code,
    reason,
    activeObjectiveId: activePointer?.objectiveId ?? null,
    probe
  };
}

function installPayload(command, snapshot, extra = {}) {
  return phase9SuccessPayload(command, {
    objectiveId: snapshot.objectiveId,
    taskName: snapshot.taskDefinition.taskName,
    wakeSourceId: snapshot.wakeSourceId,
    taskInstalled: snapshot.taskInstalled,
    supportMode: snapshot.supportMode,
    code: snapshot.code,
    reason: snapshot.reason,
    lastRunAt: snapshot.installedTask?.lastRunTime ?? null,
    nextRunAt: snapshot.installedTask?.nextRunTime ?? null,
    boundObjectiveId: snapshot.taskInstalled
      ? (extractObjectiveIdFromArguments(snapshot.installedTask?.arguments) ?? null)
      : null,
    taskDefinition: snapshot.taskDefinition,
    heartbeatProbe: snapshot.probe ?? null,
    ...extra
  });
}

export async function schedulerInstallCommand(projectRoot, { objectiveId }, overrides = {}) {
  const deps = schedulerDeps(overrides);
  const repoRoot = resolveProjectRoot(projectRoot);
  const objectiveRecord = await readValidatedObjectiveRecord(repoRoot, objectiveId, deps, 'scheduler install');
  validateWakeOwner(objectiveRecord, 'scheduler install');

  const support = await deps.detectHostSupport(repoRoot, objectiveRecord);
  if (support.supportMode === 'unsupported') {
    throw new SchedulerCliError({
      command: 'scheduler install',
      code: support.code ?? 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED',
      message: support.reason,
      extra: {
        objectiveId,
        supportMode: 'unsupported'
      }
    });
  }

  const taskDefinition = expectedTaskDefinition(repoRoot, objectiveRecord);
  await deps.registerTask(taskDefinition, {
    projectRoot: repoRoot,
    objectiveRecord
  });

  const updatedRecord = {
    ...objectiveRecord,
    wakePolicy: {
      ...objectiveRecord.wakePolicy,
      wakeSourceId: taskDefinition.taskName
    },
    lastUpdatedAt: deps.clock()
  };

  const snapshot = await schedulerStatusSnapshot(
    repoRoot,
    updatedRecord,
    deps,
    {
      requireInstalled: true,
      runHeartbeatProbe: false
    }
  );

  if (snapshot.supportMode === 'unsupported') {
    let cleanup = { removed: false, cleanupError: null };
    try {
      const removal = await deps.removeTask(taskDefinition.taskName, {
        projectRoot: repoRoot,
        objectiveRecord
      });
      cleanup = {
        removed: Boolean(removal?.removed),
        cleanupError: null
      };
    } catch (cleanupError) {
      cleanup = {
        removed: false,
        cleanupError: cleanupError?.message ?? String(cleanupError)
      };
    }
    throw new SchedulerCliError({
      command: 'scheduler install',
      code: snapshot.code ?? 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      message: snapshot.reason,
      extra: {
        objectiveId,
        supportMode: 'unsupported',
        taskName: snapshot.taskDefinition.taskName,
        cleanupRemoved: cleanup.removed,
        cleanupError: cleanup.cleanupError
      }
    });
  }

  await deps.writeObjectiveRecord(repoRoot, updatedRecord);

  return installPayload('scheduler install', snapshot, {
    registration: 'updated'
  });
}

export async function schedulerStatusCommand(projectRoot, { objectiveId }, overrides = {}) {
  const deps = schedulerDeps(overrides);
  const repoRoot = resolveProjectRoot(projectRoot);
  const objectiveRecord = await readValidatedObjectiveRecord(repoRoot, objectiveId, deps, 'scheduler status');
  validateWakeOwner(objectiveRecord, 'scheduler status');
  const snapshot = await schedulerStatusSnapshot(repoRoot, objectiveRecord, deps, {
    requireInstalled: false,
    runHeartbeatProbe: false
  });
  return installPayload('scheduler status', snapshot);
}

export async function schedulerDoctorCommand(projectRoot, { objectiveId }, overrides = {}) {
  const deps = schedulerDeps(overrides);
  const repoRoot = resolveProjectRoot(projectRoot);
  const objectiveRecord = await readValidatedObjectiveRecord(repoRoot, objectiveId, deps, 'scheduler doctor');
  validateWakeOwner(objectiveRecord, 'scheduler doctor');
  const snapshot = await schedulerStatusSnapshot(repoRoot, objectiveRecord, deps, {
    requireInstalled: true,
    runHeartbeatProbe: true
  });

  if (snapshot.supportMode === 'unsupported') {
    throw new SchedulerCliError({
      command: 'scheduler doctor',
      code: snapshot.code ?? 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED',
      message: snapshot.reason,
      extra: {
        objectiveId,
        supportMode: 'unsupported',
        taskName: snapshot.taskDefinition.taskName
      }
    });
  }

  return installPayload('scheduler doctor', snapshot);
}

export async function schedulerRemoveCommand(projectRoot, { objectiveId }, overrides = {}) {
  const deps = schedulerDeps(overrides);
  const repoRoot = resolveProjectRoot(projectRoot);
  const objectiveRecord = await readValidatedObjectiveRecord(repoRoot, objectiveId, deps, 'scheduler remove');
  validateWakeOwner(objectiveRecord, 'scheduler remove');
  const taskDefinition = expectedTaskDefinition(repoRoot, objectiveRecord);
  const removal = await deps.removeTask(taskDefinition.taskName, {
    projectRoot: repoRoot,
    objectiveRecord
  });
  return phase9SuccessPayload('scheduler remove', {
    objectiveId,
    taskName: taskDefinition.taskName,
    removed: Boolean(removal?.removed),
    alreadyAbsent: !Boolean(removal?.removed)
  });
}

export async function objectiveDoctorCommand(projectRoot, { objectiveId }, overrides = {}) {
  const deps = schedulerDeps(overrides);
  const repoRoot = resolveProjectRoot(projectRoot);
  const objectiveRecord = await readValidatedObjectiveRecord(repoRoot, objectiveId, deps, 'objective doctor').catch((error) => {
    if (error instanceof SchedulerCliError) {
      throw new SchedulerCliError({
        command: 'objective doctor',
        code: error.code,
        exitCode: error.exitCode,
        message: error.message,
        extra: error.extra
      });
    }
    throw error;
  });

  const activePointer = await deps.readActiveObjectivePointer(repoRoot);
  if (!activePointer) {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_ACTIVE_OBJECTIVE_POINTER_MISSING',
      message: 'No active objective pointer exists'
    });
  }

  if (activePointer.objectiveId !== objectiveId) {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_OBJECTIVE_ID_MISMATCH',
      message: `Active objective pointer references ${activePointer.objectiveId}, not ${objectiveId}`,
      extra: {
        activeObjectiveId: activePointer.objectiveId,
        objectiveId
      }
    });
  }

  if (objectiveRecord.status !== 'active') {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_OBJECTIVE_STATE_INVALID',
      message: `objective doctor requires objective ${objectiveId} to be active, not ${objectiveRecord.status}`,
      extra: {
        objectiveId,
        status: objectiveRecord.status
      }
    });
  }

  if (!RUNTIME_MODES.has(objectiveRecord.runtimeMode)) {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_RUNTIME_MODE_UNSUPPORTED',
      message: `Objective ${objectiveId} carries unsupported runtimeMode ${objectiveRecord.runtimeMode}`,
      extra: {
        objectiveId,
        runtimeMode: objectiveRecord.runtimeMode
      }
    });
  }

  if (objectiveRecord.reasoningMode !== 'rule-only') {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_REASONING_MODE_UNSUPPORTED',
      message: `Objective ${objectiveId} carries unsupported reasoningMode ${objectiveRecord.reasoningMode}`,
      extra: {
        objectiveId,
        reasoningMode: objectiveRecord.reasoningMode
      }
    });
  }

  const missingArtifactPaths = await collectMissingArtifactPaths(repoRoot, objectiveRecord);
  if (missingArtifactPaths.length > 0) {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_OBJECTIVE_ARTIFACT_PATH_MISSING',
      message: `Objective ${objectiveId} references missing artifact paths: ${missingArtifactPaths.join(', ')}`,
      extra: {
        objectiveId,
        missingArtifactPaths
      }
    });
  }

  const events = await deps.readObjectiveEvents(repoRoot, objectiveId);
  if (hasUnresolvedStateConflict(events)) {
    throw new SchedulerCliError({
      command: 'objective doctor',
      code: 'E_STATE_CONFLICT',
      message: `Objective ${objectiveId} still carries an unresolved E_STATE_CONFLICT in the event log`,
      extra: {
        objectiveId
      }
    });
  }

  let scheduler = null;
  if (objectiveRecord.wakePolicy?.wakeOwner === 'windows-task-scheduler') {
    try {
      scheduler = await schedulerDoctorCommand(repoRoot, { objectiveId }, {
        ...overrides,
        readActiveObjectivePointer: async () => activePointer
      });
    } catch (error) {
      if (error instanceof SchedulerCliError) {
        throw new SchedulerCliError({
          command: 'objective doctor',
          code: error.code,
          exitCode: error.exitCode,
          message: error.message,
          extra: {
            objectiveId,
            supportMode: error.extra?.supportMode ?? 'unsupported',
            taskName: error.extra?.taskName ?? deterministicTaskName(repoRoot, objectiveId)
          }
        });
      }
      throw error;
    }
  }

  return phase9SuccessPayload('objective doctor', {
    objectiveId,
    status: objectiveRecord.status,
    runtimeMode: objectiveRecord.runtimeMode,
    reasoningMode: objectiveRecord.reasoningMode,
    wakeOwner: objectiveRecord.wakePolicy.wakeOwner,
    scheduler: scheduler == null
      ? null
      : {
          supportMode: scheduler.supportMode,
          taskInstalled: scheduler.taskInstalled,
          taskName: scheduler.taskName,
          lastRunAt: scheduler.lastRunAt,
          nextRunAt: scheduler.nextRunAt
        },
    activePointer: normalizeSlashes(path.relative(repoRoot, path.join(repoRoot, '.vibe-science-environment', 'objectives', 'active-objective.json')))
  });
}

export const INTERNALS = Object.freeze({
  AUTO_WAKE_ID_SENTINEL,
  HEARTBEAT_PROBE_ENV,
  deterministicTaskName,
  expectedTaskDefinition,
  extractObjectiveIdFromArguments,
  validateTaskAgainstContract,
  collectArtifactPathEntries,
  collectMissingArtifactPaths,
  hasUnresolvedStateConflict,
  buildArgumentString,
  heartbeatIntervalMinutes
});
