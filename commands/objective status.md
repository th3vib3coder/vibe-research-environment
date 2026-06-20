---
description: Read objective state, events, blocker, digest, and resume metadata
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/objectives/cli.js
  export: statusObjectiveCommand
  scope: objective-status
  wrappedByMiddleware: false
---

# /objective status

## Purpose

Expose the canonical objective state without mutating lifecycle data.

## Invocation

```bash
node bin/vre objective status --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective to inspect.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- The command reads objective records, events, blockers, handoffs, and digests.
- It must not repair or advance objective state.

## Dependencies

- `bin/vre`
- `environment/objectives/cli.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If the objective record is missing or invalid, return the structured error and
do not synthesize status from loose files.

## Rules

- Treat the objective record as authoritative.
- Report stale or missing resume snapshots honestly.
- Do not present status output as research evidence.
