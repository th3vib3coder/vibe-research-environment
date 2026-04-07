# Surface Orchestrator Layer — Structure and Build Order

---

## Purpose

Define how the future orchestrator should be shaped so it can:
- coordinate research work above VRE
- use the full VRE surface safely
- remain outside kernel truth ownership
- stay understandable, testable, and recoverable

This file defines the architecture of the layer.
It is still not an implementation plan.

---

## Core Thesis

The orchestrator should be built as a **coordination runtime**, not as an
all-knowing assistant blob.

Its job is to:
- understand intent
- choose the right southbound VRE path
- supervise lanes
- maintain durable operational state
- recover from interruption
- escalate at the right moments
- report clearly to the operator

It is not a second scientific runtime.

---

## Architectural Position

The stack should remain:

1. `vibe-science`
   - truth
   - governance
   - claim and citation semantics
2. VRE
   - research operating system
   - flows
   - packaging
   - writing/export rules
   - connectors, automation, domain packs
3. surface orchestrator
   - dialogue
   - routing
   - supervision
   - recovery
   - queueing
   - delivery
   - external review routing
4. future UI and channels
   - dashboard
   - inbox
   - Telegram / email / WhatsApp / similar

The orchestrator consumes VRE. It does not absorb it.

---

## Minimal Internal Modules

| Module | Owns | Must not own |
|--------|------|--------------|
| Intent Router | classify request, choose mode, decide whether southbound work is needed | research logic, truth predicates |
| Task Decomposer | break work into bounded tasks, assign owner lane, write queue state | silent task dropping or hidden reprioritization |
| Southbound Gateway | call stable VRE helpers and normalize their outputs | direct mutation of VRE machine-owned state |
| Lane Supervisor | start, compare, and track lane executions | turning review lanes into truth owners |
| Recovery Engine | classify failures, retry, resume, and log interruption history | infinite retry or fake success |
| Reporting And Delivery | summarize technical state and prepare outbound messages | upgrading speculative output into validated conclusions |

This is the **target module set**, not the minimum Day 1 implementation set.

For the first contract freeze, we only need the subset that is required to run
one bounded local coordinator with visible recovery:
- Intent Router
- Southbound Gateway
- one minimal Queue surface
- one Execution lane
- one Review lane
- one Recovery surface

Task decomposition, richer supervision, and broader delivery contracts can be
frozen later once the MVP coordinator is real.

---

## Lane Model

The orchestrator should use explicit lanes with bounded roles.

| Lane | Purpose | Canonical outputs |
|------|---------|-------------------|
| Coordination | route, decompose, supervise, escalate | queue updates, lane assignments, escalation decisions |
| Execution | invoke VRE flows and gather outputs | VRE artifacts, run references, task outcomes |
| Review | adversarial challenge and second-opinion checks | review artifacts, objections, reroute proposals |
| Reporting | convert technical state into operator-facing summaries | digests, summaries, delivery payloads |
| Monitoring | watch timers, stale state, cooldown expiry, queue blockage | monitor findings, resume suggestions, escalation triggers |

The review lane is explicitly non-canonical.

---

## Lane Policy

Lane policy should be durable and explicit.

At minimum, the orchestrator should eventually own:
- model per lane
- thinking depth per lane
- autonomy level per lane
- retry policy per lane
- cost ceiling per lane
- escalation threshold per lane

Without this, the orchestrator collapses back into an opaque assistant.

---

## Durable State Shape

The orchestrator should own state under:

`.vibe-science-environment/orchestrator/`

The authoritative file inventory lives in
[03 — Runtime, State, and Interfaces](./03-runtime-state-and-interfaces.md).

| File | Meaning |
|------|---------|
| `router-session.json` | current mode, objective, active thread, current target, escalation state |
| `continuity-profile.json` | durable non-truth operator and project preferences used for continuity assembly |
| `run-queue.jsonl` | atomic tasks, owner lane, status, dependencies, timestamps |
| `lane-policies.json` | per-lane model, autonomy, retry, and escalation ceilings |
| `lane-runs.jsonl` | each lane invocation, linked queue item, outcome, artifact refs |
| `escalations.jsonl` | why work paused, what decision is needed, what context was shown |
| `recovery-log.jsonl` | failure class, retry attempt, resume result, stop/backoff decision |
| `channel-outbox.jsonl` | future outbound messages, delivery target, send status |
| `external-review-log.jsonl` | compared outputs, verdicts, follow-up escalation state |

