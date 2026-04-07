# Surface Orchestrator Layer — Index

**Status:** Companion pre-planning spec
**Scope:** coordination and supervision layer above VRE
**Implementation state:** Phase 0 design is active; runtime not implemented

---

## Purpose

Define the next layer above VRE now that Phases 1-4 are closed.

This layer sits:
- above `vibe-research-environment`
- outside kernel truth ownership
- below any future dashboard, inbox, or messaging UI

Its job is to coordinate research work, supervise lanes, recover from
interruptions, and present state clearly without becoming a second truth
system.

---

## Reading Order

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Identity and Boundaries](./01-identity-and-boundaries.md) | what this layer is, what it must never own |
| 02 | [Capabilities and Modes](./02-capabilities-and-modes.md) | what the orchestrator does for the operator |
| 03 | [Runtime, State, and Interfaces](./03-runtime-state-and-interfaces.md) | state zones, southbound contracts, runtime edges |
| 04 | [Supervision, Recovery, and Human Loop](./04-supervision-recovery-and-human-loop.md) | autonomy, retry, escalation, review lanes |
| 05 | [Roadmap and Open Questions](./05-roadmap-and-open-questions.md) | next planning move, build stages, unresolved decisions |
| 06 | [Reference Patterns from Feynman](./06-reference-patterns-from-feynman.md) | design filter for product-shell ideas worth importing |
| 07 | [Structure and Build Order](./07-orchestrator-structure-and-build-order.md) | architecture shape of the coordination runtime |
| 08 | [Provider and Runtime Strategy](./08-provider-and-runtime-strategy.md) | monthly-plan-first provider policy and host pattern |
| 09 | [Reference Patterns from Repo Forensics](./09-reference-patterns-from-repo-forensics.md) | what other agent repos teach us about this layer |
| 10 | [Reference Patterns from Supermemory](./10-reference-patterns-from-supermemory.md) | continuity-profile, recall, and context-assembly ideas worth importing |
| 11 | [Continuity Profiles and Context Assembly](./11-continuity-profiles-and-context-assembly.md) | stable profile, dynamic context, recall modes, source types |
| 12 | [Context Assembly Runtime Contract](./12-context-assembly-runtime-contract.md) | budget, helper API, caching, dedup, formatting, update rules |

---

## Core Rule

The surface orchestrator is an intelligence and supervision layer.

It is NOT:
- a second truth layer
- a replacement for VRE flows
- a bypass around kernel governance

---

## Relationship To Existing Specs

- `vibe-science` remains the kernel truth and governance substrate
- VRE remains the research operating system and runtime layer
- this spec set defines the next northbound layer that will coordinate VRE,
  channels, and review lanes without redefining inner contracts

---

## Non-Negotiable Constraint

This spec is deliberately implementation-agnostic.

If a future runtime uses host-native orchestration, Codex agents, Claude Code,
Gemini CLI, or another coordination substrate, that implementation must conform
to these boundary rules rather than redefining them.
