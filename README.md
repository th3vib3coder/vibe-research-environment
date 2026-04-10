# Vibe Research Environment

Vibe Research Environment (VRE) is the outer-project shell around the
Vibe Science kernel.

In plain terms, this repo is the part of the system that turns kernel truth
into a usable research workspace:
- it coordinates operator-facing research work
- it keeps operational state on disk
- it packages memory, results, writing, and orchestration surfaces
- it tests and validates the shell so work stays inspectable and reproducible

It does **not** own kernel truth.

The kernel remains authoritative for:
- claim truth
- citation truth
- gate truth
- session integrity
- governance enforcement owned by Vibe Science

## What Is Actually Inside This Software

The repo is closed through **Phase 5**, and that means it now contains five
real runtime layers rather than just plans:

- **Phase 1:** control plane, session state, attempt/decision/event ledgers,
  literature flow, experiment flow, and shell baseline evals
- **Phase 2:** memory mirrors, freshness surfacing, marks sidecar, results
  packaging, figure/result discovery, and session digests
- **Phase 3:** export-safe writing handoff, frozen export snapshots, advisor
  packs, rebuttal packs, and post-export warning replay
- **Phase 4:** connector substrate, automation substrate, domain-pack runtime,
  `omics` pack, and hardening around those surfaces
- **Phase 5:** local orchestrator MVP with queue, continuity runtime, router,
  provider gateway, execution lane, review lane, run/status runtime surfaces,
  and saved evidence

## Current Status

The repository is closed through **Phase 5**.

- **Phase 1:** control plane, literature flow, experiment flow, baseline evals
  and compatibility checks
- **Phase 2:** memory mirrors, stale surfacing, marks, typed result packaging,
  and session digests
- **Phase 3:** export-safe writing handoff, frozen export snapshots,
  append-only export alerts, `/flow-writing`, advisor packs, and rebuttal packs
- **Phase 4:** connector substrate, automation substrate, domain-pack runtime,
  `omics` presets, hardening, validators, and closeout evidence
- **Phase 5:** local surface orchestrator MVP, continuity runtime, queue and
  ledger state, public run/status surfaces, saved coordinator evals,
  operator-validation evidence, measured context/cost baseline, and closeout
  dossier

Closeout dossiers:
- [Phase 1 Closeout](blueprints/definitive-spec/implementation-plan/phase1-closeout.md)
- [Phase 2 Closeout](blueprints/definitive-spec/implementation-plan/phase2-closeout.md)
- [Phase 3 Closeout](blueprints/definitive-spec/implementation-plan/phase3-closeout.md)
- [Phase 4 Closeout](blueprints/definitive-spec/implementation-plan/phase4-closeout.md)
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)

Current design frontier:
- [Surface Orchestrator Layer](blueprints/definitive-spec/surface-orchestrator/00-index.md)
  — the post-MVP expansion track above the shipped local coordinator baseline

## How The System Is Layered

The stack is intentionally strict:

1. **`vibe-science` kernel**
   Owns claim truth, citation truth, gates, governance, and session integrity.
2. **VRE shell**
   Owns flow orchestration, memory mirrors, results packaging, writing handoff,
   connectors, automation, domain packs, evals, and validators.
3. **Phase 5 orchestrator MVP**
   Owns routing, queueing, continuity assembly, execution/review supervision,
   escalation, and recovery as operational state.
4. **Future channels/UI**
   Not shipped yet. No dashboard or hosted supervision layer is part of the
   current MVP.

This boundary matters because VRE is allowed to coordinate and package work,
but it is not allowed to become a second truth system.

## How One Request Actually Flows

The easiest way to understand the repo is to follow one request end to end:

1. An operator objective enters through a flow surface or the orchestrator
   runtime in [`environment/orchestrator/runtime.js`](environment/orchestrator/runtime.js).
2. VRE middleware opens an attempt, captures telemetry, and keeps shell state
   honest.
3. The orchestrator router in
   [`environment/orchestrator/router.js`](environment/orchestrator/router.js)
   classifies the request into a mode and writes a visible queue task.
4. The selected lane runs under lane policy:
   - execution lane in
     [`environment/orchestrator/execution-lane.js`](environment/orchestrator/execution-lane.js)
   - review lane in
     [`environment/orchestrator/review-lane.js`](environment/orchestrator/review-lane.js)
