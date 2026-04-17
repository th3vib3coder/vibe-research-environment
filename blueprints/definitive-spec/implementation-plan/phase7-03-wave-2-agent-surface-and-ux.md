# Phase 7 Wave 2 — Agent Surface And UX

**Goal:** Close G-06 (dispatcher covers only 3 of 12 commands) and G-12
(no `--help` / `--dry-run` / `--json`) by extending `bin/vre` from the
Phase 5.5 WP-132 baseline to the full WP-178 contract. The wave does not
invent new command semantics; it promotes the nine remaining markdown
contracts to machine-dispatchable, wires the three UX flags once for all
entries, and tightens path normalization + error UX to scripting-grade.

---

## Scope Rule

Wave 2 touches exactly: `bin/vre` (one binary), `commands/*.md` frontmatter
(nine additions + v3 contract), four flow modules for dispatcher-only thin
wrappers (`environment/flows/{experiment,literature,results,writing}.js`),
automation modules for dispatcher-only status/digest wrappers,
`environment/control/middleware.js` (one new option on `runWithMiddleware`),
`environment/tests/ci/validate-commands-to-js.js` (two new assertions),
`environment/tests/cli/` (extend), one new schema file
`environment/schemas/vre-cli-output.schema.json`. It does NOT invent a new
command, add a TTY/color layer, auto-discover commands, or ship a second
orchestrator surface. Anything beyond the seven WPs is Wave 3+ scope.

---

## WP-189 — Full DISPATCH_TABLE Expansion To 12 Commands

Promote the nine markdown contracts not wired in Phase 5.5 to
machine-dispatchable. The Phase 5.5 three entries stay byte-for-byte
unchanged; this WP appends nine entries and extends the v2 block with the
v3 optional fields from WP-195.

### Subcommand parsing convention — decision

The WP-178 contract names `flow-experiment --register`, not
`flow-experiment-register`. **Decision:** keep flags as flags; the
dispatcher parses `argv = [node, vre, <sub>, <subcommand?>, ...positionals]`
where `<subcommand?>` is a string that starts with `--`. The parsed shape
is `{sub, subcommand, positionals}`. Justification: (a) preserves the
markdown `argument-hint` format operators already see; (b) keeps the
allowlist tight — a subcommand value must appear in
`frontmatter.dispatch.subcommands`; (c) avoids proliferating the
`DISPATCH_TABLE` with a synthetic `flow-experiment-register` entry that
has no matching markdown contract. Rejected alternative: hyphenated keys
(`flow-experiment-register`) collide with the one-markdown-one-dispatch
pairing WP-133 froze.

### Full DISPATCH_TABLE shape (new file content, not a patch)

