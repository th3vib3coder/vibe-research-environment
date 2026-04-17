---
description: Show orchestrator queue, lane, escalation, and continuity status through the Phase 5 status surface
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/runtime.js
  export: runOrchestratorStatus
  scope: orchestrator-status
  wrappedByMiddleware: true
---

# /orchestrator-status

This command is the Phase 5 status-surface contract for the local coordinator.

## Purpose

Expose the first operator-facing orchestrator summary without inventing a
dashboard.

The Phase 5 local runtime exists under `environment/orchestrator/`, and this
surface is one of the three command contracts promoted to the minimal
`bin/vre` dispatcher in Phase 5.5.

## Future implementation stance

Phase 5 implements this surface as a thin status shim above:
- the existing `/flow-status` surface
- shared orchestrator state under `environment/orchestrator/`
- the orchestrator query helper once it exists
- `runOrchestratorStatus(...)` in `environment/orchestrator/runtime.js`

## Required status fields

When implemented, report at minimum:
- active objective
- queue depth by status
- active lane runs
- latest escalation or blocker
- latest recovery action
- current continuity mode if one is active
- next recommended operator action

## Rules

- Keep the surface observational and coordinative.
- Do not treat status as a second task system.
- Do not invent queue or continuity state when the orchestrator runtime is absent.
- Prefer filesystem-backed and chat-compatible output over dashboard-only assumptions.
