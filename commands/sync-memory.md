---
description: Refresh memory mirrors from allowed kernel projections and workspace state
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/memory/sync.js
  export: syncMemory
  scope: sync-memory
  wrappedByMiddleware: false
---

# /sync-memory

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/memory/sync.js`

## Purpose

Refresh the machine-owned memory mirrors without creating a second truth path.

The command may read:

- kernel projections through the CLI bridge
- `.vibe-science-environment/control/session.json`
- `.vibe-science-environment/control/decisions.jsonl`
- `.vibe-science-environment/experiments/manifests/*.json`
- optional `.vibe-science-environment/memory/index/marks.jsonl`

The command may write only:

- `.vibe-science-environment/memory/mirrors/project-overview.md`
- `.vibe-science-environment/memory/mirrors/decision-log.md`
- `.vibe-science-environment/memory/sync-state.json`

It must never write kernel truth or human note zones.

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If it exists, you MAY build a small CLI-backed reader adapter for:
  - `overview`
  - `claim-heads`
  - `unresolved-claims`
- If it is missing, or any CLI call exits non-zero, degrade honestly by using:

```js
{ dbAvailable: false, error: 'core-reader CLI unavailable' }
```

Do not reconstruct claim state, citation state, or gate state from markdown prose.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `syncMemory(...)` from `environment/memory/sync.js`.
4. Build only the read adapter needed by the sync helper.
5. Run through middleware with:
   - `commandName: '/sync-memory'`
   - `scope: 'sync-memory'`
6. Inside `commandFn`, call `syncMemory(projectPath, { reader })`.
7. Return the helper result without re-implementing sync logic in the shim.

Middleware owns attempt lifecycle, telemetry, capability refresh, and session snapshot publication.

## Rendering

Report:

- sync status: `ok`, `partial`, or `failed`
- sync timestamp
- kernel availability / degraded reason
- mirrors refreshed
- warnings

If marks are present:

- they may highlight or reorder items surfaced first
- they remain retrieval hints only
- they must not change claim truth, blocker truth, or evidence status

If degraded:

- say explicitly that memory was refreshed in workspace-first mode
- say explicitly that kernel-backed projections were skipped

## Rules

- Do not manually edit mirror files in the prompt.
- Do not write to `.vibe-science-environment/memory/notes/`.
- Do not invent facts when the kernel bridge is unavailable.
- Mirror files are full-overwrite machine projections, not collaborative note documents.
- The shim is an entrypoint only; `environment/memory/sync.js` remains the single implementation.
