# orchestrator-continuity-modes — 2026-04-18-02

- Benchmark: phase5-orchestrator-mvp
- Command: /orchestrator-status
- Started: 2026-04-18T10:13:38.071Z
- Ended: 2026-04-18T10:13:38.330Z
- Elapsed seconds: 0.259
- Attempt: ATT-2026-04-18-10-13-38-268-16fee57c (succeeded)

## Goal
Prove that the continuity assembler produces usable profile, query, and full modes without auto-capture, and that query/full recall is helper-backed.

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json
- .vibe-science-environment/flows/index.json
- .vibe-science-environment/orchestrator/continuity-profile-history.jsonl
- .vibe-science-environment/orchestrator/continuity-profile.json
- .vibe-science-environment/orchestrator/lane-runs.jsonl
- .vibe-science-environment/orchestrator/router-session.json
- .vibe-science-environment/orchestrator/run-queue.jsonl
- .vibe-science-environment/results/summaries/DIGEST-ORCH-SESSION-CONTEXT/session-digest.json
- .vibe-science-environment/results/summaries/DIGEST-ORCH-SESSION-CONTEXT/session-digest.md

## Assertions
- attempt-status: PASS
- session-snapshot: PASS
- command-result: PASS
- required-writes: PASS
- forbidden-writes: PASS

## Metrics
- resume-latency: PASS (value=0.259)
- honesty-under-degradation: PASS (value=1)
- state-write-scope: PASS (value=1)
- attempt-lifecycle-completeness: PASS (value=1)
- snapshot-publish-success: PASS (value=1)

## Output Summary
- Summary: Assembled profile, query, and full continuity modes without mutating the profile during read.
- Warnings: none
- Snapshot lastCommand: /orchestrator-status
- Snapshot degradedReason: bridge unavailable
