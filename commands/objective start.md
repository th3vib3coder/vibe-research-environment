---
description: Start a governed objective with explicit wake and budget policy
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/objectives/cli.js
  export: startObjectiveCommand
  scope: objective-start
  wrappedByMiddleware: false
---

# /objective start

## Purpose

Create and activate an objective record with explicit operator intent.

## Invocation

```bash
node bin/vre objective start --title <title> --question <question> --mode <mode> --wake-policy <policy>
```

## Arguments

- `--title <title>` names the objective.
- `--question <question>` records the research or engineering question.
- `--mode <mode>` selects the runtime mode.
- `--wake-policy <policy>` is required outside interactive modes.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command writes a new objective record and activates the pointer.
- It records governance events for the objective lifecycle.

## Dependencies

- `bin/vre`
- `environment/objectives/cli.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If required policy, budget, or identity fields are missing, fail closed before
creating objective state.

## Rules

- Do not infer a wake policy from chat text.
- Do not start unattended work without the matching runtime gate.
- Keep objective metadata distinct from scientific evidence.