```js
const DISPATCH_TABLE = Object.freeze({
  // Phase 5.5 (unchanged)
  'flow-status':           { contract: 'commands/flow-status.md',
                             module:  'environment/control/query.js',
                             export:  'getOperatorStatus',
                             scope:   'flow-status',
                             wrappedByMiddleware: false,
                             dryRunSupported: false, jsonOutputSupported: true },
  'sync-memory':           { contract: 'commands/sync-memory.md',
                             module:  'environment/memory/sync.js',
                             export:  'syncMemory',
                             scope:   'sync-memory',
                             wrappedByMiddleware: false,
                             dryRunSupported: true, jsonOutputSupported: true },
  'orchestrator-status':   { contract: 'commands/orchestrator-status.md',
                             module:  'environment/orchestrator/runtime.js',
                             export:  'runOrchestratorStatus',
                             scope:   'orchestrator-status',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true },
  // Phase 7 Wave 2 (new)
  'flow-experiment':       { contract: 'commands/flow-experiment.md',
                             module:  'environment/flows/experiment.js',
                             export:  'runExperimentFlow',          // dispatcher thin wrapper (WP-189)
                             scope:   'flow-experiment',
                             wrappedByMiddleware: true,
                             subcommands: ['--register', '--update', '--blockers'],
                             dryRunSupported: false, jsonOutputSupported: true },
  'flow-literature':       { contract: 'commands/flow-literature.md',
                             module:  'environment/flows/literature.js',
                             export:  'runLiteratureFlow',          // dispatcher thin wrapper (WP-189)
                             scope:   'flow-literature',
                             wrappedByMiddleware: true,
                             subcommands: ['--register', '--list', '--link-claim'],
                             dryRunSupported: false, jsonOutputSupported: true },
  'flow-results':          { contract: 'commands/flow-results.md',
                             module:  'environment/flows/results.js',
                             export:  'runResultsFlow',             // dispatcher thin wrapper (WP-189)
                             scope:   'flow-results',
                             wrappedByMiddleware: true,
                             subcommands: ['--package', '--list'],
                             dryRunSupported: true, jsonOutputSupported: true },
  'flow-writing':          { contract: 'commands/flow-writing.md',
                             module:  'environment/flows/writing.js',
                             export:  'runWritingFlow',             // dispatcher thin wrapper (WP-189)
                             scope:   'flow-writing',
                             wrappedByMiddleware: true,
                             subcommands: ['--handoff', '--advisor-pack', '--rebuttal-pack'],
                             dryRunSupported: true, jsonOutputSupported: true },
  'orchestrator-run':      { contract: 'commands/orchestrator-run.md',
                             module:  'environment/orchestrator/runtime.js',
                             export:  'runOrchestratorObjective',
                             scope:   'orchestrator-run',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true },
  'automation-status':     { contract: 'commands/automation-status.md',
                             module:  'environment/automation/artifacts.js',
                             export:  'runAutomationStatus',        // new thin wrapper over getAutomationOverview
                             scope:   'automation-status',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true },
  'export-warning-digest': { contract: 'commands/export-warning-digest.md',
                             module:  'environment/automation/runtime.js',
                             export:  'runExportWarningDigest',
                             scope:   'export-warning-digest',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true },
  'stale-memory-reminder': { contract: 'commands/stale-memory-reminder.md',
                             module:  'environment/automation/runtime.js',
                             export:  'runStaleMemoryReminder',
                             scope:   'stale-memory-reminder',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true },
  'weekly-digest':         { contract: 'commands/weekly-digest.md',
                             module:  'environment/automation/runtime.js',
                             export:  'runWeeklyResearchDigest',
                             scope:   'weekly-digest',
                             wrappedByMiddleware: true,
                             dryRunSupported: false, jsonOutputSupported: true }
});
```

WP-189 owns the four `flow-*` dispatcher wrappers:
`runExperimentFlow`, `runLiteratureFlow`, `runResultsFlow`, and
`runWritingFlow`. They accept `{projectPath, reader, subcommand,
positionals, dryRun}` and dispatch to existing helper exports only; they do
not duplicate flow logic. They are allowed to live in their respective flow
modules because the CLI needs stable symbols to bind to.

Wrapper routing table:

| Wrapper | Subcommand | Helper target |
|---|---|---|
| `runExperimentFlow` | `--register` | `registerExperiment` |
| `runExperimentFlow` | `--update` | existing experiment update helper; if absent, return exit 3 until Wave 7 adds it |
| `runExperimentFlow` | `--blockers` | existing blocker/status helper; if absent, return exit 3 until Wave 7 adds it |
| `runLiteratureFlow` | `--register` | existing literature registration helper |
| `runLiteratureFlow` | `--list` | existing literature overview/list helper |
| `runLiteratureFlow` | `--link-claim` | existing claim-link helper; if absent, return exit 3 |
| `runResultsFlow` | `--package` | `packageExperimentResults` |
| `runResultsFlow` | `--list` | existing results overview/list helper |
| `runWritingFlow` | `--handoff` | existing writing handoff helper |
| `runWritingFlow` | `--advisor-pack` | existing advisor-pack helper |
| `runWritingFlow` | `--rebuttal-pack` | existing rebuttal-pack helper |

If a helper target named above is not present when Wave 2 starts, the wrapper
must fail closed with a typed `UnsupportedDispatchSubcommandError` and the
CLI must surface exit 3. It must not silently invent behavior.

### Six questions

