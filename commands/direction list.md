---
description: List replay-derived W-RDM direction records
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: listDirectionsCommand
  scope: direction-list
  wrappedByMiddleware: false
---

# /direction list

## Purpose

List the current replay-derived W-RDM direction projection for operator and
agent review.

## Invocation

```bash
node bin/vre direction list --json
```

## Arguments

- `--json` is required.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- Reads the direction projection only.
- Does not append direction events or open runtime consumers.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If the direction log cannot be read, return structured JSON with the
store-origin error.

## Rules

- Require `--json`.
- Delegate to `listDirectionsCommand`.
- Do not infer scientific conclusions from listed directions.
- Keep provider, real-data, claim, export, and Graphify surfaces closed.
