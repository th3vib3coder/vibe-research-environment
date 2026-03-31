---
description: Experiment flow backed by manifests, experiment summary state, and shared middleware
argument-hint: "--register | --update <EXP-id> | --blockers"
allowed-tools: Read, Bash
model: sonnet
---

# /flow-experiment

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/flows/experiment.js`

## Subcommands

- no args: list experiments
- `--register`: create a new experiment manifest
- `--update <EXP-id>`: update manifest-backed experiment status or metadata
- `--blockers`: surface blocked experiments with explicit reasons

If the operator does not supply a valid write request, prefer list mode over guessing.

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If available, use it for `claim-heads`, `gate-checks`, and `unresolved-claims`.
- If unavailable, degrade honestly and let the helper operate on local manifests only.

The helper owns flow-local state and manifest sync. Middleware owns attempts, telemetry, capabilities, and session snapshot publication.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `registerExperiment(...)`, `updateExperiment(...)`, `listExperiments(...)`, and `surfaceBlockers(...)` from `environment/flows/experiment.js`.
4. Gather only the projections needed for the chosen subcommand:
   - `claim-heads` for registration sanity checks
   - `gate-checks` and `unresolved-claims` for blockers
5. Run through middleware with `commandName: '/flow-experiment'` and `scope: 'flow-experiment'`.
6. Let the helper own:
   - `.vibe-science-environment/experiments/manifests/*.json`
   - `.vibe-science-environment/flows/experiment.json`
   - `.vibe-science-environment/flows/index.json`

## Write rules

For `--register`:

- require an explicit objective
- create a schema-valid manifest
- do not invent code refs, input artifacts, or related claims

For `--update`:

- update only manifest-backed fields the operator asked to change
- do not open or close attempts inside the helper

For `--blockers`:

- prefer explicit blocker reasons from manifests
- enrich with gate-check and unresolved-claim facts only when the kernel bridge is available

## Rendering

- list: total experiments, per-experiment status, related claims, output artifacts
- register: experiment id, manifest path, status, follow-up actions
- update: changed fields, new status, blocker summary if any
- blockers: blocked experiments plus explicit blocker reasons and unresolved-claim/gate-check warnings

## Rules

- Do not manually edit manifest or flow-state JSON in the prompt.
- Do not treat experiment conclusions as kernel truth.
- Keep attempt lifecycle in middleware only.
