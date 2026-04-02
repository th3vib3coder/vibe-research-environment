# flow-status-results-findability — 2026-04-02-02

- Benchmark: phase2-memory-packaging
- Command: /flow-status
- Started: 2026-04-02T12:51:42.230Z
- Ended: 2026-04-02T12:51:42.288Z
- Elapsed seconds: 0.058
- Attempt: ATT-2026-04-02-12-51-42-239-595fa7fd (succeeded)

## Goal
Find a previously packaged experiment result bundle and linked session digest from operator-facing status surfaces in under one minute.

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json

## Assertions
- attempt-status: PASS
- session-snapshot: PASS
- command-result: PASS
- required-writes: PASS
- forbidden-writes: PASS

## Metrics
- resume-latency: PASS (value=0.058)
- snapshot-publish-success: PASS (value=1)
- state-write-scope: PASS (value=1)
- attempt-lifecycle-completeness: PASS (value=1)

## Output Summary
- Summary: Found packaged results for EXP-301 at .vibe-science-environment/results/experiments/EXP-301.
- Warnings: none
- Snapshot lastCommand: /flow-status
- Snapshot degradedReason: bridge unavailable
