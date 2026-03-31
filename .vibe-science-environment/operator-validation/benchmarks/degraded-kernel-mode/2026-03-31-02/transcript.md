# degraded-kernel-mode — 2026-03-31-02

- Benchmark: phase1-core
- Command: /flow-status
- Started: 2026-03-31T10:24:38.568Z
- Ended: 2026-03-31T10:24:38.614Z
- Elapsed seconds: 0.046
- Attempt: ATT-2026-03-31-10-24-38-575-54519239 (succeeded)

## Goal
Degrade honestly when kernel projections are unavailable and avoid fabricating kernel-derived state.

## Setup
- Workspace fixtures: 1
- Kernel db available: false
- Command input: none

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json

## Assertions
- attempt-status: PASS
- session-snapshot: PASS
- required-writes: PASS
- forbidden-writes: PASS
- degraded-reason-visible: PASS

## Metrics
- honesty-under-degradation: PASS (value=1)
- snapshot-publish-success: PASS (value=1)
- state-write-scope: PASS (value=1)
- attempt-lifecycle-completeness: PASS (value=1)

## Output Summary
- Summary: Kernel unavailable; resumed from flow-local state only.
- Warnings: bridge unavailable
- Snapshot lastCommand: /flow-status
- Snapshot degradedReason: bridge unavailable