All of this state is operational, not scientific truth.

---

## Southbound Contract Rules

The orchestrator should call downward only through declared VRE contracts.

Preferred southbound inputs:
- VRE control-plane query helpers
- VRE flow shims and typed outputs
- VRE-derived artifacts with declared meaning
- VRE connector, automation, and domain-pack summaries

Forbidden shortcuts:
- scraping arbitrary markdown when a helper exists
- reading kernel truth files directly as a convenience
- mutating VRE machine-owned state directly

This is the most important implementation discipline.

---

## Mode To Action Mapping

| Mode | Primary behavior | Typical southbound target |
|------|------------------|---------------------------|
| `intake` | orient and classify | `/flow-status`, query helpers |
| `brainstorm` | shape ideas without laundering them into truth | literature suggestions, future flow proposal, notes |
| `execute` | move work forward | VRE flows and bounded queue execution |
| `supervise` | coordinate lanes and progress | lane state, queue state, review requests |
| `review` | run adversarial checks | review lane, external-review log |
| `report` | summarize and package | VRE artifacts plus channel outbox |
| `monitor` | watch for timers, stale state, blockers | VRE status, automation state |
| `recover` | retry or resume visibly | recovery log, queue state, escalation state |

This mapping should become a contract, not stay an informal habit.

---

## Autonomy And Recovery

Autonomy, failure classes, and recovery behavior are defined authoritatively in
[04 — Supervision, Recovery, and Human Loop](./04-supervision-recovery-and-human-loop.md).

This document only adds the structural implication:
- the coordination runtime must consume those rules explicitly
- recovery and escalation need durable files on disk
- lane supervision cannot assume every transport supports live intervention

---

## External Review Pattern

The orchestrator should formalize this pattern:

1. execution lane does the work
2. review lane challenges it
3. orchestrator compares both outcomes
4. if mismatch is material, escalate or reroute

This matters especially for:
- writing handoff
- export-adjacent summaries
- validator or policy changes
- code or scientific claims with high downside risk

---

## What Comes Before UI

Before any UI/UX work, the orchestrator should first have:
- explicit state ownership
- explicit lane model
- explicit southbound contracts
- explicit recovery logic
- explicit escalation rules
- explicit reporting semantics

UI should visualize these later. It should not invent them.

---

## Build Order

### Step 0 — MVP Contract Surface

Freeze only what is needed for the first executable coordinator:
- one authoritative state-file inventory
- one continuity-profile contract
- one `profile/query/full` context-assembly contract
- one mode-to-lane mapping
- one provider-lane capability contract
- one queue model
- one execution lane
- one review lane
- one recovery/escalation rule set

Everything else in this document remains the target end-state, not a Day 1
burden.

### Step 1 — Broader Contract Freeze

Freeze:
- orchestrator state files
- lane model
- lane policy ownership
- mode-to-action mapping
- status split vs VRE
- recall split vs VRE
- escalation and recovery rules

### Step 2 — Local Coordination Runtime

Build:
- one local runtime
- one queue
- one execution lane
- one review lane
- one reporting path to the current chat surface

### Step 3 — Continuity Surfaces

Build:
- recall / resume
- artifact browser
- recovery replay
- interruption recovery

### Step 4 — Monitoring And Delivery

Build:
- watch / monitor semantics
- outbox / delivery surfaces
- channel adapters only after the outbox contract is stable

### Step 5 — Wider Supervision

Build:
- multi-thread portfolio management
- richer external review lanes
- bounded autonomous continuation

Only after the first four steps are stable.

---

## Invariants

1. The orchestrator coordinates research work; it does not own scientific
   truth.
2. Every southbound action maps to a declared VRE surface or future frozen
   contract.
3. Lanes are explicit, durable, and policy-bound.
4. Recovery, retry, and escalation remain visible on disk.
5. Reporting preserves validated, speculative, degraded, and blocked state.
6. UI and channels come after orchestration contracts, not before.
