# Surface Orchestrator Layer — Identity and Boundaries

---

## Purpose

Define the future layer that speaks with the user directly and steers VRE
without becoming a new research-truth authority.

---

## What This Layer Is

The surface orchestrator:
- talks to the user through chat, voice, Telegram, email, WhatsApp, or similar
  channels
- translates human requests into structured VRE work
- coordinates agents, retries, and recovery loops
- packages status, reports, and alerts back to the user
- helps keep a long-running research effort moving when execution stalls

---

## What This Layer Is Not

It does NOT:
- validate claims
- verify citations
- decide claim lifecycle truth
- duplicate export-eligibility policy
- overwrite kernel truth directly
- treat its own memory as canonical scientific state

Those responsibilities stay below:
- `vibe-science` owns truth and governance
- VRE owns research flows, mirrors, packaging, and writing/export contracts

---

## Northbound and Southbound Position

Northbound:
- user conversation
- channel delivery
- preferences and notifications

Southbound:
- VRE commands and helpers
- VRE control-plane state
- VRE packaging and writing surfaces

The orchestrator may read status and derived artifacts from VRE, but it must
write only through explicitly owned outer-project surfaces.

---

## Allowed Responsibilities

1. intent routing
2. project kickoff and project-shaping dialogue
3. task decomposition into atomic work
4. multi-agent supervision
5. recovery from interruption, cooldown, or tool failure
6. user-facing summaries and outbound reporting
7. schedule-aware reminders and follow-ups
8. workspace hygiene and file-structure supervision
9. second-opinion and adversarial review routing

---

## Forbidden Responsibilities

1. canonical claim or citation storage
2. direct kernel mutation
3. hidden policy drift from VRE contracts
4. silent autonomous publication of scientific conclusions
5. laundering free-writing into validated findings

---

## Invariants

1. The orchestrator owns supervision and communication, not scientific truth.
2. Every southbound action must map to a known VRE contract or owned future
   contract.
3. Human-facing convenience never justifies bypassing kernel or VRE rules.
4. The orchestrator may pause, escalate, or retry, but it may not silently
   redefine what counts as evidence or export-safe output.
