# flow-results-export-policy - 2026-04-03-01

- Benchmark: phase3-writing-deliverables
- Command: /flow-results
- Started: 2026-04-03T11:30:00Z
- Ended: 2026-04-03T11:30:10Z
- Attempt: ATT-2026-04-03-11-30-00-507-99997777 (succeeded)

## Goal
Prove the results surface consumes the same export-policy helper as writing by surfacing blocked claim export readiness honestly.

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json
- .vibe-science-environment/flows/index.json
- .vibe-science-environment/results/experiments/EXP-507/analysis-report.md
- .vibe-science-environment/results/experiments/EXP-507/bundle-manifest.json
- .vibe-science-environment/results/experiments/EXP-507/figure-catalog.md

## Assertions
- attempt-status: PASS
- session-snapshot: PASS
- command-result: PASS
- required-writes: PASS
- forbidden-writes: PASS

## Output Summary
- Summary: Results packaging surfaced the same export-policy block that writing would enforce.
- Warnings: Claim-linked result for C-507 is not export-eligible yet (unverified_citations).
- Snapshot lastCommand: /flow-results
- Snapshot currentStage: result-packaging

