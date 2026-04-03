# Vibe Research Environment

Vibe Research Environment (VRE) is the outer-project shell around the
Vibe Science kernel.

It owns the operator-facing side of the system:
- flow orchestration
- control-plane state
- memory and result packaging surfaces
- export-safe writing handoff
- tests, validators, and evaluation harnesses for the shell

It does **not** own kernel truth.

The kernel remains authoritative for:
- claim truth
- citation truth
- gate truth
- session integrity
- governance enforcement owned by Vibe Science

## Current Status

The repository is currently closed through **Phase 3**.

- **Phase 1:** control plane, literature flow, experiment flow, baseline evals
  and compatibility checks
- **Phase 2:** memory mirrors, stale surfacing, marks, typed result packaging,
  and session digests
- **Phase 3:** export-safe writing handoff, frozen export snapshots,
  append-only export alerts, `/flow-writing`, advisor packs, and rebuttal packs

Closeout dossiers:
- [Phase 1 Closeout](blueprints/definitive-spec/implementation-plan/phase1-closeout.md)
- [Phase 2 Closeout](blueprints/definitive-spec/implementation-plan/phase2-closeout.md)
- [Phase 3 Closeout](blueprints/definitive-spec/implementation-plan/phase3-closeout.md)

## What You Can Run

Operator-facing command surfaces currently in repo:
- [`/flow-status`](commands/flow-status.md)
- [`/flow-literature`](commands/flow-literature.md)
- [`/flow-experiment`](commands/flow-experiment.md)
- [`/sync-memory`](commands/sync-memory.md)
- [`/flow-results`](commands/flow-results.md)
- [`/flow-writing`](commands/flow-writing.md)

## Repository Layout

- [`environment/`](environment/) runtime code, schemas, templates, evals, and
  tests
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

## Spec Entry Points

- [Definitive Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Architecture Overview](blueprints/definitive-spec/03-architecture-overview.md)
- [Control Plane And Query Surface](blueprints/definitive-spec/03A-control-plane-and-query-surface.md)
- [Writing And Export](blueprints/definitive-spec/07-writing-and-export.md)
- [Install And Lifecycle](blueprints/definitive-spec/09-install-and-lifecycle.md)
- [Testing Strategy](blueprints/definitive-spec/14-testing-strategy.md)

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
