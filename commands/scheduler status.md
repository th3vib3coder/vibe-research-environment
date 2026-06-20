---
description: Read Windows Task Scheduler wake status for an objective
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/windows-task-scheduler.js
  export: schedulerStatusCommand
  scope: scheduler-status
  wrappedByMiddleware: false
---

# /scheduler status

## Purpose

Show the scheduler wake status for an objective without changing scheduler
state.

## Invocation

```bash
node bin/vre scheduler status --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective schedule to inspect.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- The command reads scheduler task state and VRE scheduler metadata.
- It must not install, remove, or repair tasks.

## Dependencies

- `bin/vre`
- `environment/orchestrator/windows-task-scheduler.js`
- Windows Task Scheduler on supported hosts.

## Degraded Mode

If scheduler state is unavailable, return the structured unavailable status and
leave state unchanged.

## Rules

- Distinguish missing tasks from inaccessible scheduler APIs.
- Do not infer objective lifecycle status from scheduler status alone.
- Do not open unattended work.
