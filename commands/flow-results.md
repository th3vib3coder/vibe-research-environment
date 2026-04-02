---
description: Package a completed experiment into a typed results bundle through shared middleware
argument-hint: "--package <EXP-id>"
allowed-tools: Read, Bash
model: sonnet
---

# /flow-results

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/flows/results.js`

## Purpose

Package one completed experiment into the Phase 2 evidence bundle surface.

The command creates inspectable outer-project artifacts under:

- `.vibe-science-environment/results/experiments/EXP-NNN/analysis-report.md`
- `.vibe-science-environment/results/experiments/EXP-NNN/stats-appendix.md`
- `.vibe-science-environment/results/experiments/EXP-NNN/figure-catalog.md`
- `.vibe-science-environment/results/experiments/EXP-NNN/bundle-manifest.json`
- typed copied artifacts inside the same bundle directory

It may also update:

- `.vibe-science-environment/flows/index.json`

It does NOT create claim-backed writing exports, decide export eligibility, or write kernel truth.

## Subcommands

- `--package <EXP-id>`: package one completed experiment manifest

If the operator does not provide a valid experiment id, refuse honestly instead of guessing.

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If available, you MAY use it only to report kernel availability through middleware.
- If unavailable, degrade honestly and continue in workspace-only packaging mode.

Use the standard degraded reader shape when the bridge is absent or fails:

```js
{ dbAvailable: false, error: 'core-reader CLI unavailable' }
```

Do not reconstruct claim truth, citation verification, gate outcomes, or export eligibility from markdown or local heuristics.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `packageExperimentResults(...)` from `environment/flows/results.js`.
4. Build only the small reader/degraded-reader surface needed for middleware capability publication.
5. Run through middleware with:
   - `commandName: '/flow-results'`
   - `scope: 'flow-results'`
6. Inside `commandFn`, call `packageExperimentResults(projectPath, experimentId, options)`.
7. Return the helper result without re-implementing packaging logic in the shim.

Middleware owns attempt lifecycle, telemetry, capability refresh, and session snapshot publication.

## Input rules

Packaging is explicit and fails closed when required metadata is missing.

Require:

- a completed manifest for the requested experiment id
- typed `artifactMetadata` for every declared `outputArtifacts` path

Optional structured inputs may include:

- `sourceAttemptId`
- `datasetHash`
- `analysisQuestion`
- `findings`
- `caveats`
- `statistics`
- `comparisonQuestion`
- `environment`

Do not invent missing artifact types, roles, captions, or interpretations.

## Rendering

Report:

- packaged experiment id
- bundle directory
- bundle manifest path
- source attempt id
- copied artifact list with type/role
- warnings
- next actions written to the flow index

If degraded:

- say explicitly that packaging completed in workspace-only mode
- say explicitly that kernel-backed projections were not required for this Phase 2 bundle

## Rules

- Do not manually edit bundle files in the prompt.
- Do not write outside `.vibe-science-environment/results/experiments/EXP-NNN/` except for the flow index update owned by the helper.
- Do not treat packaged reports as kernel truth or manuscript-ready claim-backed writing.
- The shim is an entrypoint only; `environment/flows/results.js` remains the single packaging implementation.