1. **Enters how?** `node bin/vre <sub> [--<subcommand>] [<positionals>] [--help|--dry-run|--json]`.
2. **State where?** Zero dispatcher state. All durable writes via middleware against the resolved `projectPath`.
3. **Read by?** The markdown contract, `validate-commands-to-js.js`, and the CLI tests.
4. **Written by?** Humans at WP-189 commit; updated only when a new command is added in Phase 8+.
5. **Tested how?** `environment/tests/cli/bin-vre-dispatch-all.test.js` spawns each of the twelve subcommands against a scratch fixture and asserts exit 0 (or declared non-0 for subcommand-required cases) + session snapshot publication.
6. **Degrades how?** Unknown subcommand → exit 2 (lists all twelve). Unknown `--<subcommand>` for a valid command → exit 3 with `allowed: [...]` from `subcommands`. Helper throw → exit 1.

---

## WP-190 — `--help` Flag

Dispatcher-level help, zero middleware involvement, zero side effects.

### Semantics

- `bin/vre --help` (no sub) → prints the twelve commands + one-line descriptions, exit 0.
- `bin/vre <sub> --help` → reads `commands/<sub>.md`, parses frontmatter, prints `description`, `argument-hint`, `allowed-tools`, `dispatch.module#export`, `dispatch.scope`, `dispatch.subcommands` if present, then exit 0.
- Neither path calls `runWithMiddleware`, opens an attempt, reads kernel state, or writes to `.vibe-science-environment/`. Confirmed by the CLI test (WP-190 test asserts `attempts.jsonl` byte count is unchanged after `--help`).

### Cross-platform

Plain ASCII, no ANSI colors, LF line endings, `\n` separators. No TTY detection. Matches the Phase 5.5 WP-135 stream policy.

### Claude Code convention cross-reference

Claude Code's built-in `/help` prints `command — description` pairs (one per line, two-space indent). VRE's `bin/vre --help` **matches** that format deliberately so operators can alternate between the two surfaces without cognitive shift. Per-command help adopts a `man`-style layout (see below) because Claude Code's `/help <cmd>` does not exist.

### `bin/vre --help` output (exact layout)

```
vre — Vibe Research Environment dispatcher

Usage: node bin/vre <command> [--subcommand] [positional...] [flags]

Commands:
  flow-status             Show VRE status through the control plane and canonical session snapshot
  sync-memory             Refresh memory mirrors from allowed kernel projections and workspace state
  orchestrator-status     Show orchestrator queue, lane, escalation, and continuity status
  orchestrator-run        Start or continue one orchestrator task
  flow-experiment         Experiment flow backed by manifests and shared middleware
  flow-literature         Literature flow backed by environment/flows/literature.js
  flow-results            Package a completed experiment into a typed results bundle
  flow-writing            Writing handoff, advisor packs, and rebuttal packs
  automation-status       Show automation readiness and latest visible artifacts
  export-warning-digest   Generate the reviewable export-warning digest
  stale-memory-reminder   Generate the reviewable stale-memory reminder
  weekly-digest           Generate the reviewable weekly research digest

Flags:
  --help       Print this help (or per-command help after <command>)
  --dry-run    Simulate writes; report what would change (supported commands only)
  --json       Emit the summary as JSON instead of TSV

Exit codes: 0 success, 1 helper failed, 2 unknown command, 3 bad args, 4 middleware refused.
```

### `bin/vre flow-experiment --help` output (exact layout)

```
vre flow-experiment — Experiment flow backed by manifests and shared middleware

Usage: node bin/vre flow-experiment [--register | --update <EXP-id> | --blockers]

Subcommands:
  --register            Create a new experiment manifest
  --update <EXP-id>     Update manifest-backed experiment status or metadata
  --blockers            Surface blocked experiments with explicit reasons

Dispatch target:  environment/flows/experiment.js#runExperimentFlow
Scope:            flow-experiment
Middleware:       wrapped (dispatcher invokes helper directly; helper calls runWithMiddleware)
Allowed tools:    Read, Bash
Dry-run:          not supported
JSON output:      supported
```

### Six questions

1. **Enters how?** `--help` present in argv at position 1 or 2.
2. **State where?** None. Pure read of `commands/*.md` via `fs.readFileSync`.
3. **Read by?** Humans and scripted discovery tools.
4. **Written by?** Humans editing `commands/*.md`.
5. **Tested how?** `bin-vre-help.test.js` — spawn each `--help` variant, assert exit 0 + zero filesystem mutations via a pre/post byte-count on `.vibe-science-environment/`.
6. **Degrades how?** Missing `commands/<sub>.md` → exit 3 with a clear error; malformed frontmatter → exit 3 with the parser line that failed.

