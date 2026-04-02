---
description: Writing handoff, advisor packs, and rebuttal packs through shared middleware
argument-hint: "--handoff | --advisor-pack [YYYY-MM-DD] | --rebuttal-pack <submission-id>"
allowed-tools: Read, Bash
model: sonnet
---

# /flow-writing

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/flows/writing.js`
- `environment/flows/writing-packs.js`

## Purpose

Expose the Phase 3 writing/export runtime through one command path without duplicating export policy.

The command may produce:

- frozen export snapshots
- claim-backed writing seeds
- advisor pack directories
- rebuttal pack directories
- flow-index updates owned by the runtime helpers

It does NOT verify citations, mutate kernel truth, or invent claim eligibility outside the shared helper.

## Subcommands

- no args or `--handoff`: build the frozen writing handoff snapshot plus claim-backed seeds
- `--advisor-pack [YYYY-MM-DD]`: assemble the advisor meeting pack for one date-scoped directory
- `--rebuttal-pack <submission-id>`: assemble one rebuttal prep pack

If the operator does not provide a valid submission id or date where required, refuse honestly instead of guessing.

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If available, you MAY build a small reader adapter for:
  - `claim-heads`
  - `unresolved-claims`
  - `citation-checks`
- If unavailable, degrade honestly and let the runtime use only workspace-owned surfaces.

Use the standard degraded reader shape when the bridge is absent or fails:

```js
{ dbAvailable: false, error: 'core-reader CLI unavailable' }
```

Do not reconstruct claim lifecycle, citation verification, or governance-profile metadata from markdown prose.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `buildWritingHandoff(...)` from `environment/flows/writing.js`.
4. Import `buildAdvisorPack(...)` and `buildRebuttalPack(...)` from `environment/flows/writing-packs.js`.
5. Build only the reader surface needed for the chosen subcommand.
6. Run through middleware with:
   - `commandName: '/flow-writing'`
   - `scope: 'flow-writing'`
7. Inside `commandFn`, delegate to exactly one runtime helper:
   - handoff -> `buildWritingHandoff(...)`
   - advisor pack -> `buildAdvisorPack(...)`
   - rebuttal pack -> `buildRebuttalPack(...)`

Middleware owns attempt lifecycle, telemetry, capability refresh, and session snapshot publication.

## Input rules

For handoff mode:

- optional `claimIds` may narrow the export set
- non-eligible claims remain blocked; they do not become claim-backed seeds

For advisor pack mode:

- use an explicit date or default to the operator's current date
- copy only canonical figure artifacts from packaged result bundles

For rebuttal pack mode:

- require a submission id
- accept reviewer comments only from explicit operator input or an explicit import path
- do not fabricate resolved responses when reviewer comments or live claim surfaces are missing

## Rendering

Report:

- selected mode
- snapshot id or pack id
- generated directories/files
- copied figure count where relevant
- warnings
- writing-related next actions and blockers published to the flow index

If degraded:

- say explicitly that workspace-owned surfaces were used
- say explicitly which kernel-backed claim or citation surfaces were unavailable

## Rules

- Do not manually edit machine-owned writing artifacts in the prompt.
- Do not duplicate export policy in markdown or shim glue.
- Do not turn advisor or rebuttal packs into a second truth layer.
- The shim is an entrypoint only; runtime logic lives in `environment/flows/writing.js` and `environment/flows/writing-packs.js`.
