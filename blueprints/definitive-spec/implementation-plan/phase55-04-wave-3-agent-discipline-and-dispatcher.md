# Phase 5.5 Wave 3 — Agent Discipline And Dispatcher

**Goal:** Close F-10 by giving the environment a single coercive entry point
(`bin/vre`) so agent-facing commands cannot silently bypass
`runWithMiddleware`. This wave does not replace the markdown contracts; it
promotes three of them to machine-dispatchable while keeping the rest
agent-only.

---

## Scope Rule

Wave 3 touches exactly: one new binary (`bin/vre`), one `package.json` field
(`"bin"`), one frontmatter contract extension (`dispatch` block, opt-in),
one CI validator (`validate-commands-to-js.js`). It does NOT auto-discover
commands, add a TTY/color layer, ship JSON output, or promote every
`commands/*.md` to the dispatch table. Anything beyond the three wired
commands is a Phase 6 ticket.

---

## WP-132 — Minimum CLI Dispatcher `bin/vre`

Implement the WP-118 freeze against real code. The dispatcher is the sole
runtime path an operator (human, CI, or programmatic caller) is allowed to
use to execute a VRE command without going through the agent.

### Dispatch table

Hardcoded allowlist, authoritative. Three commands for Phase 5.5:

```js
const DISPATCH_TABLE = {
  'flow-status': {
    contract: 'commands/flow-status.md',
    module: 'environment/control/query.js',
    export: 'getOperatorStatus',
    scope: 'flow-status',
    wrappedByMiddleware: false
  },
  'sync-memory': {
    contract: 'commands/sync-memory.md',
    module: 'environment/memory/sync.js',
    export: 'syncMemory',
    scope: 'sync-memory',
    wrappedByMiddleware: false
  },
  'orchestrator-status': {
    contract: 'commands/orchestrator-status.md',
    module: 'environment/orchestrator/runtime.js',
    export: 'runOrchestratorStatus',
    scope: 'orchestrator-status',
    wrappedByMiddleware: true
  }
};
```

**Why `wrappedByMiddleware` matters.** `environment/orchestrator/runtime.js`
already calls `runWithMiddleware` inside `runOrchestratorStatus`. If the
dispatcher also wraps, the invocation produces two `attempts.jsonl` entries,
two snapshot publishes, and invariants from WP-122 (provenance) and WP-123
(advisory) fire twice. The dispatcher MUST inspect this flag and invoke the
helper directly when `true`, passing the same shape of inputs
(`projectPath`, `reader`) that `runWithMiddleware` would have prepared.

Post-5.5 extension: add an entry + add a `dispatch` block to the matching
markdown. The CI drift validator (WP-134) diffs the two. No code change to
`main()` is required to extend.

### Main pseudo-code

```js
async function main(argv) {
  const [ , , sub, ...rest ] = argv;
  if (!sub) { printUsage(); return 3; }
  const entry = DISPATCH_TABLE[sub];
  if (!entry) { printUnknown(sub); return 2; }
  const repoRoot = resolveRepoRoot(process.cwd());
  if (!repoRoot) { printNotVreRoot(); return 3; }
  if (rest.length > 0) { printExtraArgs(rest); return 3; }
  const mod = await import(fileUrl(path.join(repoRoot, entry.module)));
  const helper = mod[entry.export];
  if (typeof helper !== 'function') { return 1; }
  const reader = await resolveDefaultReader(repoRoot); // see §Reader policy
  try {
    let attempt, result;
    if (entry.wrappedByMiddleware) {
      // helper wraps middleware internally; call directly to avoid double-wrap.
      result = await helper({ projectPath: repoRoot, reader });
      attempt = result?.attempt ?? { status: 'succeeded' };
    } else {
      ({ result, attempt } = await runWithMiddleware({
        projectPath: repoRoot,
        commandName: `/${sub}`,
        scope: entry.scope,
        reader,
        commandFn: async (ctx) => helper(ctx.projectPath, { reader: ctx.reader })
      }));
    }
    process.stdout.write(summaryLine(sub, attempt, result) + '\n');
    return attempt.status === 'succeeded' ? 0 : 1;
  } catch (e) {
    process.stderr.write(`vre: ${sub}: ${e.message}\n`);
    return e.code === 'MIDDLEWARE_REFUSED' ? 4 : 1;
  }
}
```

