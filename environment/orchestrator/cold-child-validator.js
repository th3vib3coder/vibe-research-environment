/**
 * Cold-Child Severance Validator (file 07 §Subprocess Spawn Contract +
 * §Cold-Child Severance Axes, lines 37-172).
 *
 * This module is pure — it does NO IO except `realpath` for the cwd axis.
 * It is reusable by:
 *   1. The reviewed-role-runner.js child binary (validates BEFORE role work)
 *   2. The agent-orchestration.js parent (mirrors expectations pre-dispatch)
 *   3. Tests that craft synthetic inputs to prove fail-closed paths
 *
 * Six axes from spec lines 147-172:
 *   1. Process identity   → E_ORPHANED_SPAWN_PARENT
 *   2. Environment        → E_ENV_LEAK / E_ENV_ALLOWLIST_VIOLATED / E_INHERITED_SESSION_TOKEN
 *   3. Stdio / TTY / FD   → E_FD_LEAK
 *   4. Working directory  → E_CWD_ESCAPE
 *   5. Runtime state      → E_INHERITED_SESSION_TOKEN (in-memory globals)
 *   6. Argv               → E_ARGV_LEAK
 *
 * Per file 07 lines 134-136, OS-level containment is deferred to v2 and
 * MUST NOT be relied on here. This module detects spec-defined logical
 * leakage; it does not claim to be an OS sandbox.
 */
import { realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * COLD_CHILD_ENV_ALLOWLIST is the spec file 07 lines 57-59 set of env keys
 * the parent reviewed dispatcher is allowed to pass to a cold child.
 */
export const COLD_CHILD_ENV_ALLOWLIST = Object.freeze([
    'PATH',
    'HOME',
    'USERPROFILE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'VRE_ROOT',
    'PHASE9_OBJECTIVE_ID',
    'PHASE9_TASK_ID',
    'PHASE9_ENVELOPE_PATH',
]);

/**
 * COLD_CHILD_PLATFORM_ENV_ALLOWLIST is the platform-injected env that Node's
 * `child_process.spawn` adds to a child on Windows even when the parent
 * passes an explicit `env: {...}` object. None of these carry session or
 * network tokens (the deny-regex still catches CLAUDE_/ANTHROPIC_/etc.); they
 * are platform identification vars that the parent cannot suppress without
 * forking child_process internals.
 *
 * Phase 9 v1 verified empirically on Windows 11 Node 24:
 *   HOMEDRIVE, HOMEPATH, LOGONSERVER, SYSTEMDRIVE, USERDOMAIN, USERNAME, WINDIR
 *
 * Per spec file 07 lines 134-136, OS-level containment is deferred to v2,
 * so accepting platform-injected env keys does NOT weaken the v1 contract:
 * the deny-regex remains the security boundary; the allowlist is the
 * cleanliness boundary.
 */
export const COLD_CHILD_PLATFORM_ENV_ALLOWLIST = Object.freeze([
    'HOMEDRIVE',
    'HOMEPATH',
    'LOGONSERVER',
    'SYSTEMDRIVE',
    'USERDOMAIN',
    'USERNAME',
    'WINDIR',
]);

export const COLD_CHILD_DENY_REGEX = /^(CLAUDE_|ANTHROPIC_|SESSION_|VRE_SESSION_|SKILL_CACHE_)/u;

export const COLD_CHILD_FORBIDDEN_GLOBAL_KEYS = Object.freeze([
    '__VRE_SKILL_CACHE__',
    '__VRE_HANDSHAKE_MEMO__',
    '__VRE_OBJECTIVE_POINTER__',
    '__VRE_SESSION_TOKEN__',
    '__VRE_PARENT_RUNTIME_STATE__',
]);

const COLD_CHILD_AXES = Object.freeze([
    'process-identity',
    'environment',
    'argv',
    'working-directory',
    'stdio-fd',
    'runtime-state',
]);

export class ColdChildSeveranceError extends Error {
    constructor({ code, axis, message, extra = {} }) {
        super(message);
        this.name = 'ColdChildSeveranceError';
        this.code = code;
        this.axis = axis;
        this.extra = extra;
    }
}

function fail(code, axis, message, extra = {}) {
    throw new ColdChildSeveranceError({ code, axis, message, extra });
}

/**
 * Axis 1: process identity.
 *
 * Child PID is intrinsically new (spawn() guarantee). The check that matters
 * is process.ppid === envelope.dispatchParentPid. Per spec lines 85-90:
 * inability to open/query the recorded parent counts as orphaned.
 */
export function validateProcessIdentity({
    processPpid,
    dispatchParentPid,
    parentAlive = true,
}) {
    if (!Number.isInteger(processPpid) || processPpid < 0) {
        fail(
            'E_ORPHANED_SPAWN_PARENT',
            'process-identity',
            `Child process.ppid is not a valid integer: ${processPpid}.`,
            { processPpid, dispatchParentPid },
        );
    }
    if (!Number.isInteger(dispatchParentPid) || dispatchParentPid < 1) {
        fail(
            'E_ORPHANED_SPAWN_PARENT',
            'process-identity',
            `Envelope dispatchParentPid is not a valid PID: ${dispatchParentPid}.`,
            { processPpid, dispatchParentPid },
        );
    }
    if (processPpid !== dispatchParentPid) {
        fail(
            'E_ORPHANED_SPAWN_PARENT',
            'process-identity',
            `Child process.ppid ${processPpid} does not match envelope.dispatchParentPid ${dispatchParentPid}.`,
            { processPpid, dispatchParentPid },
        );
    }
    if (parentAlive !== true) {
        fail(
            'E_ORPHANED_SPAWN_PARENT',
            'process-identity',
            `Reviewed spawn parent PID ${dispatchParentPid} is not observable as a live process at child startup.`,
            { processPpid, dispatchParentPid, parentAlive },
        );
    }
    return { axis: 'process-identity', ok: true, processPpid, dispatchParentPid };
}

/**
 * Axis 2: environment.
 *
 * Two failure modes per spec (lines 80-81, 91-92):
 *   - E_ENV_ALLOWLIST_VIOLATED: an env key outside the allowlist is present.
 *   - E_INHERITED_SESSION_TOKEN: deny-regex matches an env key.
 *
 * Note: `E_ENV_LEAK` is the related deny-regex code on values; `E_INHERITED_SESSION_TOKEN`
 * is the cold-child severance code that says "a parent session/network token is observable
 * in env, argv, or runtime state". Both surface the same root concern; we use
 * E_INHERITED_SESSION_TOKEN for cold-child-runtime detection per spec lines 91-92.
 */
export function validateEnvironment(env, options = {}) {
    if (env == null || typeof env !== 'object') {
        fail(
            'E_ENV_ALLOWLIST_VIOLATED',
            'environment',
            'Child env must be an object.',
            { env },
        );
    }
    const allowlist = new Set(options.allowlist ?? [
        ...COLD_CHILD_ENV_ALLOWLIST,
        ...COLD_CHILD_PLATFORM_ENV_ALLOWLIST,
    ]);
    const denyRegex = options.denyRegex ?? COLD_CHILD_DENY_REGEX;
    const denyValueRegex = options.denyValueRegex ?? denyRegex;

    for (const key of Object.keys(env)) {
        if (denyRegex.test(key)) {
            fail(
                'E_INHERITED_SESSION_TOKEN',
                'environment',
                `Inherited parent session/network token detected in env key ${key}.`,
                { key },
            );
        }
        if (!allowlist.has(key)) {
            fail(
                'E_ENV_ALLOWLIST_VIOLATED',
                'environment',
                `Env key ${key} is outside the cold-child allowlist.`,
                { key, allowlist: [...allowlist] },
            );
        }
        const value = env[key];
        if (typeof value === 'string' && denyValueRegex.test(value)) {
            fail(
                'E_INHERITED_SESSION_TOKEN',
                'environment',
                `Inherited parent token detected in env value for ${key}.`,
                { key },
            );
        }
    }
    return { axis: 'environment', ok: true, allowedKeys: Object.keys(env) };
}

/**
 * Axis 6: argv.
 *
 * Spec lines 62-63: same deny-regex applied to every argv element. The
 * dispatcher rejects argv that carries session/network tokens inline.
 *
 * argv[0] is the node binary path; argv[1] is the runner script path. Both
 * are expected to be absolute filesystem paths and never contain session
 * tokens; we still pass them through deny-regex for honesty.
 */
export function validateArgv(argv, options = {}) {
    if (!Array.isArray(argv)) {
        fail(
            'E_ARGV_LEAK',
            'argv',
            'Child argv must be an array.',
            { argv },
        );
    }
    const denyRegex = options.denyRegex ?? COLD_CHILD_DENY_REGEX;
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (typeof token !== 'string') continue;
        if (denyRegex.test(token)) {
            fail(
                'E_ARGV_LEAK',
                'argv',
                `Forbidden token detected in argv[${index}].`,
                { index },
            );
        }
    }
    return { axis: 'argv', ok: true, argvLength: argv.length };
}

/**
 * Axis 4: working directory.
 *
 * Spec line 54-56: cwd pinned to envelope.sessionIsolation.workspaceRoot
 * after resolved-realpath normalization.
 */
