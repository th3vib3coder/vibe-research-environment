# Surface Orchestrator Layer — Capabilities and Modes

---

## Capability Surface

The future orchestrator may provide all of the following:

1. direct dialogue with the user and translation from informal requests into
   structured VRE work
2. collaborative project drafting and brainstorming with the user
3. orchestration and supervision of research agents so they do not drift
4. delivery of reports via chat, email, Telegram, WhatsApp, or future channels
5. bounded operational decisions that keep a research program moving
6. loop persistence when an execution lane stalls
7. retry or prompt reiteration when a task is interrupted
8. cooldown recovery when token or budget limits pause execution
9. workspace hygiene and artifact organization
10. external review lanes through Codex, Claude Code, or future reviewer agents
11. portfolio management across multiple active research threads
12. deadline, meeting, and milestone awareness

---

## Operating Modes

| Mode | Purpose | Typical southbound actions |
|------|---------|----------------------------|
| `intake` | understand user intent and constraints | read `/flow-status`, inspect state, propose plan |
| `brainstorm` | shape project ideas and hypotheses | use VRE context, create notes, request literature flow |
| `execute` | move the research forward | invoke flows, package results, refresh memory |
| `supervise` | keep agent teams aligned | assign tasks, check drift, request review |
| `review` | run contrarian or external checks | call second-opinion lanes, compare outputs |
| `report` | communicate status outward | package summaries, send notifications |
| `monitor` | watch for staleness, blockers, cooldown expiry | poll safe status surfaces, schedule resume |
| `recover` | resume after failure or interruption | retry, backoff, rehydrate context, escalate |

---

## Mode To Lane Mapping

Modes are not the same thing as lanes.

Modes describe the orchestrator's current behavioral stance.
Lanes describe which bounded worker role is currently doing the work.

The default mapping should be:

| Mode | Primary lane |
|------|--------------|
| `intake` | `Coordination` |
| `brainstorm` | `Coordination` |
| `execute` | `Execution` |
| `supervise` | `Coordination` |
| `review` | `Review` |
| `report` | `Reporting` |
| `monitor` | `Monitoring` |
| `recover` | `Coordination` |

Notes:
- one lane may serve multiple modes
- a mode switch does not necessarily imply a lane switch
- `Coordination` is the default lane for routing, shaping, escalation, and
  recovery decisions
- `Execution`, `Review`, `Reporting`, and `Monitoring` are specialized lanes,
  not full conversational personas

---

## Mode Rules

1. `intake` may orient, inspect, and propose, but it must not silently start
   execution before an explicit route into an execution-capable mode.
2. `brainstorm` may generate ideas, but it must label them as non-validated
   unless routed through VRE evidence surfaces.
3. `execute` may call VRE flows, but it must not invent new truth semantics.
4. `supervise` may coordinate lanes, compare outputs, and reroute work, but it
   must not rewrite disagreement into fake consensus or silently discard lane
   objections.
5. `review` may challenge outputs, but it must not mutate canonical truth on its
   own.
6. `report` may translate technical state into human summaries, but it must
   preserve uncertainty and warnings.
7. `monitor` may poll safe status surfaces and watch timers, but it must not
   escalate or notify without declared trigger rules and visible state.
8. `recover` may resume or retry work, but it must keep interruption history
   visible.

---

## User Preference Surface

The orchestrator should eventually support:
- preferred autonomy level
- preferred reporting channel
- report verbosity
- escalation threshold
- retry aggressiveness
- quiet hours and schedule windows

These are operator preferences, not research truth.

They are defaults, not absolute lane rules.
Per-lane policy may override them where the orchestrator contract says so.

---

## Invariants

1. Modes are explicit; the orchestrator should not blur brainstorming,
   validated execution, and reporting into one opaque behavior.
2. Every outbound message must preserve whether content is validated,
   artifact-backed, speculative, or still blocked.
