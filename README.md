# Vibe Research Environment

Vibe Research Environment (VRE) is the outer-project shell that sits around the
Vibe Science kernel.

It owns:
- flow orchestration
- control-plane state
- experiment packaging
- operator-facing surfaces
- testing and evaluation harnesses for the shell

It does **not** own kernel truth.

The kernel remains authoritative for:
- claim truth
- citation truth
- gate truth
- session integrity
- governance enforcement owned by Vibe Science

## Phase 1 Status

VRE Phase 1 is implemented in this repository and backed by saved evidence on
disk.

Current closeout status:
- `17/17` Phase 1 exit gates are `PASS`
- `0/17` are `PARTIAL`
- Phase 1 sign-off accepts the kernel's documented `default/strict` governance
  mode baseline as sufficient for the outer-project contract

Closeout dossier:
- [Phase 1 Closeout](blueprints/definitive-spec/implementation-plan/phase1-closeout.md)

## Spec Entry Points

- [Definitive Spec Index](blueprints/definitive-spec/00-INDEX.md)
- [Implementation Plan](blueprints/definitive-spec/IMPLEMENTATION-PLAN.md)
- [Phase 1 Closeout](blueprints/definitive-spec/implementation-plan/phase1-closeout.md)

## Quickstart

Requirements:
- Node `18+`
- sibling checkout of `vibe-science` during incubation, because some eval and
  compatibility artifacts read kernel-owned files from `../vibe-science`

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

Wave 5 evidence scripts:

```bash
npm run eval:save-phase1
npm run eval:save-operator-validation
npm run eval:measure-context-baseline
```

Saved Phase 1 evidence lives under:
- `.vibe-science-environment/operator-validation/benchmarks/`
- `.vibe-science-environment/operator-validation/artifacts/`

## Runtime Rule

All outer-project runtime state lives under:

`.vibe-science-environment/`

All code owned by this repository lives under:

- `environment/`
- `commands/`
- `blueprints/`

## Repo Contract

This repo owns:
- control-plane state and query surfaces
- flow-local state and experiment manifests
- middleware, validators, tests, and eval harnesses
- operator-facing command shims

This repo does **not** own:
- claim truth
- citation truth
- gate truth
- kernel lifecycle truth
- kernel governance decisions