### Edge cases

- **Unknown subcommand** → exit 2, stderr lists the 3 allowed names.
- **Unknown args**: Phase 5.5 subcommands take no flags; extra argv → exit 3.
- **cwd not a VRE root** (no `.vibe-science-environment/` + no matching
  `package.json`) → exit 3, no attempts written (cannot locate `attempts.jsonl`).
- **Kernel sibling absent**: not an error. `runWithMiddleware` already
  records `degraded_mode_entered`; dispatcher stays exit 0 if the helper
  succeeds in degraded mode.

### Reader policy (addresses audit P1-K)

`resolveDefaultReader(repoRoot)` returns either a kernel-backed reader or a
degraded sentinel `{ dbAvailable: false, warning: 'CLI default: no reader
provided' }`. Lookup order:

1. If `VRE_KERNEL_PATH` env var points to a `vibe-science` sibling with
   `plugin/scripts/core-reader-cli.js` present, spawn-based reader is wired
   (shares the shape used by `evals/measure-context-baseline.js`).
2. Otherwise the degraded sentinel is returned and the run proceeds in
   declared degraded mode.
3. The dispatcher never silently substitutes `reader = undefined`; WP-122
   (`signals.provenance`) then labels the run `sourceMode: 'degraded'`.

The degraded-always case is tested explicitly by WP-138 (see WP-135
acceptance).

### Six questions

1. **Enters how?** `node bin/vre <sub>` from any cwd resolving to a VRE root.
2. **State where?** Zero dispatcher state. All durable writes inside
   `runWithMiddleware` against the resolved `projectPath`.
3. **Read by?** Nothing. Dispatcher is a caller, not a target.
4. **Written by?** Humans at WP-132 commit; updated only when a subcommand
   is promoted post-5.5.
5. **Tested how?** Smoke tests under `environment/tests/cli/` (WP-135)
   spawn `node bin/vre` against a scratch repo and assert exit codes +
   a published session snapshot.
6. **Degrades how?** Kernel bridge absent → matches markdown-invoked path.
   Helper throw → exit 1, stderr carries message, summary line suppressed.

---

## WP-133 — Frontmatter Contract For `commands/*.md`

Freeze the metadata block so the dispatcher can parse it unambiguously.

### Current v1 format (unchanged keys)

```yaml
---
description: <human-readable single line>
allowed-tools: <comma-separated Claude tool allowlist>
model: <sonnet | opus | haiku>
argument-hint: <optional usage hint>
---
```

### v2 addition (opt-in `dispatch` object)

```yaml
---
description: Show VRE status through the control plane and canonical session snapshot
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/control/query.js
  export: getOperatorStatus
  scope: flow-status
  wrappedByMiddleware: false
---
```

### Rules

- `dispatch` **present** → command is machine-dispatchable via `bin/vre`.
  The block is authoritative: `module`, `export`, `scope`, and
  `wrappedByMiddleware` must resolve at runtime. If the markdown prose
  disagrees, the block wins.
- `dispatch` **absent** → command is agent-only. `bin/vre` rejects with
  exit 2. No behavioral change for existing commands.
- Backwards-compatible: only the three wired contracts gain a `dispatch`
  block in Phase 5.5; the remaining nine `commands/*.md` are untouched.
- Parser: the dispatcher and validator share a tiny reader — split on
  `^---\n` delimiters, parse first block as a YAML subset (flat keys +
  one nested level under `dispatch`). No external YAML dependency; fields
  are controlled.

### Six questions

