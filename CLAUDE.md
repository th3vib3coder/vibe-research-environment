# Claude Context for Vibe Research Environment

You are working inside the **Vibe Research Environment (VRE)**, a file-backed
operational shell for AI-assisted scientific research. The user is typically
doing bioinformatics / scRNA-seq research for a thesis or publication.

## Before doing anything research-related, INVOKE THE SKILL

**When the user asks a research question, mentions a paper or DOI,
proposes an experiment, formulates a scientific claim, asks for
literature review, or invokes any `/flow-*` command — invoke the
`vibe-research-agent` skill FIRST, before replying.**

The skill lives at `.claude/skills/vibe-research-agent/SKILL.md` and
contains the 7 non-negotiable rules for using VRE correctly. Read it,
then execute.

**Short version:**
- User makes SCIENTIFIC decisions (promote claims, accept R2 verdicts, pick directions)
- You handle CLERICAL persistence (register papers, build manifests, package results, refresh mirrors)
- Every paper read → `registerPaper`. Every claim formulated → ledger with
  `confounder_status`. Every analysis → `registerExperiment` first. Every
  promotion → R2 review. Every session end → `syncMemory`.
- **Do NOT ask the user for clerical details** (DOIs, parameters, paper IDs).
  You extract them from sources. The user's time is for science, not data entry.

## Kernel plugin coexistence

This project pairs with the `vibe-science` Claude Code plugin. The plugin
enforces governance at hook level (claim promotion gates, unreviewed-claim
stop blocks, R2 review requirements). VRE reads kernel truth through
`environment/lib/kernel-bridge.js`. VRE never writes kernel state directly.

If `node bin/vre init` reports `kernel: degraded`, tell the user and
suggest setting `VRE_KERNEL_PATH`. Some flows work without the kernel;
claim promotion does not.

## Key paths

- `bin/vre` — CLI dispatcher (4 commands: `init`, `flow-status`, `orchestrator-status`, `sync-memory`)
- `environment/flows/` — research flow helpers you call from code
- `environment/orchestrator/` — queue, lanes, review-lane, task-registry
- `environment/lib/kernel-bridge.js` — read-only bridge to kernel
- `.vibe-science-environment/` — all VRE state on disk (NOT checked in)
- `.claude/skills/vibe-research-agent/SKILL.md` — the research protocol you follow

## User priorities (stated directly)

1. The agent uses VRE automatically, without the user having to ask every session.
2. The user does NOT type clerical data (DOIs, parameters, IDs). The agent extracts those.
3. The system slows the user down where science requires it (claim promotion, R2 acceptance, interpretation). NOT where science requires speed.

## If the user's question is about VRE itself

If the user is asking about the tool (setup, commands, architecture,
debugging the VRE code), answer as a normal engineering conversation.
Do NOT force the research skill on non-research questions.
