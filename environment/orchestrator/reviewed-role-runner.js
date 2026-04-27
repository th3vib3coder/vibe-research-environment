#!/usr/bin/env node
/**
 * Reviewed Role Runner — Phase 9 child-side cold-child severance binary
 * (file 07 §Subprocess Spawn Contract + §Cold-Child Severance Axes).
 *
 * The agent-orchestration parent spawns this script via Node with
 *   `node <runner-path> --envelope <envelope-path>`
 * and the runner runs all six severance axes BEFORE doing role work.
 *
 * Exit codes:
 *   0  cold-child severance verified; success record on stdout
 *   1  unexpected runner error (envelope malformed, missing args, IO error)
 *   2  cold-child severance failed; structured failure record on stderr
 *
 * Output format (single JSON object on either stdout or stderr):
 *   stdout success:
 *     { runnerVersion, status: "cold-child-severance-verified",
 *       objectiveId, taskId, roleId, axes: [...] }
 *   stderr severance failure:
 *     { runnerVersion, status: "cold-child-severance-failed",
 *       code, axis, message, extra }
 *   stderr runner error:
 *     { runnerVersion, status: "cold-child-runner-error",
 *       code, message }
 *
 * This binary is intentionally tiny and imports ONLY:
 *   - cold-child-validator.js (pure axis-check module)
 *   - node:fs/promises (readFile for envelope only)
 * It does NOT import agent-orchestration.js or the wider VRE surface to
 * avoid pulling parent runtime state into the child by accident.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
    ColdChildSeveranceError,
    validateAllSeveranceAxes,
} from './cold-child-validator.js';

export const REVIEWED_ROLE_RUNNER_VERSION = 'phase9.reviewed-role-runner.v1';

export function parseRunnerArgv(argv) {
    const parsed = { envelopePath: null, runRole: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--envelope') {
            parsed.envelopePath = argv[index + 1];
            index += 1;
            continue;
        }
        if (token === '--run-role') {
            parsed.runRole = true;
            continue;
        }
    }
    return parsed;
}

/**
 * Best-effort parent liveness probe. process.kill(pid, 0) tests whether the
 * recorded parent PID is observable as a live process: it returns truthy on
 * success, throws ESRCH if the process is gone, or EPERM if it exists but
 * we lack permission to signal it (which still means the process exists).
 *
 * Spec lines 87-90 explicitly require Windows reviewed startup to attempt
 * to query/open dispatchParentPid as a live process. process.kill(pid, 0)
 * is the cross-platform Node primitive that delivers that semantic.
 */
export async function probeParentLiveness(parentPid, options = {}) {
    if (!Number.isInteger(parentPid) || parentPid < 1) return false;
    const probe = options.probeImpl ?? ((pid) => process.kill(pid, 0));
    try {
        probe(parentPid);
        return true;
    } catch (error) {
        if (error?.code === 'EPERM') return true;
        return false;
    }
}

/**
 * Best-effort detection of file descriptors beyond stdin/stdout/stderr.
 * Linux exposes /proc/self/fd; macOS exposes /dev/fd; Windows has no
 * portable equivalent and returns null (best-effort unknown). The
 * validator treats null as pass with note, per spec line 134-136
 * (OS-level containment is deferred to v2).
 */
export async function detectExtraFds(options = {}) {
    const readdirImpl = options.readdirImpl ?? readdir;
    const platformOverride = options.platform ?? process.platform;
    let fdDir = null;
    if (platformOverride === 'linux') fdDir = '/proc/self/fd';
    else if (platformOverride === 'darwin') fdDir = '/dev/fd';
    if (fdDir == null) return null;
    try {
        const entries = await readdirImpl(fdDir);
        const fds = entries
            .map((entry) => Number.parseInt(entry, 10))
            .filter((fd) => Number.isInteger(fd));
        return fds.filter((fd) => fd > 2);
    } catch {
        return null;
    }
}

function emitSuccess(envelope, axes) {
    process.stdout.write(`${JSON.stringify({
        runnerVersion: REVIEWED_ROLE_RUNNER_VERSION,
        status: 'cold-child-severance-verified',
        objectiveId: envelope.objectiveId,
        taskId: envelope.taskId,
        roleId: envelope.roleId,
        dispatchParentPid: envelope.dispatchParentPid,
        axes,
    })}\n`);
}

function emitSeveranceFailure(error) {
    process.stderr.write(`${JSON.stringify({
        runnerVersion: REVIEWED_ROLE_RUNNER_VERSION,
        status: 'cold-child-severance-failed',
        code: error.code,
        axis: error.axis,
        message: error.message,
        extra: error.extra ?? {},
    })}\n`);
}

function emitRunnerError(code, message, extra = {}) {
    process.stderr.write(`${JSON.stringify({
        runnerVersion: REVIEWED_ROLE_RUNNER_VERSION,
        status: 'cold-child-runner-error',
        code,
        message,
        extra,
    })}\n`);
}

export async function runReviewedRoleRunner({
    argv = process.argv.slice(2),
    env = process.env,
    fullArgv = process.argv,
    cwd = process.cwd(),
    processPpid = process.ppid,
    isTTY = !!process.stdout.isTTY,
    globals = globalThis,
    readFileImpl = readFile,
    detectExtraFdsImpl = detectExtraFds,
    probeParentLivenessImpl = probeParentLiveness,
    exitImpl = (code) => process.exit(code),
} = {}) {
    const args = parseRunnerArgv(argv);
    if (!args.envelopePath) {
        emitRunnerError(
            'E_RUNNER_USAGE',
            'reviewed-role-runner requires --envelope <path>.',
        );
        return exitImpl(1);
    }

    let envelope;
    try {
        const raw = await readFileImpl(path.resolve(args.envelopePath), 'utf8');
        envelope = JSON.parse(raw);
    } catch (error) {
        emitRunnerError(
            'E_RUNNER_ENVELOPE_UNREADABLE',
            `Cannot read envelope at ${args.envelopePath}: ${error.message}`,
            { envelopePath: args.envelopePath },
        );
        return exitImpl(1);
    }

    if (envelope?.schemaVersion !== 'phase9.role-envelope.v1') {
        emitRunnerError(
            'E_RUNNER_ENVELOPE_INVALID',
            `Envelope schemaVersion ${envelope?.schemaVersion} is not phase9.role-envelope.v1.`,
            { envelopePath: args.envelopePath },
        );
        return exitImpl(1);
    }

    const parentAlive = await probeParentLivenessImpl(envelope.dispatchParentPid);
    const extraFdsDetected = await detectExtraFdsImpl();

    try {
        const verdict = await validateAllSeveranceAxes({
            processPpid,
            dispatchParentPid: envelope.dispatchParentPid,
            parentAlive,
            env,
            argv: fullArgv,
            cwd,
            workspaceRoot: envelope.sessionIsolation?.workspaceRoot,
            isTTY,
            extraFdsDetected,
            globals,
        });
        emitSuccess(envelope, verdict.axes);
        return exitImpl(0);
    } catch (error) {
        if (error instanceof ColdChildSeveranceError) {
            emitSeveranceFailure(error);
            return exitImpl(2);
        }
        emitRunnerError(
            'E_REVIEWED_ROLE_RUNNER_ERROR',
            error?.message ?? String(error),
        );
        return exitImpl(1);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runReviewedRoleRunner();
}
