---
description: Remove a reviewed Windows Task Scheduler wake for an objective
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/windows-task-scheduler.js
  export: schedulerRemoveCommand
  scope: scheduler-remove
  wrappedByMiddleware: false
---

# /scheduler remove

## Purpose

Remove an objective wake task without changing the objective record itself.

## Invocation

```bash
node bin/vre scheduler remove --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective schedule to remove.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command may delete a Windows Task Scheduler task.
- It may update scheduler metadata for the selected objective.

## Dependencies

- `bin/vre`
- `environment/orchestrator/windows-task-scheduler.js`
- Windows Task Scheduler on supported hosts.

## Degraded Mode

If the scheduler is unavailable or the task cannot be identified safely, report
a structured failure and do not remove unrelated tasks.

## Rules

- Remove only the task bound to the selected objective.
- Do not mutate objective lifecycle status.
- Do not mask scheduler removal failures.