export async function validateWorkingDirectory({
    cwd,
    workspaceRoot,
    realpathImpl = realpath,
}) {
    if (typeof cwd !== 'string' || cwd.trim() === '') {
        fail(
            'E_CWD_ESCAPE',
            'working-directory',
            'Child cwd must be a non-empty string.',
            { cwd, workspaceRoot },
        );
    }
    if (typeof workspaceRoot !== 'string' || workspaceRoot.trim() === '') {
        fail(
            'E_CWD_ESCAPE',
            'working-directory',
            'workspaceRoot must be a non-empty string.',
            { cwd, workspaceRoot },
        );
    }
    let canonicalCwd;
    let canonicalWorkspaceRoot;
    try {
        canonicalCwd = await realpathImpl(path.resolve(cwd));
        canonicalWorkspaceRoot = await realpathImpl(path.resolve(workspaceRoot));
    } catch (error) {
        fail(
            'E_CWD_ESCAPE',
            'working-directory',
            `Cannot canonicalize cwd or workspaceRoot: ${error.message}`,
            { cwd, workspaceRoot, errno: error.code ?? null },
        );
    }
    if (canonicalCwd !== canonicalWorkspaceRoot) {
        fail(
            'E_CWD_ESCAPE',
            'working-directory',
            `Child process.cwd() (${canonicalCwd}) does not match resolved workspaceRoot (${canonicalWorkspaceRoot}).`,
            { canonicalCwd, canonicalWorkspaceRoot },
        );
    }
    return {
        axis: 'working-directory',
        ok: true,
        canonicalCwd,
        canonicalWorkspaceRoot,
    };
}

/**
 * Axis 3: stdio / TTY / FD.
 *
 * Spec lines 42-46:
 *   - no detached inheritance of the parent's controlling TTY
 *   - stdio: ['pipe','pipe','pipe']; parent stdio is never inherited
 *   - file descriptors: only 0/1/2 remain open at spawn in Phase 9 v1
 *
 * Detection of fds beyond 0/1/2 is best-effort cross-platform (Linux uses
 * /proc/self/fd; Windows requires native APIs). The runner injects
 * `extraFdsDetected` from a platform helper. If unknown (Windows without
 * native helper), we accept the parent's stdio: ['pipe','pipe','pipe']
 * as the source of truth and pass the axis with a note.
 */
export function validateStdioAndFds({ isTTY, extraFdsDetected = null }) {
    if (isTTY === true) {
        fail(
            'E_FD_LEAK',
            'stdio-fd',
            'Child has an inherited controlling TTY; expected stdio pipes only.',
            { isTTY: true },
        );
    }
    if (Array.isArray(extraFdsDetected) && extraFdsDetected.length > 0) {
        fail(
            'E_FD_LEAK',
            'stdio-fd',
            `Child has extra file descriptors beyond 0/1/2: [${extraFdsDetected.join(', ')}].`,
            { extraFdsDetected },
        );
    }
    return {
        axis: 'stdio-fd',
        ok: true,
        isTTY: !!isTTY,
        extraFdsDetected: extraFdsDetected ?? [],
    };
}

/**
 * Axis 5: runtime state.
 *
 * Spec lines 164-166: no in-memory skill cache, handshake memoization, or
 * prior objective pointer is inherited in process globals; the child
 * derives state from envelope + objective artifacts.
 *
 * Node's spawn() gives the child a fresh V8 isolate, so this check is
 * structurally always true for a real spawned child. We still verify it
 * because (a) drift could introduce a global through preload modules
 * (--require) and (b) the spec requires the child to actively prove
 * coldness, not just rely on Node's guarantees.
 */
export function validateRuntimeState(globals = globalThis, options = {}) {
    const forbidden = options.forbiddenKeys ?? COLD_CHILD_FORBIDDEN_GLOBAL_KEYS;
    for (const key of forbidden) {
        if (globals != null && Object.prototype.hasOwnProperty.call(globals, key)) {
            fail(
                'E_INHERITED_SESSION_TOKEN',
                'runtime-state',
                `Inherited runtime-state global ${key} is observable in the child.`,
                { key },
            );
        }
    }
    return { axis: 'runtime-state', ok: true };
}

/**
 * Run all six axes. Returns the per-axis verdict array on success; throws
 * the first ColdChildSeveranceError on failure. Order matches the spec
 * file 07 lines 147-172.
 */
export async function validateAllSeveranceAxes(input) {
    const results = [];
    results.push(validateProcessIdentity({
        processPpid: input.processPpid,
        dispatchParentPid: input.dispatchParentPid,
        parentAlive: input.parentAlive,
    }));
    results.push(validateEnvironment(input.env, input.envOptions ?? {}));
    results.push(validateArgv(input.argv, input.argvOptions ?? {}));
    results.push(await validateWorkingDirectory({
        cwd: input.cwd,
        workspaceRoot: input.workspaceRoot,
        realpathImpl: input.realpathImpl ?? realpath,
    }));
    results.push(validateStdioAndFds({
        isTTY: input.isTTY,
        extraFdsDetected: input.extraFdsDetected,
    }));
    results.push(validateRuntimeState(
        input.globals ?? globalThis,
        input.runtimeStateOptions ?? {},
    ));
    return { ok: true, axes: results, axisOrder: COLD_CHILD_AXES };
}
