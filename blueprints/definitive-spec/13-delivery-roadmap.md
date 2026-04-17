# 13 — Delivery Roadmap

---

## Sequencing Principle

Build from highest researcher pain to lowest epistemic risk.

## Live Status Snapshot (2026-04-17)

- Phase 0: complete
- Phase 1: closed with [phase1-closeout.md](./implementation-plan/phase1-closeout.md) (`16 PASS, 1 PARTIAL` after Phase 5.5 honesty correction)
- Phase 2: closed with [phase2-closeout.md](./implementation-plan/phase2-closeout.md)
- Phase 3: closed with [phase3-closeout.md](./implementation-plan/phase3-closeout.md) (`7 PASS, 1 PARTIAL` after regenerated evidence)
- Phase 4: closed with [phase4-closeout.md](./implementation-plan/phase4-closeout.md) (`6 PASS, 1 PARTIAL, 1 DEFERRED`)
- Phase 5: closed with [phase5-closeout.md](./implementation-plan/phase5-closeout.md) (`4 PASS, 1 FALSE-POSITIVE` on the historical review-lineage gate)
- Phase 5.5: implementation closed with [phase55-closeout.md](./implementation-plan/phase55-closeout.md); Phase 6 remains blocked until the external adversarial-review follow-up is accepted

The sections below preserve the original build order and gate definitions.
Historical checklist boxes below are planning artifacts, not current truth. The
audited status for each phase lives in the closeout dossier linked above, and
Phase 5.5 corrections override older PASS language when they conflict.

---

## Phase 0: Contract (COMPLETE)

All design foundations are decided.

- [x] Kernel boundary explicit (Core Contract)
- [x] User stories grounded in real workflow pain (5 stories)
- [x] core-reader.js ownership explicit (kernel-side)
- [x] Prompt-driven execution model explicit (two-substrate)
- [x] V1 flow state out-of-kernel and file-backed
- [x] Repo topology decided (same repo now, separate later)
- [x] Definitive spec written (this document set)

---

## Phase 1: Control Plane + Flow Engine MVP (COMPLETE)

**Goal:** Expose kernel state through a stable read-only API, add a canonical
outer-project control plane, and build the first two flows on top of it.

Closeout:
- [phase1-closeout.md](./implementation-plan/phase1-closeout.md)

### Deliverables

Historical deliverable statuses are preserved as planning context. For the
current audited outcome, use [phase1-closeout.md](./implementation-plan/phase1-closeout.md).

| Deliverable | Status | File |
|-------------|--------|------|
| core-reader.js | IMPLEMENTED | `plugin/lib/core-reader.js` |
| core-reader-cli.js | IMPLEMENTED | `plugin/scripts/core-reader-cli.js` |
| core-reader tests | IMPLEMENTED | `tests/core-reader.test.mjs` |
| control-plane spec | PLANNED | `blueprints/definitive-spec/03A-control-plane-and-query-surface.md` |
| session snapshot helper | PLANNED | `environment/control/session-snapshot.js` |
| attempt ledger helper | PLANNED | `environment/control/attempts.js` |
| decision log helper | PLANNED | `environment/control/decisions.js` |
| telemetry helper | PLANNED | `environment/control/events.js` |
| capability snapshot helper | PLANNED | `environment/control/capabilities.js` |
| control query helper | PLANNED | `environment/control/query.js` |
| control middleware | PLANNED | `environment/control/middleware.js` |
| token counter helper | PLANNED | `environment/lib/token-counter.js` |
| session metrics helper | PLANNED | `environment/lib/session-metrics.js` |
| control-plane templates | PLANNED | `environment/templates/session-snapshot.v1.json`, `environment/templates/attempt-record.v1.json`, `environment/templates/flow-index.v1.json` |
| /flow-status command | PREVIEW | `commands/flow-status.md` |
| /flow-literature command | PREVIEW | `commands/flow-literature.md` |
| /flow-experiment command | PREVIEW | `commands/flow-experiment.md` |
| flow-state helper | PLANNED | `environment/lib/flow-state.js` |
| experiment manifest helper | PLANNED | `environment/lib/manifest.js` |
| install-state schema | PLANNED | `environment/schemas/install-state.schema.json` |
| costs record schema | PLANNED | `environment/schemas/costs-record.schema.json` |
| JSON schemas + validators | PLANNED | `environment/schemas/*.schema.json` |
| evaluation harness scaffold | PLANNED | `environment/evals/` + `blueprints/definitive-spec/14A-evaluation-harness.md` |
| literature flow helper | PLANNED | `environment/flows/literature.js` |
| experiment flow helper | PLANNED | `environment/flows/experiment.js` |
| Flow state templates | IMPLEMENTED | `environment/templates/*.json` |
| Kernel governance profiles | KERNEL PREREQUISITE | compatible Vibe Science version |
| Kernel config protection | KERNEL PREREQUISITE | compatible PreToolUse enforcement |
| Kernel governance event table | KERNEL PREREQUISITE | append-only `governance_events` support |

