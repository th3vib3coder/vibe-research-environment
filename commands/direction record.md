---
description: Record a reviewed research direction in the W-RDM direction log
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/directions/cli.js
  export: recordDirectionCommand
  scope: direction-record
  wrappedByMiddleware: false
---

# /direction record

## Purpose

Record a tried research direction so later agents can avoid repeating a
discarded or contradicted path without review.

## Invocation

```bash
node bin/vre direction record --json --summary <summary> [--direction <id>] [--reason <reason>] [--evidence <ref>]
```

## Arguments

- `--json` is required.
- `--summary <summary>` names the research direction.
- `--direction <id>` optionally supplies a stable direction id.
- `--reason <reason>` explains why the direction is being recorded.
- `--evidence <ref>` optionally attaches one evidence reference.

## Side Effects

- Mutating: true
- Appends one direction event under VRE state through the reviewed direction
  store.
- Does not create biomedical claims, exports, provider calls, or Graphify
  artifacts.

## Dependencies

- `bin/vre`
- `environment/directions/cli.js`
- `environment/directions/store.js`

## Degraded Mode

If the direction store rejects the record, return structured JSON with the
store-origin error and do not append a partial event.

## Rules

- Require `--json`.
- Delegate to `recordDirectionCommand`.
- Do not duplicate store validation in `bin/vre`.
- Keep real-data, provider, export, and Graphify surfaces closed.
