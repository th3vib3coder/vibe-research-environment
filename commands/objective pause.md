---
description: Pause the active or selected objective with an operator reason
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/objectives/cli.js
  export: pauseObjectiveCommand
  scope: objective-pause
  wrappedByMiddleware: false
---

# /objective pause

## Purpose

Move an objective into a paused state while preserving resume evidence.

## Invocation

```bash
node bin/vre objective pause --objective <objective-id> --reason <reason>
```

## Arguments

- `--objective <objective-id>` selects the objective to pause.
- `--reason <reason>` records why the pause is intentional.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command writes objective lifecycle state and pause events.
- It may update the active objective snapshot.

## Dependencies

- `bin/vre`
- `environment/objectives/cli.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If the objective pointer or record is missing, fail closed with the structured
objective CLI error instead of creating replacement state.

## Rules

- Require an explicit reason for operator traceability.
- Do not pause a different objective than the selected active objective.
- Do not use pause as a claim, citation, or export gate.