---

## WP-191 — `--dry-run` Flag

Dispatcher refuses `--dry-run` on commands whose
`dispatch.dryRunSupported !== true`; supported commands propagate the
flag through middleware into the helper.

### Middleware semantics for `dryRun: true`

`runWithMiddleware({..., dryRun: true})` **MUST**:
1. **Still open an attempt** (`openAttempt`). Dry-runs are auditable; a silent dry-run leaves no trace and that would be worse than the current agent-only path.
2. **Still append `attempt_opened` + `degraded_mode_entered` events** so the record matches the pre-dry-run shape operators recognize.
3. **Not publish a session snapshot** (`rebuildSessionSnapshot`). The snapshot is a write to `session.json`; a dry run must not mutate the canonical resume surface. A `dry_run_publish_skipped` event is appended instead.
4. **Pass `dryRun: true` through `ctx`** to `commandFn`, so the helper chooses read-only code paths.
5. **Close the attempt with status `dry_run_ok`** (new terminal status, non-final for stats; added to `FINAL_ATTEMPT_STATUSES`). WP-195 frontmatter validator ensures every `dryRunSupported: true` command maps its helper's dry-run branch to this status.

### Helpers that support dry-run

Wave 2 ships dry-run for: `sync-memory`, `flow-results --package`, `flow-writing`. Those helpers already have a clean write/compute separation:
- `syncMemory`: the "compute mirror content" step is separable from the `writeFile` step.
- `packageExperimentResults`: the bundle-file build is separable from the `mkdir + copy + writeFile` step.
- `buildWritingHandoff`, `buildAdvisorPack`, `buildRebuttalPack`: seed construction is separable from disk writes.

All other commands declare `dryRunSupported: false`; dispatcher rejects `--dry-run` with exit 3.

### Dry-run report shape

```json
{
  "dryRun": true,
  "subcommand": "sync-memory",
  "wouldWrite": [
    { "path": ".vibe-science-environment/memory/mirrors/project-overview.md", "bytes": 2341, "action": "overwrite" },
    { "path": ".vibe-science-environment/memory/mirrors/decision-log.md",     "bytes":  512, "action": "overwrite" },
    { "path": ".vibe-science-environment/memory/sync-state.json",             "bytes":  186, "action": "overwrite" }
  ],
  "wouldEmit": { "events": 3, "decisions": 0 },
  "warnings": ["kernel DB unavailable; mirrors would be refreshed in workspace-first mode"]
}
```

### Six questions

1. **Enters how?** `--dry-run` present in argv after `<sub>` and optional `--<subcommand>`.
2. **State where?** A single `attempts.jsonl` entry with status `dry_run_ok`; no other writes.
3. **Read by?** Operator stdout; `--json` mode serializes the same shape.
4. **Written by?** Only the attempt record line. Session snapshot is **not** rebuilt.
5. **Tested how?** `bin-vre-dry-run.test.js` — spawn dry-run on each supported command, assert (a) `session.json` byte count unchanged, (b) `attempts.jsonl` grew by exactly one line with status `dry_run_ok`, (c) stdout JSON matches `vre-cli-output.schema.json` dry-run variant.
6. **Degrades how?** Unsupported command + `--dry-run` → exit 3 stderr `vre: <sub>: --dry-run not supported (declare dispatch.dryRunSupported: true)`. Helper throw during dry-run → exit 1, attempt marked `failed`.

---

## WP-192 — `--json` Flag

Replace the default TSV summary with a single JSON object serialized to stdout.

### Schema file (new)

