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

## Current Status

This repository is being bootstrapped from the finalized Phase 1 specification.

Active work:
- Wave 0 foundation
- dedicated repo split from the incubation monorepo
- strict Phase 1 execution only

## Spec Entry Points

- `blueprints/definitive-spec/00-INDEX.md`
- `blueprints/definitive-spec/IMPLEMENTATION-PLAN.md`

## Runtime Rule

All outer-project runtime state lives under:

`.vibe-science-environment/`

All code owned by this repository lives under:

- `environment/`
- `commands/`
- `blueprints/`
