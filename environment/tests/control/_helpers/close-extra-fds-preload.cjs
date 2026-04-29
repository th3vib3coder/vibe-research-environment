'use strict';

// Close parent-leaked file descriptors above 0/1/2 BEFORE the
// reviewed-role-runner inspects /proc/self/fd, while preserving Node's
// own libuv-internal handles (anon_inode entries such as eventfd, epoll,
// signalfd) so the event loop survives.
//
// Why this exists
// ===============
// The reviewed-role-runner validates that the cold child has NO extra file
// descriptors beyond stdin/stdout/stderr (severance axis "stdio-fd"). In
// production the orchestrator that spawns a sanctioned subprocess controls
// FD inheritance; in test environments (CI runners, `node --test`, local
// IDEs) the spawning Node process keeps unrelated FDs open (log files,
// IPC pipes, file watchers, etc.) and the child inherits them. Node's
// `child_process.spawn` exposes no portable JavaScript way to close FDs
// > 2 in the cold child.
//
// Naive approach (close everything 3..N) breaks Node on Linux because
// libuv keeps internal handles open as anonymous inodes (eventfd, epoll,
// signalfd). Closing those leaves the event loop with stale references
// and the runner exits with no diagnostic. The reviewed approach is to
// inspect /proc/self/fd, skip anon_inode entries, and close only FDs
// that point to real files, pipes, or sockets — those are the parent's
// leaked descriptors.
//
// Pre-existing CI debt
// ====================
// This preload exists to close the GitHub Actions CI failure introduced
// when the cold-child severance suite first landed (Wave 4.5 round 90).
// On Linux the runner's `validateStdioAndFds` also needs to filter
// anon_inode so libuv handles do not register as leaks; that production
// code update lives in `environment/orchestrator/reviewed-role-runner.js`
// (`detectExtraFds`).

const fs = require('node:fs');

if (process.platform !== 'linux') {
    // /proc/self/fd is Linux-specific. Windows has no equivalent and Node's
    // detectExtraFds returns null on macOS too in the runner's current shape.
    return;
}

const fdDir = '/proc/self/fd';
let entries;
try {
    entries = fs.readdirSync(fdDir);
} catch {
    return;
}

for (const entry of entries) {
    const fd = Number.parseInt(entry, 10);
    if (!Number.isInteger(fd) || fd <= 2) continue;

    let target = '';
    try {
        target = fs.readlinkSync(`${fdDir}/${entry}`);
    } catch {
        // Stale FD (closed during enumeration) — skip.
        continue;
    }

    // Preserve Node libuv-internal handles. anon_inode entries cover
    // eventfd, epoll, signalfd, and similar runtime mechanics. Closing
    // them leaves the event loop in an inconsistent state and crashes
    // the runner before the validator can run.
    if (target.startsWith('anon_inode:')) continue;

    try {
        fs.closeSync(fd);
    } catch {
        // EBADF (already closed) and EPERM (kernel-owned) are both
        // expected; we are best-effort closing only leaked descriptors.
    }
}
