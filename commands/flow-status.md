---
description: Show VRE status through the control plane and canonical session snapshot
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/control/query.js
  export: getOperatorStatus
  scope: flow-status
  wrappedByMiddleware: false
---

# /flow-status

This command is a thin entrypoint over the VRE control plane.

## Required modules

- `environment/control/middleware.js`
- `environment/control/query.js`

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If it exists, you MAY build a small CLI-backed reader adapter for the projections you need.
- If it is missing, or any CLI call exits non-zero, degrade honestly by using:

```js
{ dbAvailable: false, error: 'core-reader CLI unavailable' }
```

Do not reconstruct unresolved claims or citation truth from markdown.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `getOperatorStatus(...)` from `environment/control/query.js`.
4. Run the command through middleware with `commandName: '/flow-status'`.
5. Inside `commandFn`, read the operator-facing surface through `getOperatorStatus(projectPath)`.
6. Treat `control/session.json` as the canonical resume surface.
7. Use `memory/sync-state.json` only for mirror freshness and stale warning messaging.

## Rendering

Report:

- active flow
- current stage
- next actions
- blockers
- kernel availability / degraded reason
- budget state
- unresolved claims
- blocked experiments
- export alerts
- memory freshness / last sync
- automation readiness / latest automation artifacts
- connector health / latest connector failures
- active domain pack / domain-specific preset surfaces
- writing snapshots, recent export alerts, and latest advisor/rebuttal pack directories
- recent packaged experiment bundles / latest digest pointers
- last command
- last attempt id

If marks exist, marked claims or experiments may be surfaced first as operator hints only.
They do not override blockers, claim state, or kernel truth.

If memory freshness says mirrors are stale, show exactly:

```text
STALE — run /sync-memory to refresh
```

If mirrors are stale, any resume text inside markdown mirrors is non-authoritative. The control-plane snapshot still wins for operator-facing resume.

Result bundle locations and session digest pointers are outer-project findability aids only.
They do not certify claims, citations, gate outcomes, or export eligibility.

Writing snapshots, export alerts, and advisor/rebuttal pack paths are also derived outer-project surfaces only.
They help the operator resume safely; they do not mutate truth or paper prose.

Connector health summaries and connector run paths are adapter-observability surfaces only.
They do not validate claims, verify citations, or certify export eligibility.

Automation summaries and automation artifact paths are review surfaces only.
They do not schedule hidden work, mutate truth, or replace the control plane.

Domain-pack activation is a preset surface only.
It may change suggested literature sources, experiment fields, or deliverable template names, but it does not change kernel truth, middleware, export policy, or gate semantics.

If the snapshot is missing, say so clearly and report that the control plane will rebuild it on the next successful run.

## Rules

- Do not manually edit `session.json`, `attempts.jsonl`, `events.jsonl`, or `decisions.jsonl`.
- Do not invent kernel facts when the bridge is unavailable.
- Do not treat stale memory mirrors as canonical resume state.
- `/flow-status` is operationally read-focused, but it still goes through middleware so the lifecycle remains queryable.
