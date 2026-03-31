# flow-experiment-register — 2026-03-31-02

- Benchmark: phase1-core
- Command: /flow-experiment --register
- Started: 2026-03-31T10:24:38.471Z
- Ended: 2026-03-31T10:24:38.531Z
- Elapsed seconds: 0.06
- Attempt: ATT-2026-03-31-10-24-38-479-d20b66c6 (succeeded)

## Goal
Create a manifest through the experiment flow and keep attempt lifecycle owned by middleware.

## Setup
- Workspace fixtures: 1
- Kernel db available: false
- Command input: provided

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json
- .vibe-science-environment/experiments/manifests/EXP-001.json
- .vibe-science-environment/flows/experiment.json
- .vibe-science-environment/flows/index.json

## Assertions
- attempt-status: PASS
- manifest: PASS
- flow-index: PASS
- required-writes: PASS
- forbidden-writes: PASS

## Metrics
- attempt-lifecycle-completeness: PASS (value=1)
- state-write-scope: PASS (value=1)
- snapshot-publish-success: PASS (value=1)

## Output Summary
- Summary: Registered manifest EXP-001.
- Warnings: none
- Snapshot lastCommand: /flow-experiment
- Snapshot degradedReason: bridge unavailable
