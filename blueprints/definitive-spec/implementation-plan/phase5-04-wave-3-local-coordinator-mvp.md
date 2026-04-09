# Phase 5 Wave 3 — Local Coordinator MVP

**Goal:** Build the first executable coordinator with one execution lane, one
review lane, bounded recovery, and command-shim operator entry points.

---

## WP-103 — Intent Router And Mode Mapping Runtime

Add the coordinator entry runtime for:
- intent routing
- mode selection
- mapping work into the queue model

Minimum responsibilities:
- accept one operator request
- classify it into a declared mode
- create or update queue tasks
- choose execution lane versus review lane where applicable

Acceptance:
- routing behavior follows the frozen mode-to-lane contract
- routing decisions are durable and visible
- the runtime never jumps straight into hidden execution with no queue trace

---

## WP-104 — Provider Gateway And Lane Capability Enforcement

Add the first provider gateway that applies:
- lane policy
- `integrationKind`
- supervision capability constraints
- API-fallback precedence

Rules:
- Phase 5 starts local and monthly-plan-first where policy allows
- if a lane requires a supervision capability the chosen integration cannot support, fail closed
- provider binding must be machine-visible, not implied by prompt text

Acceptance:
- the first coordinator can choose and invoke one declared provider path safely
- unsupported lane/policy combinations fail visibly
- provider logic does not leak into unrelated runtime modules

---

## WP-105 — Execution Lane Runner

Implement the first execution lane:
- consume a ready queue task
- invoke declared VRE helpers or command surfaces
- write lane-run records
- append task status transitions

Rules:
- execution lane consumes VRE; it does not duplicate flow logic
- every lane run links back to the queue item and produced artifact refs

Acceptance:
- at least one useful task class runs end-to-end through the queue and lane runtime
- execution failures produce bounded recovery or escalation records
- no kernel truth writes occur

---

## WP-106 — Review Lane Runner And Bounded Recovery

Implement the first review lane:
- adversarial or contrarian challenge on selected tasks
- bounded reroute proposals
- recovery-policy application from doc 04 defaults
- escalation when risk or ambiguity crosses the declared threshold

Acceptance:
- review outputs are visible, attributable, and non-canonical
- recovery and escalation follow the frozen mapping instead of ad hoc retries
- repeated failures do not disappear into console logs

---

## WP-107 — Status Shim, Run Shim, And Minimal Operator Shell

Implement the two Wave 0 entry surfaces:
- one run shim
- one status shim

Minimum shell behaviors:
- show queue state
- show active lane work
- show pending escalations or blockers
- show last recovery decision
- show next recommended operator action

Rules:
- chat remains a primary human surface
- filesystem artifacts remain the durable human-readable surface
- no dashboard UI lands in Phase 5

Acceptance:
- an operator can start, inspect, and steer the coordinator without raw file inspection
- command shims consume shared query/runtime helpers instead of duplicating logic
- the operator shell stays minimal and auditable

---

## Parallelism

- WP-103 and WP-104 can begin in parallel after Waves 0-2 freeze their contracts
- WP-105 starts after WP-103 and WP-104
- WP-106 starts after the execution lane writes real lane-run records
- WP-107 starts once the query surface and first runtime outputs exist

---

## Exit Condition

Wave 3 is complete when the repo has one real local coordinator path: it can
route work, run one execution lane and one review lane, record recovery and
escalation honestly, and expose start/status surfaces without a dashboard.
