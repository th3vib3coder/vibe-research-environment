---
description: Literature flow backed by environment/flows/literature.js and shared middleware
argument-hint: "--register | --gaps | --link [paper-id-or-doi] [claim-id]"
allowed-tools: Read, Bash
model: sonnet
---

# /flow-literature

This command is a thin entrypoint over:

- `environment/control/middleware.js`
- `environment/flows/literature.js`

## Subcommands

- no args: list literature status
- `--register`: register a paper from explicit operator input
- `--gaps`: surface literature gaps
- `--link <paper-id-or-doi> <claim-id>`: store an explicit paper-to-claim link

If the input is ambiguous, prefer status instead of guessing a write.

## Kernel bridge rule

Check whether `plugin/scripts/core-reader-cli.js` exists.

- If available, use it for `claim-heads` and `literature-searches`.
- If unavailable, pass no projections and let the helper surface degraded warnings honestly.

The helper owns only flow-local state. Middleware owns attempts, telemetry, capabilities, and session snapshot publication.

## Execution protocol

1. Use `process.cwd()` as `projectPath` unless the operator explicitly gives another project root.
2. Import `runWithMiddleware(...)` from `environment/control/middleware.js`.
3. Import `registerPaper(...)`, `listPapers(...)`, `surfaceGaps(...)`, and `linkPaperToClaim(...)` from `environment/flows/literature.js`.
4. Gather only the projections needed for the chosen subcommand:
   - `claim-heads` for `--gaps` and `--link`
   - `literature-searches` for `--gaps`
5. Run through middleware with `commandName: '/flow-literature'` and `scope: 'flow-literature'`.
6. Let the helper update only:
   - `.vibe-science-environment/flows/literature.json`
   - `.vibe-science-environment/flows/index.json`

## Write rules

For `--register`:

- require explicit paper metadata from the operator
- do not fabricate title, authors, year, or relevance
- if only a DOI is given and metadata is missing, say what is still needed

For `--link`:

- accept either `LIT-XXX` or DOI as the paper reference
- never certify claim truth; this is only a local flow link

## Rendering

- status: papers registered, linked papers, unlinked papers, current gaps, warnings
- register: created paper id, title, linked claims, follow-up actions
- gaps: explicit gaps plus suggested next searches
- link: stored link, degraded verification warning if claim heads were unavailable or missing

## Rules

- Do not manually edit literature JSON files in the prompt.
- Do not open or close attempts inside the flow helper path.
- Do not use markdown claim ledgers as a substitute for structured kernel truth when the bridge is unavailable.
