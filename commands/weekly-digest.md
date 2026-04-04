---
description: Generate the reviewable weekly research digest through shared middleware
allowed-tools: Read, Bash
model: sonnet
---

# /weekly-digest

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/automation/runtime.js`

## Purpose

Run the built-in weekly digest automation without inventing a second scheduler.

It creates a reviewable artifact under:

- `.vibe-science-environment/automation/artifacts/weekly-research-digest/`

It does NOT mutate claim truth, citation truth, export alerts, or control-plane history.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `runWeeklyResearchDigest(...)` from `environment/automation/runtime.js`.
4. Run through middleware with:
   - `commandName: '/weekly-digest'`
   - `scope: 'weekly-digest'`
5. Inside `commandFn`, call `runWeeklyResearchDigest(projectPath, { triggerType: 'command' })`.

## Rendering

Report:

- automation id
- run id
- status
- artifact path
- blocked or degraded reason if present
- warnings

## Rules

- Do not bypass the shared automation runtime.
- Do not overwrite prior weekly digest artifacts silently.
- Do not treat the digest as canonical truth.
