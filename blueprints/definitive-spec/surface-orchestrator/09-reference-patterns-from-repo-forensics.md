# Surface Orchestrator Layer — Reference Patterns from Repo Forensics

---

## Purpose

Capture what the broader repo-forensics set teaches us about building the
orchestrator layer above VRE.

This file exists to separate:
- reusable architecture patterns
- useful product and workflow ideas
- tempting but wrong directions

It is a reference filter, not an implementation plan.

---

## Repo Set Considered

The most relevant repo-forensics inputs for the orchestrator layer are:
- `gstack`
- `paperclip`
- `superpowers`
- `hermes-agent`
- `claude-scholar`
- `AI-Scientist-v2`
- `AgentScope`

Less directly useful repos still matter as ecosystem context, but the ones
above produced the clearest architectural lessons for us.

---

## Patterns Worth Carrying Forward

### 1. `gstack` — Durable Local Helper Daemons

Key lesson:
- when a tool benefits from persistent state and low latency, a long-lived
  local helper with an observable state file is better than repeated cold
  starts

Patterns worth adopting:
- local daemon or helper process where it materially improves latency
- explicit state file with PID/port/version/token-style metadata
- ring-buffer or append-only operational logs
- generated operator docs from source-of-truth command metadata

What we should not copy blindly:
- browser-centric architecture as if it were our orchestrator core

### 2. `paperclip` — Control Plane, Not Execution Plane

Key lesson:
- the coordination layer should orchestrate and supervise, not absorb all
  execution logic

Patterns worth adopting:
- strong split between control plane and execution plane
- adapter model for heterogeneous runtimes
- task and approval visibility over silent self-healing
- human board-style override as a first-class control surface

What we should not copy blindly:
- company/org-chart abstraction as our core mental model

### 3. `superpowers` — Mandatory Workflow Gating

Key lesson:
- a good system should force plan, review, and verification structure instead
  of leaving them as optional good intentions

Patterns worth adopting:
- mandatory workflow gates before execution
- explicit design approval and plan approval stages
- review checkpoints between implementation tasks
- evidence-over-claims mentality

What we should not copy blindly:
- assuming coding workflow abstractions are sufficient for research workflow

### 4. `hermes-agent` — Recall, Prefetch, And Session Strategy

Key lesson:
- recall and continuity need explicit architecture, not just "memory"

Patterns worth adopting:
- async prefetch for continuity data when that reduces latency
- session naming and session-scoping strategies
- CLI-surface self-knowledge
- memory modes that distinguish local, remote, or hybrid storage

What we should not copy blindly:
- any provider-auth dependence inherited from OpenClaw-era integrations

### 5. `claude-scholar` — Research Lifecycle Catalog

Key lesson:
- research orchestration works better when the lifecycle is explicit

Patterns worth adopting:
- visible lifecycle stages from ideation to rebuttal and follow-up
- workflow catalog tied to that lifecycle
- filesystem-first knowledge base discipline
- durable notes and project-memory surfaces

What we should not copy blindly:
- giant command and skill catalogs before the orchestrator contracts are frozen

### 6. `AI-Scientist-v2` — Sandboxing And Open-Ended Search Awareness

Key lesson:
- open-ended scientific loops are powerful but dangerous, and they must be
  explicitly sandboxed

Patterns worth adopting:
- explicit sandboxing for code-executing lanes
- honest separation between exploratory search and validated outputs
- recognition that open-ended autonomous research has lower reliability than
  bounded, contract-driven work

What we should not copy blindly:
- end-to-end autonomous science loops as our first orchestrator shape

### 7. `AgentScope` — Framework Capabilities, Not Architecture Anchor

Key lesson:
- message hubs, multi-agent workflows, memory modules, and HITL hooks are
  useful implementation ingredients

Patterns worth adopting:
- reuse framework features only where they strengthen a frozen contract
- keep orchestration contracts above any one framework

What we should not copy blindly:
- letting framework affordances define the product architecture

---

## Decisions These Repos Push Us Toward

Taken together, these repos push our orchestrator design toward six concrete
decisions.

This document adds value beyond the Feynman filter in three ways:
- `gstack` strengthens the case for durable local helper state and generated
  operator docs
- `paperclip` strengthens the control-plane vs execution-plane split
- `AI-Scientist-v2` strengthens the need for explicit sandboxing around
  open-ended execution lanes

### A. Local Control Plane First

The first orchestrator should be local and operator-attached, not a remote
platform before the contracts even exist.

### B. Durable Operational State On Disk

Queue, recovery, escalation, lane policy, and outbox state should live on disk
under an owned orchestrator state zone, not only in chat context.

### C. Workflow Catalog Tied To Research Lifecycle

The shell should expose a small catalog of research-native tasks such as:
- `review`
- `audit`
- `compare`
- `draft`
- `watch`
- `resume`

Those tasks should map to declared VRE surfaces and review lanes.

### D. Review Lane Is First-Class

Adversarial review should not be an afterthought. It should be built into the
coordination model early.

### E. Recall Is Historical, Not Truth

Recall and continuity should be strong, but they must never outrank current VRE
state or kernel-backed truth.

### F. Operator Docs Should Be Generated Where Possible

If the orchestrator develops a shell or command catalog, operator-facing docs
should come from the same contract metadata that drives the runtime whenever
possible.

---

## What We Explicitly Reject

These repo forensics also make some anti-patterns clearer.

1. Do not make the orchestrator a giant generic agent framework
2. Do not make it a hidden autonomous science loop
3. Do not build a marketplace before the core contracts are frozen
4. Do not turn memory or recall into a second truth plane
5. Do not let provider-auth hacks become architecture

---

## Additional Repos Worth Inspecting Next

These are **unverified candidate references** for the next forensic tranche.

They have not yet been read deeply enough to affect architecture.

### `humanlayer/agentcontrolplane`

Why it looks relevant:
- explicit "agent control plane" framing
- human-in-the-loop emphasis
- likely useful for durable async coordination patterns

### `langchain-ai/open_deep_research`

Why it looks relevant:
- research-task orientation
- likely useful for ergonomics around multi-step deep-research workflows

### `All-Hands-AI/OpenHands`

Why it looks relevant:
- clear split between CLI, local GUI, cloud, and SDK surfaces
- useful for thinking about local-first vs hosted runtime layers

These should be treated as follow-up inputs, not current design authorities.

---

## Final Reading

The repo-forensics set reinforces the same conclusion from Feynman, but with
more architectural weight:

- VRE should remain the southbound runtime and evidence layer
- the next thing to build is a true coordination layer above it
- that layer should look like a local control plane with durable state, explicit
  lanes, strong recall, and mandatory review structure

That is the shape we should carry into orchestrator Phase 0.