5. Every important effect is written to disk:
   queue status, lane runs, escalations, recovery records, and external-review
   records.
6. Status is composed back into an operator-facing summary through
   [`environment/orchestrator/query.js`](environment/orchestrator/query.js)
   plus the main VRE control-plane query helpers.
7. The eval harness saves repeatable evidence so the repo can prove the shell
   behaves the way the spec claims.

The orchestrator does **not** run hidden background work. If it routes,
blocks, retries, escalates, or reviews something, that state is meant to be
visible on disk.

## What Phase 5 Really Ships

The Phase 5 MVP is not a vague “agent framework”. It is a specific local
coordinator with these runtime parts:

- queue and replay logic in [`environment/orchestrator/queue.js`](environment/orchestrator/queue.js)
- durable ledgers in [`environment/orchestrator/ledgers.js`](environment/orchestrator/ledgers.js)
- continuity profile and audit trail in
  [`environment/orchestrator/continuity-profile.js`](environment/orchestrator/continuity-profile.js)
- bounded context assembly in
  [`environment/orchestrator/context-assembly.js`](environment/orchestrator/context-assembly.js)
- helper-backed recall in [`environment/orchestrator/recall-adapters.js`](environment/orchestrator/recall-adapters.js)
- lane binding enforcement in
  [`environment/orchestrator/provider-gateway.js`](environment/orchestrator/provider-gateway.js)
- public run/status runtime surfaces in
  [`environment/orchestrator/runtime.js`](environment/orchestrator/runtime.js)

The saved Phase 5 evidence proves five concrete things:
- queued orchestrator work is resumable from disk
- continuity assembly works in `profile`, `query`, and `full`
- execution can flow into execution-backed review
- failures become explicit recovery plus escalation state
- continuity/context cost is measured rather than guessed

## What This Repo Does Not Claim

There are a few things the software deliberately does **not** pretend to be:

- not a kernel replacement
- not a dashboard-first product
- not a hidden autonomous worker farm
- not a cloud-managed agent runtime
- not an ambient memory-capture system
- not a general multi-lane agent platform yet

Phase 5 still does **not** ship runnable reporting, monitoring, supervise, or
recover lanes. Those are post-MVP expansion work, not hidden features.

## What You Can Run

Operator-facing command surfaces currently in repo:
- [`/flow-status`](commands/flow-status.md)
- [`/flow-literature`](commands/flow-literature.md)
- [`/flow-experiment`](commands/flow-experiment.md)
- [`/sync-memory`](commands/sync-memory.md)
- [`/flow-results`](commands/flow-results.md)
- [`/flow-writing`](commands/flow-writing.md)
- [`/weekly-digest`](commands/weekly-digest.md)
- [`/stale-memory-reminder`](commands/stale-memory-reminder.md)
- [`/export-warning-digest`](commands/export-warning-digest.md)
- [`/automation-status`](commands/automation-status.md)

Phase 5 orchestrator entry surfaces now have backing runtime helpers, but are
still **not** standalone end-user commands yet:
- [`/orchestrator-run`](commands/orchestrator-run.md)
- [`/orchestrator-status`](commands/orchestrator-status.md)

That means the logic exists and is tested, but this repo still does not ship a
generic command dispatcher that exposes those two surfaces as normal shell
commands for an end user.

## Repository Layout

- [`environment/control/`](environment/control/) control-plane substrate,
  attempts, decisions, events, capabilities, middleware, and operator snapshot
- [`environment/flows/`](environment/flows/) literature, experiment, results,
  writing, packs, digests, and discovery helpers
- [`environment/memory/`](environment/memory/) mirrors, freshness state, and
  marks sidecar
- [`environment/connectors/`](environment/connectors/) connector substrate and
  filesystem/obsidian exports
- [`environment/automation/`](environment/automation/) automation registry,
  artifacts, runtime, and built-in plans
- [`environment/domain-packs/`](environment/domain-packs/) domain-pack loader,
  resolver, registry, and built-in `omics` pack
- [`environment/orchestrator/`](environment/orchestrator/) Phase 5 local
  coordinator runtime: paths, IO, state, queue, ledgers, continuity profile,
  recall, context assembly, router, recovery, provider gateway, lanes, query,
  and runtime surfaces