### Exit Gates

Historical gate checkboxes are preserved as original roadmap intent. The current
Phase 1 gate result is [phase1-closeout.md](./implementation-plan/phase1-closeout.md),
including the Phase 5.5 downgrade of Gate 17 to `PARTIAL`.

- [x] core-reader.js has 8 tested projection functions
- [x] CLI bridge returns stable JSON envelope
- [x] Flow state lives outside kernel in `.vibe-science-environment/`
- [ ] Canonical operator snapshot lives in `.vibe-science-environment/control/session.json`
- [ ] Every `/flow-*` invocation opens and closes an attempt record
- [ ] Capability snapshot exists and defaults unknown advanced features to `false`
- [ ] Shared middleware chain handles capabilities, attempts, budget, events, and snapshot publish
- [ ] `/flow-status` resumes and produces human-readable summary
- [ ] `/flow-literature` registers a paper and links it to a claim
- [ ] `/flow-experiment` creates manifest and tracks outputs
- [ ] `/flow-experiment` lists existing manifests
- [ ] At least one flow demonstrates two-substrate rule
- [ ] Flow state, control-plane records, install state, and experiment manifests validate against JSON schemas before write
- [ ] At least one saved operator-validation artifact shows a researcher can resume context or continue work in <=2 minutes using `/flow-status` or a `/flow-*` command
- [ ] Phase 1 scenarios exist in the evaluation harness and each has at least one saved run artifact
- [ ] Baseline context cost measured (CLAUDE.md + SKILL.md + SessionStart + one flow)
- [ ] Kernel governance prerequisites verified against compatibility checklist

---

## Phase 2: Memory Mirrors + Experiment Packaging (COMPLETE)

**Goal:** Solve Story 1 (orientation) and Story 2 (experiment findability).

Closeout:
- [phase2-closeout.md](./implementation-plan/phase2-closeout.md)

### Deliverables

- `commands/sync-memory.md`
- `environment/memory/sync.js`
- `/sync-memory` command
- `project-overview.md` mirror
- `decision-log.md` mirror
- `memory/index/marks.jsonl` retrieval/prioritization sidecar
- Experiment result bundles
- Figure catalog
- Session digest export

### Exit Gates

Historical gate checkboxes are preserved as original roadmap intent. The current
Phase 2 gate result is [phase2-closeout.md](./implementation-plan/phase2-closeout.md),
including the Phase 5.5 note that export-policy coupling was removed after the
original closeout.

- [ ] Memory mirror updates via explicit command with visible timestamp
- [ ] Decision log mirrors control-plane decisions without becoming a second truth path
- [ ] Marks guide retrieval/prioritization without changing truth semantics
- [ ] Experiment bundles contain manifest + outputs + claim link
- [ ] Experiment bundles record `sourceAttemptId`
- [ ] Researcher finds past experiment results in <1 minute
- [ ] Stale mirrors (>24h) flagged in `/flow-status`

---

## Phase 3: Writing Handoff + Deliverables (COMPLETE)

**Goal:** Solve Story 3 (advisor prep) and Story 4 (safe writing).

Closeout:
- [phase3-closeout.md](./implementation-plan/phase3-closeout.md)

### Deliverables

- `/flow-writing` command
- `/flow-results` command
- `environment/lib/export-eligibility.js`
- export snapshot writer
- export record and alert schemas
- profile-safety compatibility check for `governance_profile_at_creation`
- Advisor-meeting pack generator
- Rebuttal prep pack
- Post-export safety warnings

### Exit Gates

Historical gate checkboxes are preserved as original roadmap intent. The current
Phase 3 gate result is [phase3-closeout.md](./implementation-plan/phase3-closeout.md),
including regenerated operator evidence and the `PARTIAL` status for runtime
three-tier writing boundaries.