`environment/schemas/vre-cli-output.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vibe-science.io/schemas/vre-cli-output.schema.json",
  "type": "object",
  "required": ["subcommand", "attemptId", "exitCode", "durationMs"],
  "properties": {
    "subcommand":          { "type": "string" },
    "attemptId":           { "type": "string", "pattern": "^ATT-" },
    "sessionSnapshotPath": { "type": "string" },
    "durationMs":          { "type": "integer", "minimum": 0 },
    "warningCount":        { "type": "integer", "minimum": 0 },
    "artifactRefs":        { "type": "array", "items": { "type": "string" } },
    "exitCode":            { "type": "integer", "enum": [0, 1, 2, 3, 4] },
    "dryRun":              { "type": "boolean" },
    "wouldWrite": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "action"],
        "properties": {
          "path":   { "type": "string" },
          "bytes":  { "type": "integer", "minimum": 0 },
          "action": { "type": "string", "enum": ["create", "overwrite", "append"] }
        }
      }
    }
  },
  "additionalProperties": false
}
```

### Which commands don't support `--json`

All twelve declare `jsonOutputSupported: true`. The shape is uniform because every command goes through middleware and every middleware run closes an attempt. No command is excluded. Rationale: refusing `--json` for some commands is arbitrary UX noise; the TSV is kept as the default only because human operators scan it faster than JSON.

### Dispatcher behavior

- `--json` + supported → stdout receives exactly one JSON line (no pretty-print), then exit.
- `--json` + unsupported (hypothetical future command with `jsonOutputSupported: false`) → exit 3.
- `--json` + `--dry-run` → one JSON object combining both shapes (the `dryRun` and `wouldWrite` fields populated).

### Six questions

1. **Enters how?** `--json` present in argv after the optional `--<subcommand>`.
2. **State where?** Identical to non-`--json` mode; only the stdout format changes.
3. **Read by?** Scripted consumers (CI runners, automation wrappers, scheduled-task host bindings from WP-201).
4. **Written by?** Dispatcher writes to stdout only.
5. **Tested how?** `bin-vre-json.test.js` — run each command with `--json`, assert stdout parses as JSON and validates against the schema via Ajv.
6. **Degrades how?** Unsupported → exit 3. Schema-drift caught in CI by a new `validate-cli-json-output.js` that runs each command against a fixture and validates stdout.

---

## WP-193 — Cross-Platform Path Normalization Edge Cases

Phase 5.5 WP-135 normalized forward-slash output on Windows. Wave 2 extends to four edge cases the existing tests do not cover.

### Policy (frozen here, implemented in `bin/vre`)

- **Forward-slash normalization**: retained from WP-135. All emitted paths use `/`.
- **Unicode normalization**: all paths printed or schema-matched use **NFC** (Unicode Normalization Form C). macOS's HFS+ returns NFD; the dispatcher calls `String.prototype.normalize('NFC')` before emission. Tested via a fixture filename with a combining accent.
- **Symlinks inside `.vibe-science-environment/`**: resolve eagerly via `fs.realpath`. If an operator symlinks `.vibe-science-environment/control/` to a shared drive, the dispatcher emits the resolved path. Rationale: downstream tools need stable paths; symlink indirection breaks `attempts.jsonl` append semantics across hosts.
- **UNC paths (Windows `\\server\share\...`)**: detect `\\`-prefix, preserve the server/share portion, normalize only the tail to `/`. Emitted as `//server/share/path/to/file` (double-slash retained). This is valid in `file://` URLs and accepted by Node's `path.resolve`.
- **Windows long paths (>260 chars)**: wrap with the `\\?\` prefix internally but **strip** it before emission to stdout. Tests assert no `\\?\` appears in `--json` output. Requires Node 18+ (already the minimum per `package.json` engines).

### Test surface

Existing tests: `bin-vre-crossplatform.test.js` covers forward-slash emission for the three Phase 5.5 commands. Gap: all four edge cases above are uncovered.

New tests in `environment/tests/cli/bin-vre-path-normalization.test.js`:
1. `vre flow-status` where fixture dir name contains `é` composed as NFD → stdout path contains `é` as NFC, byte-compared.
2. `vre sync-memory` where `.vibe-science-environment/` is a symlink to a sibling dir → `--json` `sessionSnapshotPath` points to the real target.
3. On Windows only (skip on POSIX): fixture path starting with `\\?\` → stdout strips the prefix.
4. On Windows only: fixture path longer than 260 chars → dispatcher succeeds; `--json` output validates.
5. On Windows only: `\\server\share\project\` UNC fixture (mocked via `subst`) → stdout emits `//server/share/project/...`.

### Six questions

