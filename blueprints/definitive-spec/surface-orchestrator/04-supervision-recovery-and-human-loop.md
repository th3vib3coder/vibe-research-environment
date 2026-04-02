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

---

## Failure Classification

The orchestrator should classify failure before reacting:
- token cooldown or budget pause
- tool failure
- dependency unavailable
- state conflict or corruption
- ambiguous user request
- blocked scientific prerequisite

Different failure classes should trigger different recovery policies.

---

## Recovery Policies

Allowed future behaviors:
- retry with backoff
- resume after cooldown expiry
- restate or reissue an interrupted prompt
- switch execution lane while preserving context
- escalate to the user when ambiguity or risk is too high
- request a contrarian review before proceeding

Forbidden behaviors:
- hiding repeated failures
- silently dropping blocked work
- retrying forever without visibility
- converting a blocked scientific prerequisite into a fake success

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
