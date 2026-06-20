---
description: Emit the reviewed VRE capability handshake as JSON
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/control/capability-handshake.js
  export: generateCapabilityHandshake
  scope: capability-handshake
  wrappedByMiddleware: false
---

# /capabilities --json

## Purpose

Produce the capability handshake that downstream agents use to discover the
current VRE surface without opening runtime work.

## Invocation

```bash
node bin/vre capabilities --json
```

## Arguments

- `--json` is required by this contract.
- No positional arguments are accepted.

## Side Effects

- Mutating: false
- The command may refresh the capability handshake artifact already owned by
  the control plane.
- It must not execute operator commands or mutate research state.

## Dependencies

- `bin/vre`
- `environment/control/capability-handshake.js`
- `environment/schemas/phase9-capability-handshake.schema.json`

## Degraded Mode

If the project root, kernel bridge, connector bundles, automation bundles, or
memory state are unavailable, the command reports explicit `degradedReasons`
instead of inventing availability.

## Rules

- Treat the emitted JSON as a status and discovery surface, not evidence.
- Do not use this command to certify claims, exports, citations, or gates.
- Preserve `runtimeOpened: false` semantics for any reviewed command record.
