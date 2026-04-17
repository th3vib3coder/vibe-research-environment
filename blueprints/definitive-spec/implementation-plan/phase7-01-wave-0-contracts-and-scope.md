# Phase 7 Wave 0 — Contracts And Scope

**Goal:** Freeze every contract Waves 1-5 must respect. No runtime code or
documentation outside `implementation-plan/` lands in Wave 0.

---

## Scope Rule

Wave 0 freezes:
- expanded task registry scope (which new task kinds are shipped in Wave 1)
- CLI dispatcher v2 contract (all 12 commands, UX flags)
- three-tier writing data contract (schema-enforced tier metadata)
- connector depth contracts (Obsidian real-vs-rename, Zotero ingress)
- automation scheduling contract (host-native binding choice)
- domain-pack rule engine contract
- honesty validator semantic-upgrade contract
- surface-orchestrator cleanup contract
- closeout honesty continuation

---

## WP-176 — Phase 7 Scope And Non-Feature-Creep Statement

- Phase 7 is a capability-expansion pass on top of Phase 6's honest
  foundation.
- Every WP traces to gaps G-05..G-15 from the master spec.
- No WP reopens Phase 6 scope.
- No WP touches kernel-side code.
- No WP adds a new `environment/` top-level folder (sub-folders under
  existing top-level folders are fine).

Acceptance:
- no WP lands code outside the gap-derived set without a one-line
  justification linked to a master-spec gap ID
- every added file is traceable to exactly one Wave 1-5 WP

---

## WP-177 — Task Registry Expansion Contract

Freeze the set of new task kinds shipped in Wave 1.

Minimum shipped set (execution-lane kinds):
- `experiment-flow-register` (was rejected in Phase 5.5 Wave 2 due to F-06
  boundary, now clean after WP-124)
- `writing-export-finalize` (was rejected in Phase 5.5 Wave 2 due to F-02
  stability concern, now clean after WP-120/121)
- `results-bundle-discover` (was rejected in Phase 5.5 Wave 2 due to F-06
  boundary, now clean)

Minimum shipped set (review-lane kinds, beyond Phase 6's
`session-digest-review`):
- `contrarian-claim-review` (review lane task that picks one promoted
  claim and invokes the provider-cli executor for contrarian analysis)
