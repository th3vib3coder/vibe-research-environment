---
description: Check whether a candidate repeats a killed or contradicted W-RDM direction
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: checkDirectionCommand
  scope: direction-check
  wrappedByMiddleware: false
---

# /direction check

## Purpose

Check whether a candidate direction repeats a killed or contradicted direction
before it re-enters the research workflow.

## Invocation

```bash
node bin/vre direction check --json [--direction <id>] [--summary <summary>] [--satisfies-kind <kind> --satisfies-detail <detail>]
```

## Arguments

- `--json` is required.
- `--direction <id>` checks an exact direction id.
- `--summary <summary>` checks an exact normalized summary.
- `--satisfies-kind <kind>` and `--satisfies-detail <detail>` optionally name
  the blocking condition the candidate claims to satisfy.

## Side Effects

- Mutating: false
- Reads the direction projection only.
- Does not append events, revive directions, certify science, or open the L0
  selector consumer.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/check.js`
- `environment/directions/store.js`

## Degraded Mode

If no candidate id or summary is supplied, return structured JSON and leave the
event log unchanged.

## Rules

- Require `--json`.
- Delegate to `checkDirectionCommand`.
- Treat `allow-with-condition` as advisory only.
- Keep T19.7 L0 selector consumer, provider, real-data, export, and Graphify
  surfaces closed.