1. **Enters how?** Human edits the markdown file in `commands/`.
2. **State where?** On disk, as plain markdown frontmatter.
3. **Read by?** `bin/vre` at dispatch; `validate-commands-to-js.js` at CI;
   Claude Code on agent invocation.
4. **Written by?** Humans only. No runtime code writes frontmatter.
5. **Tested how?** WP-134 parses every file under `commands/`, asserts the
   five required dispatch keys and the optional `dispatch` shape.
6. **Degrades how?** Malformed frontmatter → validator fails CI;
   dispatcher refuses the subcommand with exit 3.

---

## WP-134 — Commands-To-JS Drift Validator

Add `environment/tests/ci/validate-commands-to-js.js`, register it in
`run-all.js`. Its job is to catch the case where a markdown contract
references a JS module/export that no longer exists or was renamed.

### Parse strategy

- **Frontmatter**: regex-split on `^---$`, parse first block line-by-line.
  No YAML library.
- **Prose references**: regex `/environment\/[a-z0-9_\-\/]+\.js/gi` for
  module paths and `/from\s+['"]environment\/[^'"]+['"]/g` for named
  imports. Export names via
  `/(?:import|Import)\s+\{?\s*([a-zA-Z0-9_, ]+)\s*\}?/` on the same line.

Regex accepted for the MVP. **Declared error bounds:** if an export is
referenced only in prose without the literal `Import X from
'environment/...'` phrasing, the validator misses it (false negative) —
acceptable because the `dispatch` block covers the machine path and prose
references were always advisory. A false **positive** (claiming drift
when none exists) is a CI-blocking bug and tracked as such.

### Verification steps per command

1. Read markdown, parse frontmatter.
2. If `dispatch` present: resolve `module` from repo root; `import()` it;
   assert the named `export` is a function.
   Also assert `wrappedByMiddleware` is a boolean and exactly matches the
   corresponding `DISPATCH_TABLE` entry.
3. Walk prose; for every `environment/<...>.js` reference, assert the file
   exists; for every `Import X from 'environment/<...>'` capture, assert
   `X` is exported by that module.
4. Aggregate failures into one assertion message per command.

### Output format (matches `runValidator()` from `_helpers.js`)

Success:
```
OK validate-commands-to-js
```

Failure:
```
FAIL validate-commands-to-js: commands/sync-memory.md references environment/memory/sync.js#syncMemoryy, not exported
```

`process.exitCode = 1` on failure.

### Six questions

1. **Enters how?** `npm run validate` → `run-all.js` loop.
2. **State where?** None. In-memory parse and assert.
3. **Read by?** CI log, developers fixing drift.
4. **Written by?** Humans, one-time commit.
5. **Tested how?** Fixture under `environment/tests/ci/fixtures/`: a
   drifted markdown that must fail; a clean fixture that must pass.
6. **Degrades how?** Missing `commands/` → loud fail (broken repo state).

---

## WP-135 — Minimal Operator UX For `bin/vre`

Freeze the operator-facing behavior so humans and scripts get predictable
exit codes and stream separation.

### Exit codes

- `0` — subcommand succeeded; `attempts.jsonl` closed with `succeeded`.
- `1` — subcommand ran but command function threw or attempt status is
  `failed | blocked | timeout`.
- `2` — subcommand not in dispatch table.
- `3` — bad argv (missing subcommand, extra args, cwd not VRE root).
- `4` — middleware refused (budget hard stop; provider gateway fail-closed).
  In 5.5, only budget hard stop maps here.

### Stream policy

- stdout: exactly one line on success — TSV summary (`subcommand,
  attemptId, snapshotPath, durationMs`). JSON deferred.
- stderr: all diagnostics, warnings, stack traces, usage hints.
- No TTY detection. No ANSI colors.

### Cross-platform

- All path joins via `path.resolve` + `path.join`; summary-line paths
  normalized to forward slashes via `.split(path.sep).join('/')` before
  print.
