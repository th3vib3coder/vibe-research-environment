---
description: Execute a reviewed analysis manifest through the execution lane
allowed-tools: Read, Bash
model: sonnet
dispatch:
  module: environment/orchestrator/execution-lane.js
  export: runAnalysisCommand
  scope: run-analysis
  wrappedByMiddleware: false
---

# /run-analysis

## Purpose

Run a manifest-defined analysis through the execution lane rather than through
ad hoc shell steps.

## Invocation

```bash
node bin/vre run-analysis --manifest <manifest-path>
```

## Arguments

- `--manifest <manifest-path>` points to the reviewed analysis manifest.
- `--dry-run` validates without running the lane when supported.
- No positional arguments are accepted.

## Side Effects

- Mutating: true
- The command may write lane run records, outputs, and execution telemetry.
- Scientific outputs remain provisional until reviewed as evidence.

## Dependencies

- `bin/vre`
- `environment/orchestrator/execution-lane.js`
- The manifest schema and any declared local toolchain.

## Degraded Mode

If the manifest is missing, invalid, or outside the allowed root, fail closed
before launching execution.

## Rules

- Do not run analysis from chat-only parameters.
- Preserve manifest path, parameters, seeds, and outputs.
- Do not treat analysis completion as claim validation.
