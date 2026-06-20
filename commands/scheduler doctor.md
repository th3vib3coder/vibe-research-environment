---
description: Diagnose Windows Task Scheduler support for objective wakes
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/windows-task-scheduler.js
  export: schedulerDoctorCommand
  scope: scheduler-doctor
  wrappedByMiddleware: false
---

# /scheduler doctor

## Purpose

Report whether the host can safely use Windows Task Scheduler wake surfaces.

## Invocation

```bash
node bin/vre scheduler doctor --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective whose schedule is checked.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- The command reads scheduler and objective readiness.
- It must not install, remove, or modify scheduler tasks.

## Dependencies

- `bin/vre`
- `environment/orchestrator/windows-task-scheduler.js`
- Windows Task Scheduler on supported hosts.

## Degraded Mode

On unsupported hosts or inaccessible scheduler APIs, report a structured doctor
failure and leave scheduler state unchanged.

## Rules

- Keep platform limitations explicit.
- Do not infer operator approval from a doctor PASS.
- Do not open unattended autonomy.
