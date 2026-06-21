---
description: Kill a W-RDM direction with a do-not-repeat condition
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: killDirectionCommand
  scope: direction-kill
  wrappedByMiddleware: false
---

# /direction kill

## Purpose

Mark a tried direction as killed and record the condition required before the
team may repeat it.

## Invocation

```bash
node bin/vre direction kill --json --direction <id> --reason <reason> --condition-kind <kind> --condition-detail <detail>
```

## Arguments

- `--json` is required.
- `--direction <id>` selects the direction.
- `--reason <reason>` explains why it is killed.
- `--condition-kind <kind>` and `--condition-detail <detail>` define the
  reviewed do-not-repeat-unless condition.

## Side Effects

- Mutating: true
- Appends a killed direction event through the reviewed direction store.
- Does not delete evidence, claims, or prior events.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If the transition is invalid or the condition is missing, return structured
JSON and leave the event log unchanged.

## Rules

- Require `--json`.
- Delegate to `killDirectionCommand`.
- Preserve the do-not-repeat condition exactly.
- Do not implement lifecycle transition logic in `bin/vre`.
