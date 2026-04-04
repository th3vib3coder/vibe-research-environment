---
description: Generate the reviewable stale-memory reminder through shared middleware
allowed-tools: Read, Bash
model: sonnet
---

# /stale-memory-reminder

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/automation/runtime.js`

## Purpose

Run the built-in stale-memory reminder automation against the existing Phase 2 freshness semantics.

It creates or reuses a reviewable artifact under:

- `.vibe-science-environment/automation/artifacts/stale-memory-reminder/`

It does NOT refresh memory mirrors by itself. It only summarizes whether a reminder is needed.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `runStaleMemoryReminder(...)` from `environment/automation/runtime.js`.
4. Run through middleware with:
   - `commandName: '/stale-memory-reminder'`
   - `scope: 'stale-memory-reminder'`
5. Inside `commandFn`, call `runStaleMemoryReminder(projectPath, { triggerType: 'command' })`.

## Rules

- Do not fabricate freshness when `sync-state.json` is missing or invalid.
- Do not mutate memory mirrors.
- Do not bypass the shared automation runtime.