- [ ] Export-eligibility only exports claims accepted by the shared helper (`PROMOTED` + verified citations + profile safety extension)
- [ ] Zero tracked citations block export eligibility
- [ ] Export-eligibility implemented once in shared helper, not duplicated
- [ ] Claim-backed writing runs against frozen export snapshots
- [ ] Killed/disputed claims produce visible warnings after export
- [ ] Advisor pack assembleable from one command
- [ ] Three-tier writing distinction enforced (claim-backed, artifact-backed, free)

---

## Phase 4+: Connectors, Automations, Domain Packs (COMPLETE)

Closeout:
- [phase4-closeout.md](./implementation-plan/phase4-closeout.md)

- Bibliography adapters AFTER literature flow works
- Automations AFTER flows define "stale" and "blocked"
- Domain packs AFTER flows define workflow stages
- Surface orchestrator layer AFTER VRE southbound contracts are stable enough to
  support a user-facing supervision runtime
- Use Claude Code Channels for event ingress
- Use Claude Code Scheduled Tasks for durable automation
- Add richer eval storage only after control plane and base flows are stable

With Phase 1-4 now closed, that surface-orchestrator prerequisite is satisfied.
The next planning frontier is the companion orchestrator Phase 0 contract-freeze
track under `surface-orchestrator/`, including continuity-profile and
context-assembly semantics above VRE.

Phase 5.5 correction: Phase 4 is closed as an outer-project substrate, but
host-native recurring scheduling and domain-pack mutation enforcement are not
implemented yet; see [phase4-closeout.md](./implementation-plan/phase4-closeout.md).

---

## Phase 5: Surface Orchestrator MVP (COMPLETE)

**Goal:** Ship the first local coordinator runtime above VRE without turning
the project into a general-purpose agent platform.

Closeout:
- [phase5-closeout.md](./implementation-plan/phase5-closeout.md)

Planning set:
- [implementation-plan/phase5-00-index.md](./implementation-plan/phase5-00-index.md)
- [implementation-plan/phase5-01-wave-0-contract-artifacts.md](./implementation-plan/phase5-01-wave-0-contract-artifacts.md)
- [implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md](./implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md)
- [implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md](./implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md)
- [implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md](./implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md)
- [implementation-plan/phase5-05-wave-4-tests-and-validators.md](./implementation-plan/phase5-05-wave-4-tests-and-validators.md)
- [implementation-plan/phase5-06-wave-5-evals-and-closeout.md](./implementation-plan/phase5-06-wave-5-evals-and-closeout.md)

Critical scope calls:
- local runtime in the VRE repo
- command-shim and filesystem-first operator surfaces
- one execution lane plus one review lane
- explicit continuity updates only
- tests, validators, evals, and closeout evidence are part of the phase, not cleanup work

Closed outcome:
- local coordinator MVP shipped under `environment/orchestrator/`
- Phase 5 saved benchmark repeats, operator-validation artifact, and measured context/cost baseline are on disk
- public `/orchestrator-run` and `/orchestrator-status` surfaces are implemented as runtime-backed contract shims

Phase 5.5 correction: the historical review-lineage PASS was retracted because
the saved Phase 5 evidence used a deterministic in-repo review executor. The
task registry and local-subprocess hardening live in Phase 5.5.

---

## What We Deliberately Avoid

- Fully autonomous end-to-end paper generation
- General-purpose agent-platform scope before research flows are solid
- Host-adapter abstraction for non-existent second hosts
- Dashboard-led truth mutation
- Giant connector surface before inner flows work
- Domain packs before base workflow exists
- Kernel truth-semantic changes during outer project development

---

## Context Budget Gate

Every module consumes session context. Measure before each phase exits.

| Surface | Budget |
|---------|--------|
| CLAUDE.md + SKILL.md | ~600-800 tokens (kernel-owned, not our budget) |
| SessionStart injection | ~200-300 tokens (kernel-owned) |
| Per flow command | ~200-400 tokens (our budget) |
| CLI bridge responses | Variable (our budget) |

**Rule:** A baseline operator flow invocation should add no more than ~1500 incremental tokens beyond the kernel-owned base context. If it exceeds that, the module must be lazy-loaded or redesigned.

---

## Invariants

1. Phase order is non-negotiable: flows before memory, memory before writing, all before connectors
2. Each phase has explicit exit gates — no "close enough"
3. Context budget measured, not estimated, before phase exit
4. Kernel remains untouched by outer project development
5. Deferred modules (4+) are designed but NOT built until prerequisites are stable