1. **Enters how?** Every path emitted to stdout or serialized in `--json`.
2. **State where?** In-memory; no new state file.
3. **Read by?** Scripted consumers, CI path comparators.
4. **Written by?** WP-193 commit; no runtime mutation.
5. **Tested how?** Five test cases above; POSIX-only tests skipped on win32 and vice versa via `process.platform` guards.
6. **Degrades how?** `fs.realpath` on a broken symlink → exit 3 with a clear error (path not resolvable); no silent substitution.

---

## WP-194 — Error Messages And Retry Guidance

Phase 5.5 prints `vre: <sub>: <msg>` on stderr. Wave 2 extends with context-aware guidance for the three most common failure classes.

### Concrete examples

1. **Exit code 4 (middleware refused, attempt already locked)**:
   ```
   vre: flow-experiment: middleware refused — attempt already locked
     hint: another /flow-experiment attempt is still open; run `node bin/vre flow-status` to see the active attempt id, then close it manually or wait for timeout.
   ```
2. **Exit code 1 (helper throw, not kernel-related)** with `VRE_DEBUG=1` absent:
   ```
   vre: flow-results: manifest EXP-042 has no outputArtifacts; refusing to package
   ```
   Same with `VRE_DEBUG=1`:
   ```
   vre: flow-results: manifest EXP-042 has no outputArtifacts; refusing to package
     at packageExperimentResults (environment/flows/results.js:87:11)
     at async invokeEntry (bin/vre:214:20)
     ...
   ```
3. **ENOENT-class (kernel bridge expected, `VRE_KERNEL_PATH` unset)**:
   ```
   vre: flow-status: running in degraded mode (no kernel bridge)
     hint: set VRE_KERNEL_PATH to the vibe-science checkout root to enable kernel-backed projections.
     docs: blueprints/definitive-spec/implementation-plan/phase6-03-wave-2-provider-integration.md
   ```

### Dispatcher rules

- `MIDDLEWARE_REFUSED` → exit 4; stderr includes a hint keyed to `error.code` when present (e.g., `BUDGET_HARD_STOP` → run `/flow-status`; `ATTEMPT_LOCK_CONFLICT` → see active attempt).
- Any helper throw → `process.stderr.write(error.message)`; append stack **only** if `process.env.VRE_DEBUG === '1'`.
- ENOENT on `core-reader-cli.js` while `VRE_KERNEL_PATH` is set → full path in the error; if unset → the degraded hint above.

### Six questions

1. **Enters how?** Every `catch` in the dispatcher main loop.
2. **State where?** Zero; stderr-only.
3. **Read by?** Operator terminal, CI job logs.
4. **Written by?** WP-194 commit.
5. **Tested how?** `bin-vre-error-messages.test.js` — deterministic fixtures that induce each of the three classes; asserts stderr regex-match on the hint prefix.
6. **Degrades how?** Error-message generator itself throws (unlikely) → falls through to the raw `error.message` per Phase 5.5 behavior.

---

## WP-195 — Frontmatter v3 + Validator Upgrade

Extend the v2 `dispatch` block with three optional fields and extend `validate-commands-to-js.js` to enforce their contracts.

### v3 frontmatter example (authoritative)

```yaml
---
description: Experiment flow backed by manifests, experiment summary state, and shared middleware
argument-hint: "--register | --update <EXP-id> | --blockers"
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/flows/experiment.js
  export: runExperimentFlow
  scope: flow-experiment
  wrappedByMiddleware: true
  dryRunSupported: false
  jsonOutputSupported: true
  subcommands:
    - --register
    - --update
    - --blockers
---
```

### Backwards compatibility

v2 frontmatter (the three Phase 5.5 commands) remains valid:
- absent `dryRunSupported` → parser defaults to `false`.
- absent `jsonOutputSupported` → parser defaults to `false` (strict). Wave 2 commit updates the three Phase 5.5 frontmatters to explicitly set `jsonOutputSupported: true` so the default never fires in a wired command; defaulting to `false` is the conservative interpretation when future unwired commands are authored.
- absent `subcommands` → parser treats the command as no-subcommand; any positional starting with `--` is an error (exit 3).

The YAML parser in `bin/vre` (section 73-109 of the current file) accepts the list-of-strings shape for `subcommands` via a small extension: a line `  - <value>` under a section key is parsed as a push into an array. No external YAML library added.

