# Surface Orchestrator Layer — Runtime, State, and Interfaces

---

## Runtime Position

The orchestrator is a future overlay runtime above VRE.

It may be implemented through:
- host-native chat or voice surfaces
- messaging connectors
- a framework such as Agno
- custom local orchestration code

The contract is stable even if the runtime choice changes.

### Preferred First Host Pattern

The first implementation should be a **local coordination runtime** that
prefers first-party provider runtimes inside the operator's authenticated
environment.

That keeps the first slice:
- monthly-plan-first where possible
- local and inspectable
- independent from third-party credential-reuse gateways

See [08 — Provider and Runtime Strategy](./08-provider-and-runtime-strategy.md).

This does not mean every lane should use the same transport.

The first host pattern is local-first.
The integration strategy still depends on the lane's supervision needs.

---

## Southbound Interfaces

The orchestrator talks downward through:
- VRE flow commands such as `/flow-status`, `/flow-literature`,
  `/flow-experiment`, `/sync-memory`, `/flow-results`, `/flow-writing`
- future VRE-owned helpers for status, packaging, or alerts
- future external-review adapters that are explicitly declared as non-truth
  consumers

It must prefer calling stable VRE interfaces over scraping ad hoc markdown or
mutating files directly.

---

## Northbound Interfaces

The orchestrator may expose:
- interactive chat
- voice conversation
- Telegram or WhatsApp updates
- email digests and alerts
- future `profile`, `recall`, and `context` northbound helpers over the
  continuity contract
- future dashboard or inbox surfaces

All of these are transport and presentation channels, not truth stores.

---

## Proposed State Zone

If implemented, the orchestrator should keep its own state under:

`.vibe-science-environment/orchestrator/`

The list below is the **authoritative state-file inventory** for the
orchestrator layer.

Continuity-profile semantics are defined in
[11 — Continuity Profiles and Context Assembly](./11-continuity-profiles-and-context-assembly.md).

Candidate machine-owned files:
- `router-session.json`
- `continuity-profile.json`
- `run-queue.jsonl`
- `lane-policies.json`
- `lane-runs.jsonl`
- `escalations.jsonl`
- `recovery-log.jsonl`
- `channel-outbox.jsonl`
- `external-review-log.jsonl`

This state is operational only. It records routing, retries, delivery, and
escalation decisions. It does not certify scientific facts.

### Queue Model

`run-queue.jsonl` should be treated as an append-only event log, not as a
mutable table.

That means:
- task creation appends a record
- task status changes append a new record for the same task id
- current queue state is derived from the latest record per task id

This keeps queue history replayable and consistent with the append-only
discipline already used elsewhere in VRE.

---

## File-System Logic

The orchestrator may supervise:
- archiving completed work
- separating active versus historical folders
- keeping pack, bundle, and digest locations predictable
- reducing clutter from interrupted runs

It may NOT:
- move kernel-owned truth files in ways that break contracts
- rewrite VRE-owned artifacts outside declared ownership
- create hidden directories that bypass lifecycle visibility

---

## External Review Lanes

A future implementation may route work to:
- local Codex for code, review, or contrarian checking
- a second Claude Code lane for external review
- future reviewer agents with bounded roles

These lanes are reviewers, not authorities. Their outputs must remain
traceable, attributable, and reviewable.

---

## Integration Capability Rule

Not every southbound or provider-facing transport supports the same degree of
supervision.

The orchestrator should distinguish at least these capability levels:
- `fire-and-forget`
- `output-only`
- `streaming`
- `programmatic`

Implication:
- `Reporting` and some `Review` work can run on `fire-and-forget` or
  `output-only` transports
- `Execution` work that needs live supervision should prefer `streaming` or
  `programmatic` transports
- any lane that must be interrupted, resumed, or steered mid-run requires more
  than a plain subprocess output capture

The same discipline applies to continuity assembly:
- a helper may assemble profile, query recall, or full context explicitly
- a transport may not silently replace that contract with hidden proxy magic

---

## Invariants

1. The orchestrator prefers stable contracts over ad hoc file inspection.
2. Its state lives in a distinct operational zone.
3. Channel delivery, retries, and review routing are observable and replayable.
