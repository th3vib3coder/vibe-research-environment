# Surface Orchestrator Layer — Roadmap and Phase 0 Decisions

---

## Current Position

The old recommendation was "do not build this layer yet."

That recommendation is now outdated.

VRE Phases 1-4 are closed, tested, and saved with evidence. The remaining work
is no longer "wait until VRE exists." The remaining work is to freeze the
coordination-layer contracts before any runtime implementation starts.

So the right stance now is:
- do not jump straight into a framework or UI
- do start orchestrator Phase 0 design and contract freezing now

---

## Preconditions That Are Now Satisfied

1. VRE Phase 1-4 southbound contracts exist and are stable enough to consume
2. writing/export boundaries are frozen and tested
3. connector, automation, and domain-pack surfaces exist as explicit VRE
   modules
4. install, doctor, repair, validators, and evidence discipline are already in
   place below this layer

---

## Preconditions That Still Matter

Before implementation starts, we still need to freeze:
- orchestrator-owned state files
- continuity profile and context-assembly contract
- lane policy ownership
- status split vs VRE
- recall split vs VRE
- provider and billing strategy
- escalation and recovery contract

---

## Recommended Delivery Order

### Stage 0 — Contract Freeze

- freeze orchestrator-owned state surfaces
- freeze continuity-profile ownership plus `profile/query/full` context modes
- freeze operator shell semantics above VRE
- freeze lane model and lane policy ownership
- freeze provider-lane contract and billing visibility rules
- freeze recall/resume semantics
- freeze autonomy and escalation policy
- freeze external review and reporting lane contracts

### Stage 1 — Local Coordinator MVP

- one direct chat surface
- intent routing
- safe southbound VRE invocation through declared helpers
- one execution lane plus one review lane
- one local monthly-plan-first provider path
- basic retry, cooldown resume, and status reporting

### Stage 2 — Continuity And Browsing

- recall/resume
- durable queue replay
- artifact browser
- interruption recovery

### Stage 3 — Monitoring And Delivery

- outbound digests and alerts
- Telegram/email/WhatsApp transport adapters
- quiet hours and schedule windows

### Stage 4 — Wider Supervision

- multi-agent assignment and drift detection
- contrarian review lane
- portfolio-level queueing
- bounded autonomous continuation under explicit operator policy

---

## Phase 0 Decisions Now Closed

The following decisions are now closed for the first runtime:

1. Repo and runtime location
   Current decision: the first orchestrator runtime lives in the same repo as
   VRE and is implemented locally inside this repo. Extraction to a sibling
   repo is a later optimization, not a Phase 0 requirement.
2. Minimum operator shell
   Current decision: use a dedicated minimal shell above `/flow-status` and
   existing VRE summaries. It should expose queue, lane, escalation, recovery,
   and next-action state, but should not become a dashboard.
3. First delivery channel after the current chat surface
   Current decision: use command-shim entry points plus filesystem-backed
   artifacts. External channel adapters remain later delivery surfaces.
4. Continuity update posture
   Current decision: stable continuity updates are explicit or explicitly
   confirmed. Phase 0 does not auto-capture preferences from arbitrary chat
   turns.

Questions now materially answered by later docs:

1. Day-one lane/provider combinations
   Current answer: freeze them through the provider-lane contract in doc 08.
2. Which actions are always human-gated under bounded autonomy
   Current answer: use the escalation and human-loop rules in doc 04.
3. Minimum durable state needed for clean resume
   Current answer: use the state inventory and continuity contract in docs 03,
   07, 11, and 12.

---

## Current Recommendation

Start **orchestrator Phase 0** now.

The first implementation should be:
- stay in the VRE repo, not split early into a sibling repo
- local, not cloud-first
- VRE-consuming, not VRE-replacing
- monthly-plan-first where provider policy allows it
- command-shim plus filesystem-first after the current chat surface
- minimal-shell-first, not dashboard-first
- explicit about queue, lane, escalation, and recovery state from day one
- explicit-only or explicitly confirmed continuity updates from day one

The continuity-profile and context-assembly contract is now part of that Phase
0 freeze, not a later polish item.

No Phase 0 architecture decision remains intentionally open.
The next move is contract and schema freeze, not more branching on product
shape.