### Validator extensions (`validate-commands-to-js.js`)

New assertions, additive to existing ones:

1. **Dry-run test coverage**: for every entry with `dryRunSupported: true`, assert a test file exists at `environment/tests/cli/bin-vre-dry-run.test.js` **and** that its source contains a literal substring `'--dry-run'` paired with the entry's subcommand name (e.g., `'sync-memory'`). Regex: `new RegExp(\`['"]${sub}['"][\\s\\S]{0,500}?--dry-run\`)`. False negatives possible if a test splits across >500 chars; documented error bound, acceptable for MVP.
2. **Subcommand handling**: for every entry with `subcommands: [...]`, assert the `DISPATCH_TABLE` entry `subcommands` array matches byte-for-byte (deep-equal). Catches the case where frontmatter declares `--register` but the dispatcher's route table forgot it.
3. **JSON schema coverage**: for every entry with `jsonOutputSupported: true`, assert that `environment/schemas/vre-cli-output.schema.json` exists and Ajv-compiles. (One schema, many commands — single presence check.)

Output format unchanged from WP-134:
- Success: `OK validate-commands-to-js`
- Failure: `FAIL validate-commands-to-js: commands/flow-experiment.md declares subcommand --register but DISPATCH_TABLE.flow-experiment.subcommands lacks it`

### Six questions

1. **Enters how?** Human edits `commands/*.md`; CI runs validator.
2. **State where?** On disk, as frontmatter.
3. **Read by?** `bin/vre` at dispatch; validator at CI; Claude Code at agent invocation.
4. **Written by?** Humans only.
5. **Tested how?** `environment/tests/ci/fixtures/commands-drift/` gets three new drift cases: missing subcommand in table; missing dry-run test; malformed v3 list.
6. **Degrades how?** Malformed frontmatter → CI fails loudly; dispatcher exit 3 with line number.

---

## Parallelism

- WP-189 and WP-195 run in parallel (dispatcher table and frontmatter contract freeze independently).
- WP-190, WP-191, WP-192 run in parallel after WP-189 (each is a flag implementation on the expanded table).
- WP-193 and WP-194 run in parallel after WP-189 (path normalization and error UX are orthogonal).
- Validator extension in WP-195 lands last (consumes WP-189 dispatch shape + WP-191/WP-192 flags).

---

## Open Questions (Consciously Deferred)

- **Streaming `--json`** (one JSON object per line for commands that emit multiple events): deferred to Phase 8. Wave 2 `--json` is a single object per command invocation. The `event-record.schema.json` already supports per-event streaming inside `events.jsonl`; a CLI streaming mode duplicates that surface without clear demand.
- **Dry-run vs kernel bridge**: `--dry-run` uses the real `resolveDefaultReader` (may be kernel-backed, may be degraded). Simulating an absent kernel during dry-run is deferred — operators already get the degraded path via unsetting `VRE_KERNEL_PATH`, which is clearer than a second simulation mode.
- **`bin/vre --version`**: deferred. Phase 7 ships no version semantics; `package.json:version` is the source of truth. A `--version` flag would require agreeing on whether it reports the binary, the repo, or the kernel-bridge version. Re-open in Phase 8 alongside the release-engineering ticket.

---

## Exit Condition

Wave 2 is complete when:

1. All twelve commands dispatch through `node bin/vre <sub>` on Linux, macOS, and Windows; nine new fixtures pass in `bin-vre-dispatch-all.test.js`.
2. `node bin/vre --help` and `node bin/vre <sub> --help` print the frozen layouts for every command; the help test asserts no filesystem writes.
3. `node bin/vre sync-memory --dry-run` (and the other two supported commands) produces a dry-run report, writes exactly one `dry_run_ok` attempt, and does not mutate `session.json`.
4. `node bin/vre <any> --json` emits a single JSON object that validates against `environment/schemas/vre-cli-output.schema.json`.
5. Five path-normalization test cases pass on their target platforms.
6. Three error-message fixtures produce the exact hint prefixes on stderr.
7. `validate-commands-to-js.js` enforces v3 frontmatter invariants; drift fixtures fail loudly.
