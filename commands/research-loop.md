---
description: Run one governed attended research-loop iteration
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/autonomy-runtime.js
  export: runResearchLoopCommand
  scope: research-loop
  wrappedByMiddleware: false
---

# /research-loop

## Purpose

Run the orchestrated research-loop surface for an active objective under the
current autonomy and wake gates.

## Invocation

```bash
node bin/vre research-loop --objective <objective-id> --wake-id <wake-id> --json
```

## Arguments

- `--objective <objective-id>` selects the active objective.
- `--wake-id <wake-id>` identifies the wake lease or heartbeat probe.
- `--json` requests machine-readable output.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command may update objective, wake, lane, and execution-loop artifacts.
- It may call the analysis lane only through the reviewed runtime helper.

## Dependencies

- `bin/vre`
- `environment/orchestrator/autonomy-runtime.js`
- `environment/orchestrator/execution-lane.js`

## Degraded Mode

If autonomy, objective, wake, or lane gates are not satisfied, return a
structured failure and do not run hidden work.

## Rules

- Keep autonomy attended unless a later reviewed gate opens otherwise.
- Do not bypass wake leases or objective locks.
- Do not convert generated summaries into LAW 13 evidence.
