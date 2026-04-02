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
- future dashboard or inbox surfaces

All of these are transport and presentation channels, not truth stores.

---

## Proposed State Zone

If implemented, the orchestrator should keep its own state under:

`.vibe-science-environment/orchestrator/`

Candidate machine-owned files:
- `router-session.json`
- `run-queue.jsonl`
- `escalations.jsonl`
- `recovery-log.jsonl`
- `channel-outbox.jsonl`
- `external-review-log.jsonl`

This state is operational only. It records routing, retries, delivery, and
escalation decisions. It does not certify scientific facts.

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

## Invariants

1. The orchestrator prefers stable contracts over ad hoc file inspection.
2. Its state lives in a distinct operational zone.
3. Channel delivery, retries, and review routing are observable and replayable.
