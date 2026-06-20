---
description: Install a reviewed Windows Task Scheduler wake for an objective
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/windows-task-scheduler.js
  export: schedulerInstallCommand
  scope: scheduler-install
  wrappedByMiddleware: false
---

# /scheduler install

## Purpose

Install the objective wake task that lets the orchestrator resume under the
reviewed scheduler contract.

## Invocation

```bash
node bin/vre scheduler install --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective to schedule.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command may create or replace a Windows Task Scheduler task for the
  selected objective.
- It may write scheduler metadata under VRE state.

## Dependencies

- `bin/vre`
- `environment/orchestrator/windows-task-scheduler.js`
- Windows Task Scheduler on supported hosts.

## Degraded Mode

If the host is unsupported, the objective is invalid, or scheduler calls fail,
return a structured failure and do not claim installation.

## Rules

- Install only for the selected objective.
- Preserve scheduler task identity in returned metadata.
- Do not use installation as permission for unattended research.
