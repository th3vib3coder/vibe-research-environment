---
description: Show orchestrator queue, lane, escalation, and continuity status through the future Phase 5 status surface
allowed-tools: Read, Bash
model: sonnet
---

# /orchestrator-status

This command is the Phase 5 status-surface contract for the future local
coordinator.

## Purpose

Expose the first operator-facing orchestrator summary without inventing a
dashboard.

Until the Phase 5 runtime exists, this command must **not** simulate queue or
lane state. It should say clearly that the orchestrator runtime is not yet
implemented.

## Future implementation stance

Phase 5 should implement this command as a thin status shim above:
- the existing `/flow-status` surface
- shared orchestrator state under `environment/orchestrator/`
- the orchestrator query helper once it exists

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
