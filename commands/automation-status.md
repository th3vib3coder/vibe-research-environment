---
description: Show automation readiness and latest visible artifacts through the shared status surface
allowed-tools: Read, Bash
model: sonnet
---

# /automation-status

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/automation/artifacts.js`

## Purpose

Expose the operator-facing automation summary without inventing a scheduler dashboard.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `getAutomationOverview(...)` from `environment/automation/artifacts.js`.
4. Run through middleware with:
   - `commandName: '/automation-status'`
   - `scope: 'automation-status'`
5. Inside `commandFn`, return `getAutomationOverview(projectPath)`.

## Rendering

Report:

- automation id / display name
- latest status
- last successful run
- blocked or degraded reason
- latest artifact path
- next due time if available

## Rules

- Do not treat automation status as a second control plane.
- Do not invent schedule state when no host-native schedule metadata exists.
