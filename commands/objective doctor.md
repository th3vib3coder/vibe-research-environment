---
description: Diagnose objective scheduler and lifecycle readiness without mutation
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/windows-task-scheduler.js
  export: objectiveDoctorCommand
  scope: objective-doctor
  wrappedByMiddleware: false
---

# /objective doctor

## Purpose

Report whether objective lifecycle automation can run safely on this host.

## Invocation

```bash
node bin/vre objective doctor --objective <objective-id>
```

## Arguments

- `--objective <objective-id>` selects the objective to inspect.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- The command may read objective state, scheduler state, and wake readiness.
- It must not create, pause, resume, stop, or schedule an objective.

## Dependencies

- `bin/vre`
- `environment/orchestrator/windows-task-scheduler.js`
- `.vibe-science-environment/objectives/`

## Degraded Mode

If the scheduler or objective state is unavailable, report an explicit doctor
failure with paths and reasons rather than repairing state.

## Rules

- Keep this as a diagnostic surface.
- Do not treat a doctor PASS as authorization for unattended runtime.
- Do not create or delete Windows Task Scheduler tasks.
