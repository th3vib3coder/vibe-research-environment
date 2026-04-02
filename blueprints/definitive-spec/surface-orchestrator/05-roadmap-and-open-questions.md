# Surface Orchestrator Layer — Roadmap and Open Questions

---

## Build Prerequisites

This layer should not become active before:
1. VRE Phase 3 is stable
2. VRE writing/export boundaries are proven in real runs
3. core channel and automation rules are frozen
4. southbound VRE interfaces are stable enough to call without scraping

---

## Suggested Future Delivery Order

### Stage A — Contract Freeze

- freeze orchestrator-owned state surfaces
- freeze channel delivery rules
- freeze autonomy and escalation policy
- freeze external review lane contracts

### Stage B — Local Orchestrator MVP

- one direct chat surface
- intent routing
- safe southbound VRE invocation
- basic retry, cooldown resume, and status reporting

### Stage C — Messaging and Reporting

- outbound digests and alerts
- Telegram/email/WhatsApp transport adapters
- quiet hours and schedule windows

### Stage D — Supervision and Review

- multi-agent assignment and drift detection
- contrarian review lane
- external-review trace logging

### Stage E — Persistent Research Loop

- restart after interruption
- backlog queue and resumption logic
- bounded autonomous continuation under explicit operator policy

---

## Open Questions

1. Should the orchestrator live in the same repo as VRE or as its own repo?
2. What is the minimum safe messaging surface for first delivery?
3. Which user preferences must be durable from day one?
4. How should quiet hours interact with urgent scientific failures?
5. What evidence threshold should trigger mandatory external review?
6. How much workspace hygiene should be automatic versus suggested?
7. Should the first implementation be host-native, framework-based, or both?

---

## Current Recommendation

Do not build this layer yet.

Keep it as a designed future overlay while finishing VRE core phases. When the
time comes, start with the smallest safe version: one chat surface, one retry
policy, one reporting path, and no truth-semantic authority.
