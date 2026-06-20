---
description: Resume a paused or blocked objective through the lifecycle guard
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/objectives/cli.js
  export: resumeObjectiveCommand
  scope: objective-resume
  wrappedByMiddleware: false
---

# /objective resume

## Purpose

Resume an objective only when the objective record and active pointer agree.

## Invocation

```bash
node bin/vre objective resume --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective to resume.
- `--repair-snapshot` may rebuild a stale resume snapshot when the command
  explicitly allows that repair.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command may append resume, blocker-resolution, and state-repair events.
- It may regenerate the objective resume snapshot.

## Dependencies

- `bin/vre`
- `environment/objectives/cli.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If the active pointer, objective record, or snapshot cannot be reconciled, fail
closed with a structured objective error.

## Rules

- Resume only paused or blocked objectives.
- Preserve state-repair evidence when `--repair-snapshot` is used.
- Do not resume unattended autonomy without the separate autonomy gate.
