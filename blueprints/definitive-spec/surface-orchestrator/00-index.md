# Surface Orchestrator Layer — Index

**Status:** Future overlay spec
**Scope:** user-facing orchestration layer above VRE
**Implementation state:** not active

---

## Purpose

Preserve the design of a future surface orchestrator without mixing it into the
active Phase 1-3 implementation path.

This layer sits:
- above `vibe-research-environment`
- outside kernel truth ownership
- between the user and the research operating system

It is the place for conversation, routing, supervision, recovery, scheduling,
and channel delivery.

---

## Reading Order

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Identity and Boundaries](./01-identity-and-boundaries.md) | what this layer is, what it must never own |
| 02 | [Capabilities and Modes](./02-capabilities-and-modes.md) | what the orchestrator does for the user |
| 03 | [Runtime, State, and Interfaces](./03-runtime-state-and-interfaces.md) | state zones, command interfaces, channel edges |
| 04 | [Supervision, Recovery, and Human Loop](./04-supervision-recovery-and-human-loop.md) | autonomy policy, retries, escalation, external review |
| 05 | [Roadmap and Open Questions](./05-roadmap-and-open-questions.md) | build order, prerequisites, unresolved choices |

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
- VRE remains the research operating system and flow/runtime layer
- this spec defines a future overlay that can coordinate VRE, channels, and
  external review agents without redefining the inner contracts

---

## Non-Negotiable Constraint

This spec is deliberately framework-agnostic.

If a future implementation uses Agno, Claude-native transport, Codex agents, or
another orchestration runtime, that implementation must conform to this
boundary spec rather than redefining it.
