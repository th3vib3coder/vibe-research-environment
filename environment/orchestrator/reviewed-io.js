/**
 * Reviewed IO wrapper — Phase 9 child-side write sandbox per spec file 07
 * §Threat Model For Write Sandbox lines 100-145.
 *
 * Every write target is resolved to realpath before the handle opens; writes
 * outside `workspaceRoot ∪ scratchRoot ∪ objective-artifacts root` raise
 * `E_WORKSPACE_WRITE_ESCAPE`. This is a reviewed-code mistake-containment
 * boundary, not an adversarial OS sandbox (line 102-107).
 *
 * The wrapper exposes the four write primitives reviewed child code may
 * legitimately need: writeFile, appendFile, mkdir, rm. Reads are not
 * restricted; the wrapper only gates writes.
 */
import { appendFile, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class ReviewedIOError extends Error {
    constructor({ code, message, extra = {} }) {
        super(message);
        this.name = 'ReviewedIOError';
        this.code = code;
        this.extra = extra;
    }
}

function isPathInside(baseDir, candidatePath) {
    const relativePath = path.relative(baseDir, candidatePath);
    return (
        relativePath === ''
        || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    );
}

/**
 * Canonicalize a target path even when the path itself does not yet exist.
 * - If the target exists: returns realpath(target).
 * - If only the parent directory exists: returns realpath(parent) + basename.
 * - If neither exists: returns path.resolve(target) (will fail at write-time
 *   if the parent is missing; that is acceptable for the closure check).
 *
 * This shape matches the realpath-or-parent contract used by reviewed
 * objective-store.js handoff path normalization.
 */
async function realpathTargetOrParent(targetPath, realpathImpl = realpath) {
    const resolved = path.resolve(targetPath);
    try {
        return await realpathImpl(resolved);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(resolved);
    try {
        const realParent = await realpathImpl(parent);
        return path.join(realParent, path.basename(resolved));
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        return resolved;
    }
}

/**
 * Build a reviewed IO wrapper bound to a specific workspace closure.
 *
 * @param {object} options
 * @param {string} options.workspaceRoot - reviewed workspace canonical root
 * @param {string|null} [options.scratchRoot] - per-task scratch dir, optional
 * @param {string|null} [options.objectiveArtifactsRoot] - objective dir, optional
 * @param {string[]} [options.extraRoots] - additional canonical roots
 * @returns {Promise<{ canonicalRoots: string[], writeFile, appendFile, mkdir, rm, assertInsideClosure }>}
 */
export async function createReviewedIO(options = {}) {
    const realpathImpl = options.realpathImpl ?? realpath;
    const writeFileImpl = options.writeFileImpl ?? writeFile;
    const appendFileImpl = options.appendFileImpl ?? appendFile;
    const mkdirImpl = options.mkdirImpl ?? mkdir;
    const rmImpl = options.rmImpl ?? rm;

    const candidates = [
        options.workspaceRoot,
        options.scratchRoot,
        options.objectiveArtifactsRoot,
        ...(Array.isArray(options.extraRoots) ? options.extraRoots : []),
    ].filter((root) => typeof root === 'string' && root.trim() !== '');

    if (candidates.length === 0) {
        throw new ReviewedIOError({
            code: 'E_REVIEWED_IO_USAGE',
            message: 'createReviewedIO requires at least one allowed root (workspaceRoot / scratchRoot / objectiveArtifactsRoot / extraRoots).',
        });
    }

    const canonicalRoots = [];
    for (const root of candidates) {
        try {
            canonicalRoots.push(await realpathImpl(path.resolve(root)));
        } catch (error) {
            throw new ReviewedIOError({
                code: 'E_REVIEWED_IO_ROOT_INVALID',
                message: `Cannot canonicalize allowed root ${root}: ${error.message}`,
                extra: { root },
            });
        }
    }

    async function assertInsideClosure(target, label = 'write target') {
        if (typeof target !== 'string' || target.trim() === '') {
            throw new ReviewedIOError({
                code: 'E_WORKSPACE_WRITE_ESCAPE',
                message: `${label} must be a non-empty string.`,
                extra: { target },
            });
        }
        const canonical = await realpathTargetOrParent(target, realpathImpl);
        const inside = canonicalRoots.some((root) => isPathInside(root, canonical));
        if (!inside) {
            throw new ReviewedIOError({
                code: 'E_WORKSPACE_WRITE_ESCAPE',
                message: `${label} ${canonical} escapes the reviewed workspace closure.`,
                extra: { target, canonical, allowedRoots: [...canonicalRoots] },
            });
        }
        return canonical;
    }

    return {
        canonicalRoots: Object.freeze([...canonicalRoots]),
        assertInsideClosure,
        async writeFile(target, data, writeOptions) {
            const canonical = await assertInsideClosure(target, 'writeFile target');
            return writeFileImpl(canonical, data, writeOptions);
        },
        async appendFile(target, data, writeOptions) {
            const canonical = await assertInsideClosure(target, 'appendFile target');
            return appendFileImpl(canonical, data, writeOptions);
        },
        async mkdir(target, mkdirOptions) {
            const canonical = await assertInsideClosure(target, 'mkdir target');
            return mkdirImpl(canonical, mkdirOptions);
        },
        async rm(target, rmOptions) {
            const canonical = await assertInsideClosure(target, 'rm target');
            return rmImpl(canonical, rmOptions);
        },
    };
}
