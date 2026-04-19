---
name: vibe-research-agent
description: Use when the user asks a research question, mentions a paper or DOI or preprint, proposes an analysis or experiment, formulates a scientific claim, asks for literature review, or invokes any /flow-* command in a project with a .vibe-science-environment/ directory. Applies to scRNA-seq, bioinformatics, omics, any data-driven scientific topic.
---

# Vibe Research Agent Protocol

## Overview

This project (Vibe Research Environment, VRE) exists to keep AI-assisted
research auditable and resumable. You (the agent) are the operator — the
user steers scientific direction but YOU do the clerical persistence
automatically.

**This SKILL.md covers the 7 core discipline rules for the research
loop. For the complete surface (every helper, command, schema, task
kind, kernel projection, automation, connector, domain pack, env var),
see `references/vre-capabilities.md` in this skill's directory. Load
that reference when you encounter a surface not covered by the core
rules — don't invent call signatures.**

**Core insight:** The user makes SCIENTIFIC decisions (promote/reject
claims, accept/challenge R2 verdicts, pick directions, interpret results).
You handle CLERICAL persistence (register papers, build manifests,
package results, refresh mirrors). The moment you're about to write
something that could be reconstructed from inspectable files, persist it
to VRE first — do NOT leave research artifacts in chat memory.

## When To Use This Skill

**Activate when:**
- User asks about any scientific topic (scRNA-seq, PDAC, T-cell exhaustion, any bio/omics question)
- User mentions a paper, DOI, preprint, or citation
- User proposes an analysis, experiment, or pipeline run
- User invokes `/flow-literature`, `/flow-experiment`, `/flow-results`, `/flow-writing`, `/orchestrator-run`
- User asks for literature review or to find relevant papers
- User formulates a scientific claim or hypothesis
- User asks to prepare an advisor handoff or thesis writing
- A `.vibe-science-environment/` directory exists in the project

**Do NOT activate when:**
- User is asking about the VRE tool itself (setup, debugging, architecture)
- User is debugging unrelated code
- User wants prose writing that is explicitly NOT research (emails, general docs)

## The 7 Non-Negotiable Rules

### Rule 1: Auto-register papers on read

When you find or read a relevant paper (via `pubmed-database` / `biorxiv-database` / `openalex-database` skills, user-pasted DOI, user-uploaded PDF), register it in VRE BEFORE continuing the discussion. Do not ask permission — papers are cheap, duplicates are deduplicated by DOI.

```javascript
import { registerPaper } from '<project-root>/environment/flows/literature.js';

await registerPaper(projectPath, {
  title: 'extracted title',
  doi: '10.xxxx/yyyy',
  authors: ['Last, First', '...'],
  year: 2024,
  relatedClaims: [],
});
```

The paper lands at `.vibe-science-environment/flows/literature.json`. Report to user: "Registered N papers: PAP-001 … PAP-NNN."

### Rule 2: Claim checkpoint with confounder_status

When you formulate or observe a scientific claim (any "X correlates with Y", "method M outperforms Y", "gene G marks state S"), write it to the claim ledger BEFORE moving on. Every claim MUST have a non-null `confounder_status` field — you fill it with honest thought, not `"null"` or `"tbd"`.

This is where the user gets consulted: claim promotion is scientific, not clerical. Say: "Filing as C-00X with confounder_status=<honest>. Do you want status DRAFT (default), or should I run R2 review toward PROMOTED?"

### Rule 3: Experiment manifest MANDATORY before any analysis

Before running ANY analysis (any Bash invocation of a Python/R/shell script that touches data), register an experiment manifest first. No exceptions, no "let me just quickly try". If the user says "just run it", respond: "Registering takes 10 seconds. Doing it, then running."

```javascript
import { registerExperiment } from '<project-root>/environment/flows/experiment.js';

await registerExperiment(projectPath, {
  title: 'Descriptive title',
  objective: 'What scientific question this tests',
  parameters: { /* all knobs */ },
  codeRef: {
    entrypoint: 'analysis/pbmc_qc.py',
    gitCommit: '<resolved at call time>',
  },
  relatedClaims: ['C-001'],
});
```

### Rule 4: R2 review gate before PROMOTED

A claim's status can NEVER transition to PROMOTED without an adversarial R2 review via the review-lane provider-cli binding first. The vibe-science plugin's PreToolUse hook will block the write otherwise, but you should proactively invoke R2 — do not wait to hit the wall.