- `citation-verification-review` (review lane task that asks provider-cli
  to sanity-check one citation's verification status)

Contract rules:
- each new task kind lands as one JSON under
  `environment/orchestrator/task-registry/` with schema-valid record
- each has a helperModule + helperExport that exists and is callable
- no new task kind shares a routerKeyword with any existing kind
- adapter functions in `task-adapters.js` extended to cover new kinds
  (per Phase 5.5 Wave 2 pattern)
- review-lane kinds declare `requiredCapability: "output-only"` and
  bind to the `provider-cli` integrationKind from Phase 6

Acceptance:
- five new task kinds total (three execution + two review), documented
- spec freezes the five JSON shapes at file-level — Wave 1 just implements

State ownership:
- written by: `environment/orchestrator/task-registry/*.json` (new)
- read by: `environment/orchestrator/task-registry.js` loader, router,
  lane runners

---

## WP-178 — CLI Dispatcher v2 Contract

Freeze the expansion of `bin/vre` to cover all 12 commands in `commands/`
plus the three UX flags.

New dispatch table entries required in Wave 2:
- `flow-experiment` (--register | --update <EXP-id> | --blockers)
- `flow-literature` (--register | --list | --link-claim)
- `flow-results` (--package | --list)
- `flow-writing` (--handoff | --advisor-pack | --rebuttal-pack)
- `orchestrator-run`
- `automation-status`
- `export-warning-digest`
- `stale-memory-reminder`
- `weekly-digest`

Per-command subcommand allowlist is frozen here, not in Wave 2:

| Command | Subcommands | Positionals |
|---------|-------------|-------------|
| `flow-status` | none | none |
| `sync-memory` | none | none |
| `orchestrator-status` | none | none |
| `flow-experiment` | `--register`, `--update`, `--blockers` | `--update` requires exactly one `EXP-*` id; others take none |
| `flow-literature` | `--register`, `--list`, `--link-claim` | `--link-claim` requires exactly one paper id and one claim id |
| `flow-results` | `--package`, `--list` | `--package` requires exactly one `EXP-*` id; `--list` takes none |
| `flow-writing` | `--handoff`, `--advisor-pack`, `--rebuttal-pack` | `--handoff` requires exactly one claim id or claim-list ref; pack commands require exactly one snapshot id |
| `orchestrator-run` | none | objective text, joined from remaining argv |
| `automation-status` | none | none |
| `export-warning-digest` | none | none |
| `stale-memory-reminder` | none | none |
| `weekly-digest` | none | none |

Parser convention: the first token after `<sub>` that starts with `--` is the
subcommand and must match the allowlist above. Remaining tokens are positionals
and are validated by command-specific adapters. No synthetic commands such as
`flow-experiment-register` are introduced.

Flags:
- **`--help`**: per-subcommand help derived from the command's markdown
  frontmatter + `argument-hint` field
- **`--dry-run`**: invoke middleware with a dry-run flag that executes
  read-only paths + returns what would have been written, but does NOT
  write to `.vibe-science-environment/`
- **`--json`**: replace the default TSV summary line with a JSON object
  containing {attemptId, sessionSnapshotPath, warningCount, artifactRefs}
  for programmatic consumers

wrappedByMiddleware semantics remain from Phase 5.5 WP-132 but extended
for each new entry.

Frontmatter contract v3 (additive, opt-in):
- existing `dispatch: {module, export, scope, wrappedByMiddleware}` block
- NEW optional `dispatch.dryRunSupported: boolean` — declares whether the
  helper supports dry-run mode (defaults false; dispatcher rejects
  --dry-run on unsupported commands with a clear error)
- NEW optional `dispatch.jsonOutputSupported: boolean` — declares whether
  the helper's result shape maps cleanly to JSON (defaults false)
- NEW optional `dispatch.subcommands: string[]` — machine-readable allowlist
  matching the table above byte-for-byte for commands that accept flag
  subcommands; absent means no subcommands are legal

Acceptance:
- all 12 commands have a dispatch entry OR the explicit declared subset
  is documented in Wave 5 closeout
- --help, --dry-run, --json each have exactly one implementation path, not
  per-command special cases

---

## WP-179 — Three-Tier Writing Data Contract

Freeze the schema that replaces markdown-header-only three-tier
distinction.

Current state: `writing-render.js:16,24,35` emits three string constants
as section headers. No data boundary.

New contract:
- seed files gain a YAML frontmatter block declaring
  `tier: claim-backed | artifact-backed | free`
- OR seed files are split into three subdirectories under
  `.vibe-science-environment/writing/exports/seeds/<snapshotId>/`:
  - `claim-backed/` — each file has an associated `claimRef` in its
    own frontmatter; validator enforces every claim-backed file has
    at least one `claimRef` that exists in the project's claim-ledger
  - `artifact-backed/` — each file has an associated `artifactRef`
    pointing to a real packaged artifact
  - `free/` — no backing required; speculation allowed

Schema additions (to be created in Wave 3):
- `environment/schemas/writing-seed-block.schema.json` — shape of a
  single tier-scoped seed file's frontmatter + content body
- validator `environment/tests/ci/validate-three-tier-writing.js` —
  walks seed directories, enforces per-tier invariants

Rule: mixing tiers in a single file is rejected. Operators who want
mixed content split it into tier-pure files.

Claim-backed lifecycle rule: a `claim-backed` seed block may reference only
claims that are eligible for claim-backed prose. `PROMOTED` claims are allowed
when the existing export-eligibility helper also allows them. `KILLED` and
`DISPUTED` claim refs are always rejected by the runtime enforcer even though
the schema can only validate identifier shape. The negative test for this exact
case is mandatory: a claim-backed block handed a `KILLED` claim must fail with a
typed writing-tier error and must prevent a PASS closeout if absent.

Acceptance:
- contract specifies directory layout + frontmatter shape
- Wave 3 implements; Wave 5 validator enforces in CI

---

## WP-180 — Obsidian Connector Depth Contract

Freeze the decision: real integration OR honest rename.

The current Obsidian connector (`obsidian-export.js`) copies two files
into a named directory. It has no Obsidian API/URI/vault-metadata use.

Two possible contracts:

**Contract A (real Obsidian integration)** — Wave 4 ships:
- YAML frontmatter on every mirror file (properties: title, date,
  session-id, claim-refs)
- wikilink generation: claim IDs become `[[C-NNN]]` references
- tag support: project tags applied via frontmatter `tags` array
- vault-metadata file: `.obsidian/plugins/.../metadata.json` update
- URI scheme support: `obsidian://open?vault=...&file=...` generator
- integration test spawns Obsidian CLI if available; skips honestly
  otherwise

**Contract B (honest rename)** — Wave 4 ships:
- rename connector from `obsidian-export` to `vault-target-export`
- update `environment/connectors/manifests/` filename
- update `phase4-closeout.md` to reflect the honest scope
- mirror files stay as plain markdown; no Obsidian-specific features added
- operators using Obsidian still get value (plain markdown is compatible)
  but the branding no longer overclaims
- add a one-shot non-destructive migration helper for legacy runtime state:
  `.vibe-science-environment/connectors/obsidian-export/` is copied to
  `.vibe-science-environment/connectors/vault-target-export/` when the legacy
  directory exists and the new directory does not
- never rewrite historical run-log records; historical evidence remains
  historical and the closeout note explains the rename

**Wave 0 decision**: **Contract B** ships by default. The connector is renamed
honestly instead of widened into a real Obsidian integration. Contract A is a
future explicit scope expansion only if the user requests it before Wave 4.
Contract B avoids scope creep and matches the Phase 5.5 adversarial-review
honesty discipline.

Acceptance:
- this doc explicitly names the chosen contract
- Wave 4 implementation maps 1:1 to the chosen contract

---

## WP-181 — Zotero Ingress Contract (Deferred-Implementation Option)

Freeze the Zotero ingress architecture even if Wave 4 does not ship it.

Zotero ingress is inherently kernel-adjacent: citation data flows from
Zotero → VRE → kernel citation ledger. Any real implementation crosses
the "VRE read-only against kernel" invariant.

Contract options:

**Option A (ship ingress adapter in Wave 4)** — requires kernel-side
acceptance of external citation writes through a sanctioned path:
- kernel exposes a "citation import" API endpoint (new kernel-side work;
  OUT OF VRE SCOPE)
- VRE ships `environment/connectors/zotero-ingress.js` that calls that
  endpoint
- integration test spawns a fake Zotero vault + fake kernel API

**Option B (formal deferral to Phase 8+)** — Wave 4 ships:
- architectural spec doc declaring Zotero ingress as Phase 8+ candidate
- `phase4-closeout.md` connector catalogue explicitly lists Zotero as
  DEFERRED with follow-up `FU-7-001` naming the kernel-side prerequisite

**Wave 0 decision**: Option B unless the user explicitly requests Option A
and accepts the kernel-side scope expansion. Default: **Option B**.

Acceptance:
- this doc declares the chosen option
- if Option B: Wave 4 ships only documentation, no runtime code

---

## WP-182 — Automation Scheduling And Domain-Pack Rule Engine Contracts

**Scheduling (G-10)**:
Current state: weekly-digest uses ISO-week as idempotency key. No scheduler.

Contract: Wave 4 ships ONE host-native binding from the following options:
- **GitHub Actions scheduled workflow** (`.github/workflows/scheduled-digest.yml`
  with `schedule: cron: ...`) — VRE provides CLI entry invoked by the workflow
- **POSIX cron wrapper** (`bin/vre-cron` or shell script) with examples
- **Windows Task Scheduler XML** template

The chosen binding invokes `bin/vre weekly-digest` (post-Wave-2) on the
declared cadence. The ISO-week idempotency key remains as backstop.

**Wave 0 decision**: default **GitHub Actions scheduled workflow** —
cross-platform, already in the CI path, no operator-side setup needed.

Write-back policy: artifact-only. The scheduled workflow may run
`bin/vre weekly-digest`, upload the generated digest/state summary as a GitHub
Actions artifact, and expose logs. It must not commit generated files back to
the repository, must keep `permissions.contents` read-only or absent, and must
fail validation if `contents: write` appears without a later explicit reviewed
contract change. This avoids turning scheduled automation into an unreviewed
repo-mutating actor.

**Domain-pack rule engine (G-11)**:
Current state: `forbiddenMutations` and `doesNotModify` declared in omics
pack but unenforced at runtime.

Contract: Wave 4 ships a generic rule engine at
`environment/domain-packs/rule-engine.js` that:
- reads the active domain-pack's rule declarations
- is invoked by affected runtime paths (e.g., `flows/experiment.js` when
  manifest modification would violate a pack rule)
- throws typed errors (`DomainPackRuleViolationError`) that the caller
  converts to visible escalations

Omics is the test case. Additional domain-packs become trivial once the
engine is generic.

Acceptance:
- scheduling option chosen and declared
- rule engine interface (function signatures + error taxonomy) documented

---

## Closeout Honesty Continuation For Phase 7

Same rules as Phase 6 WP-153 (WP-119 standard from Phase 5.5).
Documented here for completeness; no new acceptance beyond prior phases.

**Wave 0 decision**: Phase 7 Wave 5 upgrades `validate-closeout-honesty` with a
bounded semantic cite-check. Each PASS row's evidence file must contain at
least one normalized keyword from the gate description unless the row declares
an explicit structured exemption. The exact algorithm is specified in Wave 5
spec (phase7-06) and closes G-13.

---

## Parallelism

- WP-176 runs first (scope freeze).
- WP-177, WP-178, WP-179, WP-180, WP-181, WP-182 run in parallel after
  WP-176.
- All Wave 0 work must complete before Wave 1 opens.

---

## Exit Condition

Wave 0 is complete when:
- all seven WP contracts are frozen and checked into this doc
- no Wave 1-5 WP depends on an unfrozen contract
- Obsidian and Zotero decisions (Contract A/B, Option A/B) are explicitly
  declared
- Scheduling host-native binding choice is explicitly declared
- the five new task-kind names are frozen
- all 12 commands have a declared dispatch intention (wired OR explicitly
  declared agent-only with reason)