- Shebang `#!/usr/bin/env node` with LF line ending; Windows invokes
  `node bin/vre ...` (shebang ignored but harmless).
- `package.json` adds `"bin": { "vre": "bin/vre" }`; `npm link` resolves
  the binary on all three platforms.
- No `chmod +x` dependency: invocation is always `node bin/vre`.

### Minimum tests (registered in `validate-runtime-contracts.js` under new `activeCliTestFiles`)

- `environment/tests/cli/bin-vre-smoke.test.js`:
  - `node bin/vre flow-status` → exit 0, stdout one TSV line, `session.json`
    schema-valid.
  - `node bin/vre sync-memory` → exit 0, mirrors written.
  - `node bin/vre orchestrator-status` → exit 0, summary includes
    `objective=none` for empty queue.
- `environment/tests/cli/bin-vre-errors.test.js`:
  - `node bin/vre` → exit 3.
  - `node bin/vre nonexistent` → exit 2, stderr lists 3 wired commands.
  - `node bin/vre flow-status --bogus` → exit 3.
  - budget hard-stop scenario → exit 4, attempt `blocked`.
- `environment/tests/cli/bin-vre-crossplatform.test.js`: assert summary
  contains only `/` regardless of `path.sep`, by constructing the expected
  path and comparing to stdout on win32 and posix.

### Six questions

1. **Enters how?** `node bin/vre <sub>` from shell, CI job, or scripted
   operator tool.
2. **State where?** Zero dispatcher-local state; flows through middleware.
3. **Read by?** Operators reading stdout/stderr; CI parsers keying on
   exit codes.
4. **Written by?** WP-132 commit; updated only on post-5.5 promotions.
5. **Tested how?** Three test files above, registered in
   `validate-runtime-contracts.js`.
6. **Degrades how?** Middleware failure → exit 4, structured stderr.
   Helper throw → exit 1, full message on stderr, summary suppressed.

---

## Parallelism

- WP-132 and WP-133 run in parallel — the dispatcher consumes frontmatter,
  but both shapes are frozen contracts that can be authored independently
  and converged at review.
- WP-134 depends on WP-133 (parses the frozen shape).
- WP-135 depends on WP-132 (tests spawn the binary).
- Nothing in this wave blocks Wave 1 or Wave 2.

---

## Deferred Questions

Consciously-deferred Phase 6 tickets, not Phase 5.5 blockers:

- **Auto-discovery vs. allowlist**: Should `bin/vre` iterate
  `commands/*.md` and dispatch every file with a `dispatch` block,
  removing the hardcoded table? The allowlist is conservative in 5.5
  because it doubles as a security boundary. Revisit when Phase 6 widens
  the execution lane.
- **JSON output mode**: Should the dispatcher support `--json` so
  programmatic consumers get structured summaries instead of TSV?
  Deferred — the one-line TSV covers CI wiring, and a premature JSON shape
  lock would constrain Phase 6 surfaces.
- **`--dry-run`**: Should the dispatcher expose a mode that resolves the
  entry, logs what middleware would record, and exits without side
  effects? Useful for operator training but adds a second code path.
  Deferred until Phase 6 Review lane needs it.

---

## Exit Condition

Wave 3 is complete when:

1. `node bin/vre flow-status`, `node bin/vre sync-memory`, `node bin/vre
   orchestrator-status` each produce a valid session snapshot from a clean
   VRE repo root on Linux, macOS, and Windows.
2. `commands/flow-status.md`, `commands/sync-memory.md`,
   `commands/orchestrator-status.md` carry a schema-valid `dispatch` block
   whose entries match `DISPATCH_TABLE` byte-for-byte, including
   `wrappedByMiddleware` (enforced by WP-134).
3. `validate-commands-to-js.js` is registered in `run-all.js`, passes on
   the current tree, and fails loudly when a drift fixture is introduced.
4. WP-135 tests under `environment/tests/cli/` pass on `npm run check`,
   covering smoke, error, and cross-platform paths.
