# Surface Orchestrator Layer — Supervision, Recovery, and Human Loop

---

## Supervision Role

The orchestrator exists partly to keep long-running research execution from
derailing.

That includes:
- decomposing work into atomic tasks
- assigning tasks to agent lanes
- checking whether agents are drifting from scope
- forcing explicit pauses at risky decision points
- requesting external review when confidence is low or stakes are high

---

## Autonomy Levels

Future implementations should support explicit autonomy levels:

| Level | Meaning |
|------|---------|
| `advisory` | suggest only, never execute without the user |
| `supervised` | execute bounded tasks, escalate on ambiguity |
| `bounded-autonomous` | continue safe loops with explicit stop rules |

The chosen level is an operator preference, not a scientific fact.

Precedence rule:
1. lane policy override
2. continuity-profile default
3. system default

That means the continuity profile may express the operator's default autonomy
preference, but lane policies remain the authoritative per-lane override
surface.

---

## Failure Classification

The orchestrator should classify failure before reacting:
- token cooldown or budget pause
- tool failure
- dependency unavailable
- contract mismatch
- state conflict or corruption
- ambiguous user request
- blocked scientific prerequisite
- lane drift

Different failure classes should trigger different recovery policies.

---

## Recovery Policies

Allowed future behaviors:
- retry with backoff
- resume after cooldown expiry
- restate or reissue an interrupted prompt
- switch execution lane while preserving context
- stop and preserve state for inspection or repair
- escalate to the user when ambiguity or risk is too high
- request a contrarian review before proceeding

Forbidden behaviors:
- hiding repeated failures
- silently dropping blocked work
- retrying forever without visibility
- converting a blocked scientific prerequisite into a fake success

### Default Failure-To-Recovery Mapping

This is the default mapping that other orchestrator documents should assume
unless a narrower lane-specific rule is frozen later.

| Failure class | Default recovery | Default escalation posture |
|------|---------|------------------|
| token cooldown or budget pause | resume after cooldown expiry | escalate only if repeated pauses breach operator preference |
| tool failure | retry with backoff, then switch lane if bounded retries fail | escalate after bounded retries are exhausted |
| dependency unavailable | retry with backoff if plausibly transient | escalate if the dependency remains unavailable |
| contract mismatch | stop and log the mismatch | escalate immediately; do not blind-retry |
| state conflict or corruption | stop, preserve state, require inspection or repair | escalate immediately; do not switch lanes as a workaround |
| ambiguous user request | pause and request clarification | escalate immediately |
| blocked scientific prerequisite | pause the task and surface the blocker | escalate immediately; optionally request contrarian review |
| lane drift | restate scope once, then reroute or request review | escalate if drift repeats after one bounded correction |

This table is intentionally conservative.
Lane-specific policy may tighten these defaults, but should not weaken them in
a way that hides risk or failure.

This file is the **authoritative source** for:
- autonomy levels
- failure classes
- recovery behaviors
- human-loop escalation semantics

Other orchestrator documents may reference these rules, but should not redefine
them with diverging lists.

---

## Human Loop Rules

The orchestrator should escalate when:
- the next action changes project direction materially
- the evidence is ambiguous
- costs or time budget exceed user preference
- a delivery is about to be sent externally
- a second truth interpretation would be required

Human loop means informed pause, not friction for its own sake.

---

## External Review Pattern

Useful future pattern:
1. one lane executes
2. one lane reviews adversarially
3. the orchestrator compares outcomes and decides whether to escalate

This is especially valuable for:
- delicate claims
- writing handoff
- code that changes validators or policy helpers

---

## Invariants

1. Recovery is visible, not hidden.
2. Autonomy must be bounded by explicit stop and escalation rules.
3. External reviewers may challenge outputs, but they do not become canonical
   truth owners.
