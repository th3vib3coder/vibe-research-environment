'use strict';

// Close all file descriptors above 0/1/2 before the reviewed-role-runner starts.
//
// Why this exists
// ===============
// The reviewed-role-runner validates that the cold child has NO extra file
// descriptors beyond stdin/stdout/stderr (severance axis "stdio-fd"). In
// production this is correct: the orchestrator that spawns a sanctioned
// subprocess controls FD inheritance carefully and only propagates 0/1/2.
//
// In test environments, however, the spawning Node process (CI runner,
// local IDE, `node --test`) keeps many FDs open (3+ for log files, IPC
// pipes, mtimes, etc.). On Linux the child inherits those FDs by default,
// because Node's `child_process.spawn` only controls FDs 0/1/2 via the
// `stdio` option and exposes no portable way to close FDs 3+ from the
// JavaScript side. On Windows /proc/self/fd does not exist, so the
// validator returns null and treats the axis as pass-with-note; on Linux
// the same spawn shape leaks FDs into the child and the validator fails
// closed.
//
// This preload simulates the production-clean spawn shape by closing FDs
// 3..MAX_FD inside the child *before* the runner code runs. It does not
// weaken the validator: the validator still inspects the live FD table and
// still fails when FDs leak. It only ensures that test setups, which
// inherit unrelated parent-runner FDs, do not pollute the cold-child FD
// table the reviewed-role-runner is asked to verify.
//
// Pre-existing CI debt
// ====================
// This file exists to close a pre-existing CI failure introduced when the
// cold-child severance suite first landed (Wave 4.5 round 90, ledger
// row 92). On Linux GitHub Actions every push from that point onward
// reported `E_FD_LEAK` on the all-axes-pass test and the runtime-state
// test. The runner-side validator is intentional and stays strict; the
// fix is purely on the test fixture, restoring the production-shaped
// child FD table before the cold-child runner inspects it.

const { closeSync } = require('node:fs');

const MAX_TEST_FD = 1024;
for (let fd = 3; fd < MAX_TEST_FD; fd += 1) {
    try {
        closeSync(fd);
    } catch {
        // EBADF (fd not open) and EPERM (fd owned by Node runtime) are
        // expected; we are best-effort closing only the leaked descriptors.
    }
}
