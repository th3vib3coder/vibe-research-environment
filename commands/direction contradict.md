---
description: Mark a W-RDM direction contradicted by reviewed evidence
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: contradictDirectionCommand
  scope: direction-contradict
  wrappedByMiddleware: false
---

# /direction contradict

## Purpose

Mark a direction as contradicted by reviewed evidence and record the condition
required before reconsideration.

## Invocation

```bash
node bin/vre direction contradict --json --direction <id> --reason <reason> --evidence <ref> --condition-kind <kind> --condition-detail <detail>
```

## Arguments

- `--json` is required.
- `--direction <id>` selects the direction.
- `--reason <reason>` explains the contradiction.
- `--evidence <ref>` cites the reviewed contradiction evidence.
- `--condition-kind <kind>` and `--condition-detail <detail>` define the
  reviewed do-not-repeat-unless condition.

## Side Effects

- Mutating: true
- Appends a contradicted direction event through the reviewed direction store.
- Does not delete prior evidence or promote replacement claims.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If evidence, direction id, reason, or the condition is missing, return
structured JSON and leave the event log unchanged.

## Rules

- Require `--json`.
- Delegate to `contradictDirectionCommand`.
- Preserve contradiction evidence refs.
- Keep provider, real-data, export, and Graphify surfaces closed.