- [`commands/`](commands/) operator-facing command shims
- [`blueprints/`](blueprints/) definitive spec, implementation plan, and
  closeout dossiers
- [`.vibe-science-environment/`](.vibe-science-environment/) machine-owned
  runtime state plus saved operator-validation evidence

## Quickstart

Requirements:
- Node `18+`
- sibling checkout of `vibe-science` during incubation, because some eval and
  compatibility paths read kernel-owned files from `../vibe-science`

Install:

```bash
npm install
```

Main repo checks:

```bash
npm run validate
npm test
npm run check
```

Currently available evidence scripts:

```bash
npm run eval:save-phase1
npm run eval:save-operator-validation
npm run eval:measure-context-baseline
node environment/evals/save-phase5-artifacts.js
node environment/evals/save-phase5-operator-validation-artifact.js
node environment/evals/measure-phase5-context-and-cost.js
```

## Evidence And Evaluation

Benchmark definitions live under:
- [`environment/evals/benchmarks/`](environment/evals/benchmarks/)

Scenario tasks live under:
- [`environment/evals/tasks/`](environment/evals/tasks/)

Saved operator-validation artifacts live under:
- [`.vibe-science-environment/operator-validation/artifacts/`](.vibe-science-environment/operator-validation/artifacts/)

Saved benchmark repeats live under:
- [`.vibe-science-environment/operator-validation/benchmarks/`](.vibe-science-environment/operator-validation/benchmarks/)

The current benchmark set covers:
- Phase 1 shell baseline
- Phase 2 memory and result packaging
- Phase 3 writing and export-safe deliverables
- Phase 4 connectors, automation, and domain-pack evidence
- Phase 5 orchestrator MVP evidence

If you want the shortest proof that the repo is not hand-wavy, start from:
- [Phase 5 Closeout](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)
- [`environment/tests/evals/saved-artifacts.test.js`](environment/tests/evals/saved-artifacts.test.js)
- [`.vibe-science-environment/operator-validation/`](.vibe-science-environment/operator-validation/)

Phase 5 implementation is closed through the atomic wave plan and closeout under:
- [`blueprints/definitive-spec/implementation-plan/phase5-00-index.md`](blueprints/definitive-spec/implementation-plan/phase5-00-index.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-01-wave-0-contract-artifacts.md`](blueprints/definitive-spec/implementation-plan/phase5-01-wave-0-contract-artifacts.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md`](blueprints/definitive-spec/implementation-plan/phase5-02-wave-1-state-and-queue-foundation.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md`](blueprints/definitive-spec/implementation-plan/phase5-03-wave-2-continuity-and-context-assembly.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md`](blueprints/definitive-spec/implementation-plan/phase5-04-wave-3-local-coordinator-mvp.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-05-wave-4-tests-and-validators.md`](blueprints/definitive-spec/implementation-plan/phase5-05-wave-4-tests-and-validators.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-06-wave-5-evals-and-closeout.md`](blueprints/definitive-spec/implementation-plan/phase5-06-wave-5-evals-and-closeout.md)
- [`blueprints/definitive-spec/implementation-plan/phase5-closeout.md`](blueprints/definitive-spec/implementation-plan/phase5-closeout.md)

## Spec Entry Points

- [Definitive Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Architecture Overview](blueprints/definitive-spec/03-architecture-overview.md)
- [Control Plane And Query Surface](blueprints/definitive-spec/03A-control-plane-and-query-surface.md)
- [Writing And Export](blueprints/definitive-spec/07-writing-and-export.md)
- [Install And Lifecycle](blueprints/definitive-spec/09-install-and-lifecycle.md)
- [Testing Strategy](blueprints/definitive-spec/14-testing-strategy.md)
- [Surface Orchestrator Layer](blueprints/definitive-spec/surface-orchestrator/00-index.md)

## Runtime Boundary

All outer-project runtime state lives under:

[`.vibe-science-environment/`](.vibe-science-environment/)

All code owned by this repository lives under:
- [`environment/`](environment/)
- [`commands/`](commands/)
- [`blueprints/`](blueprints/)

This repo does **not** turn shell-owned artifacts into a second truth path.
Mirrors, digests, packs, snapshots, and alerts stay operational and
observational unless the kernel says otherwise.
