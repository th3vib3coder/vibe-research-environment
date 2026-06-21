---
description: Park a W-RDM direction for later review
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: parkDirectionCommand
  scope: direction-park
  wrappedByMiddleware: false
---

# /direction park

## Purpose

Temporarily park a direction without killing or contradicting it.

## Invocation

```bash
node bin/vre direction park --json --direction <id> --reason <reason>
```

## Arguments

- `--json` is required.
- `--direction <id>` selects the direction.
- `--reason <reason>` explains why it is parked.

## Side Effects

- Mutating: true
- Appends a parked direction event through the reviewed direction store.
- Does not certify, export, or promote any scientific claim.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If the direction is absent or the transition is invalid, return structured JSON
and leave the event log unchanged.

## Rules

- Require `--json`.
- Delegate to `parkDirectionCommand`.
- Do not add a do-not-repeat condition for parked directions.
- Keep provider, real-data, export, and Graphify surfaces closed.
