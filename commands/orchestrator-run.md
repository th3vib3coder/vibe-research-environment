---
description: Start or continue one orchestrator task through the future Phase 5 local coordinator
allowed-tools: Read, Bash
model: sonnet
---

# /orchestrator-run

This command is the Phase 5 run-surface contract for the future local
coordinator.

## Purpose

Create one explicit operator entry point for starting or continuing work
through the orchestrator queue.

Until the Phase 5 runtime exists, this command must **not** fabricate queue
records or lane activity. It should say clearly that the orchestrator runtime
is not yet implemented.

## Future implementation stance

Phase 5 should implement this command as a thin run shim above:
- shared orchestrator runtime under `environment/orchestrator/`
- the append-only queue model
- the execution and review lane contracts

## Minimum contract

When implemented, the command should:
- accept one operator objective
- classify it into a declared orchestrator mode
- create or update a visible queue task
- choose the initial lane path under lane policy
- surface any immediate escalation instead of silently proceeding

## Rules

- Do not bypass VRE helper surfaces.
- Do not create hidden background work with no queue trace.
- Do not persist continuity-profile changes unless they are explicit or explicitly confirmed.
- Keep the first implementation local, filesystem-backed, and chat-compatible.
