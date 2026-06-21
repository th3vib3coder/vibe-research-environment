---
description: Revive a parked or condition-satisfied W-RDM direction
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: reviveDirectionCommand
  scope: direction-revive
  wrappedByMiddleware: false
---

# /direction revive

## Purpose

Revive a direction only through the reviewed lifecycle guard.

## Invocation

```bash
node bin/vre direction revive --json --direction <id> --reason <reason>
```

## Arguments

- `--json` is required.
- `--direction <id>` selects the direction.
- `--reason <reason>` explains why the direction may re-enter.

## Side Effects

- Mutating: true
- Appends a revived direction event when the reviewed store transition allows
  it.
- Does not bypass killed-direction do-not-repeat conditions.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If the previous killed or contradicted record's condition is not named, return
structured JSON with the store-origin failure and leave the event log unchanged.

## Rules

- Require `--json`.
- Delegate to `reviveDirectionCommand`.
- Do not bypass `E_DIRECTION_REVIVE_CONDITION_UNSATISFIED`.
- Do not implement transition logic in `bin/vre`.
