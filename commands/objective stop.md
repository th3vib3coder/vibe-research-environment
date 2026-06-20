---
description: Complete or stop an objective with an operator reason
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/objectives/cli.js
  export: stopObjectiveCommand
  scope: objective-stop
  wrappedByMiddleware: false
---

# /objective stop

## Purpose

Move an objective into its terminal stopped or completed lifecycle state.

## Invocation

```bash
node bin/vre objective stop --objective <objective-id> --reason <reason>
```

## Arguments

- `--objective <objective-id>` selects the objective to stop.
- `--reason <reason>` records the operator rationale.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command writes objective lifecycle state and terminal events.
- It may clear or update active objective state.

## Dependencies

- `bin/vre`
- `environment/objectives/cli.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If the objective cannot be identified or validated, fail closed without marking
anything terminal.

## Rules

- Require an explicit reason.
- Do not stop a mismatched active objective.
- Do not treat objective closure as scientific claim acceptance.
