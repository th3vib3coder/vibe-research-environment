---
description: Generate the reviewable export-warning digest through shared middleware
allowed-tools: Read, Bash
model: sonnet
---

# /export-warning-digest

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/automation/runtime.js`

## Purpose

Run the built-in export-warning digest automation over the Phase 3 alert surface.

It creates or reuses a reviewable artifact under:

- `.vibe-science-environment/automation/artifacts/export-warning-digest/`

It summarizes alerts only. It does NOT clear, rewrite, or downgrade Phase 3 export alerts.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `runExportWarningDigest(...)` from `environment/automation/runtime.js`.
4. Run through middleware with:
   - `commandName: '/export-warning-digest'`
   - `scope: 'export-warning-digest'`
5. Inside `commandFn`, call `runExportWarningDigest(projectPath, { triggerType: 'command' })`.

## Rules

- Do not reimplement alert replay logic.
- Do not mutate export alerts or snapshots.
- Do not bypass the shared automation runtime.
