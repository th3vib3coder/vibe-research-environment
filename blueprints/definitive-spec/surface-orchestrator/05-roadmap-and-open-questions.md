# Surface Orchestrator Layer — Roadmap and Open Questions

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

## Open Questions

1. Should the orchestrator live in the same repo as VRE or as its own repo?
2. What is the minimum operator shell above `/flow-status` and existing VRE
   summaries?
3. Which lane/provider combinations are allowed on day one?
4. Which actions are always human-gated, even under bounded autonomy?
5. What is the minimum durable state needed to resume interrupted work cleanly?
6. Which future delivery channel comes first after the current chat surface?
7. Should the first runtime live inside this repo or in a sibling coordinator
   repo once contracts are frozen?

---

## Current Recommendation

Start **orchestrator Phase 0** now.

The first implementation should be:
- local, not cloud-first
- VRE-consuming, not VRE-replacing
- monthly-plan-first where provider policy allows it
- UI-later, not dashboard-first
- explicit about queue, lane, escalation, and recovery state from day one

The continuity-profile and context-assembly contract is now part of that Phase
0 freeze, not a later polish item.