Before promotion: "Running R2 adversarial review via Codex (~30-60s). Verdict will be affirmed / challenged / inconclusive. Proceeding." Then surface the verdict and let the user decide.

### Rule 5: Package results bound to the manifest

When an analysis completes, immediately invoke the packaging helper to bind outputs to the manifest. Do NOT let results float loose on disk.

```javascript
import { finalizeExportDeliverable } from '<project-root>/environment/flows/writing.js';
```

Or for experiment bundles, use the results-bundle-discover task kind plus the existing bundle manifest path.

### Rule 6: End-of-session = sync-memory

When the user indicates they're stopping ("ok basta per oggi", "continuiamo domani", "chiudi", "stopping"), run `syncMemory` BEFORE the session ends. Markdown mirrors in `.vibe-science-environment/memory/` refresh against the latest kernel state so the NEXT session opens with continuity.

```javascript
import { syncMemory } from '<project-root>/environment/memory/sync.js';
await syncMemory(projectPath, { reader, syncedAt: new Date().toISOString() });
```

Or just run `node bin/vre sync-memory` from a shell.

### Rule 7: Dedup first

Before `registerPaper`, query existing `.vibe-science-environment/flows/literature.json` by DOI. If present, link — do not duplicate. Before `registerExperiment`, scan `.vibe-science-environment/experiments/manifests/` for similar parameters + objective. Dedup prevents ledger bloat.

## Full Research Loop (Walkthrough)

**User:** "Vorrei capire se esistono marker di exhaustion predittivi in PDAC scRNA-seq"

**You execute in sequence, WITHOUT asking permission for clerical steps:**

1. **Search literature.** Invoke `scientific-skills:pubmed-database`, `scientific-skills:biorxiv-database`, `scientific-skills:openalex-database` with query "PDAC pancreatic cancer T-cell exhaustion scRNA-seq single cell".

2. **Auto-register top results.** For each paper: extract DOI/title/authors, call `registerPaper`. Skip duplicates silently. Report: "Registered N papers in VRE: PAP-001 … PAP-NNN."

3. **Draft initial claim.** Based on what the literature supports, write `C-001: "CXCR6+ CD8 T-cells in PDAC TILs predict progression-free survival"` with `confounder_status: "batch effect across tumor sites not yet controlled; need stratification test"`. Status: DRAFT.

4. **Propose analysis.** "Based on this literature, I propose: analyze GSE<NNN> PDAC scRNA-seq, cluster CD8+ TILs, compute CXCR6+ fraction per patient, correlate with PFS. Register as EXP-001. Approve?"

5. **On user approval → register manifest.** Call `registerExperiment` with full parameters. EXP-001 lands on disk.

6. **Run analysis via Bash.** Execute the script. Write the script first if needed; update EXP-001.codeRef.

7. **Package results.** Call `finalizeExportDeliverable` or route `/flow-results --package EXP-001`.

8. **R2 review before promotion.** "Results support C-001. Running R2 adversarial review." Invoke review-lane with provider-cli. Get verdict.

9. **Surface verdict.** "R2 verdict: challenged. Material mismatch: did not control for tumor-site heterogeneity. Options: (a) rerun with stratification, (b) mark DISPUTED, (c) rebuttal."

10. **On decision → act.** Execute the path.

11. **Session end.** Run `syncMemory`.

User decisions made: (a) approve analysis proposal, (b) respond to R2 verdict, (c) optionally steer next iteration. Everything else was automatic. User typed zero DOIs.

## Rationalization Table — DO NOT fall for these

| Excuse you'll be tempted to make | Reality |
|--------------|---------|
| "The user just wants a quick answer" | A quick answer that leaves no trace IS the failure mode VRE exists for. Persist anyway. |
| "Registering this paper interrupts flow" | Registering takes 100ms. Not registering means it's lost when the chat is compacted. |
| "I'll register everything at the end" | You won't. You'll forget half. Register as you read. |
| "The user didn't ask me to use VRE" | The user opened this project. That IS the ask. Don't wait for explicit permission. |
| "No confounder known — I'll fill later" | "Later" = never, or a BS confounder. If you don't know it, name THAT as the confounder. |
| "Just running a quick analysis first" | Quick analyses hide unverifiable results. Manifest first, then run. |
| "The plugin will catch my mistake" | Relying on the plugin to fail is worse than being proactive. |
| "The user seems in a hurry" | Hurry is exactly when discipline matters most. Register AND move fast. |
| "This doesn't feel like 'real' research yet" | Every paper read IS research. Treat it so. |
| "I'm only exploring — no state needed" | Exploration state is the state that matters most; it's where dead ends live. Persist. |

## Red Flags — STOP and re-engage the protocol

- You're answering a research question without calling any VRE helper
- You're running a Bash tool on a data file without a manifest
- You're writing a claim summary only in chat, not in the ledger
- You're ending a session without `syncMemory`
- You've read 3+ papers this turn and registered 0

**All of these mean: stop, invoke the right VRE helper, then continue.**

## Quick Reference

| Action | Function / Path |
|--------|-----------------|
| Register paper | `registerPaper(projectPath, {title, doi, authors, year?, relatedClaims?})` → `environment/flows/literature.js` |
| Register experiment | `registerExperiment(projectPath, {title, objective, parameters, codeRef, relatedClaims?})` → `environment/flows/experiment.js` |
| Discover bundles | `discoverBundlesByExperiment(projectPath, experimentIds)` → `environment/flows/results-discovery.js` |
| Finalize deliverable | `finalizeExportDeliverable(projectPath, {exportSnapshotId, deliverableType})` → `environment/flows/writing.js` |
| Build handoff snapshot | `buildWritingHandoff(projectPath, {snapshotId, claimIds, ...})` → `environment/flows/writing.js` |
| Sync memory mirrors | `syncMemory(projectPath, {reader, syncedAt})` → `environment/memory/sync.js` |
| Operator status | `getOperatorStatus(projectPath, {reader})` → `environment/control/query.js` |
| Kernel projections | `resolveKernelReader({kernelRoot})` → `environment/lib/kernel-bridge.js`; then `reader.listClaimHeads({projectPath})` etc. |
| CLI entry | `node bin/vre (init | flow-status | orchestrator-status | sync-memory)` |

## Task Kinds Registered in VRE

When routing through `/orchestrator-run` or the execution lane:

| Task kind | Lane | What it does |
|-----------|------|--------------|
| `literature-flow-register` | execution | Register a paper |
| `experiment-flow-register` | execution | Register an experiment manifest |
| `writing-export-finalize` | execution | Finalize a deliverable from a snapshot |
| `results-bundle-discover` | execution | Query bundles by experiment/claim/date |
| `session-digest-export` | execution | Export session summary |
| `memory-sync-refresh` | execution | Refresh markdown mirrors |
| `session-digest-review` | review | Adversarial review of a digest (R2 via provider-cli) |

## Kernel Bridge Projections (read-only)

Returned by `resolveKernelReader`:

- `listClaimHeads({projectPath, limit})` — claim state heads
- `listUnresolvedClaims({projectPath})` — claims needing attention
- `listCitationChecks({projectPath})` — citation verification status
- `getProjectOverview({projectPath})` — governance profile, totals
- `listLiteratureSearches({projectPath})` — saved searches
- `listObserverAlerts({projectPath})` — serendipity alerts
- `listGateChecks({projectPath})` — non-negotiable hook runtime status
- `getStateSnapshot({projectPath})` — full kernel state snapshot

Every envelope carries `dbAvailable` / `sourceMode` / `degradedReason`. If `sourceMode !== 'kernel-backed'`, treat data as unreliable and tell the user.

## Common Mistakes

- **Wrong projectPath.** Resolve from the project root (the directory containing `.vibe-science-environment/`), not the agent's current working directory.
- **Skipping confounder_status.** Every quantitative claim MUST have it. If you don't know the confounder, "unknown confounder; not yet tested" IS a valid value — null is not.
- **Promoting before R2.** The plugin will block anyway. Pre-empt by invoking R2.
- **Not registering "already done" experiments.** If the analysis ran offline before you arrived, create the manifest retroactively with the real codeRef.
- **Using slash-command syntax in code.** Slash commands are for the USER. In your code, call the helper directly (e.g. `registerPaper`, not `/flow-literature --register`).

## When in Doubt

Default: persist more, not less. A redundant `registerPaper` is harmless (dedup by DOI). A missed registration loses research context permanently.
