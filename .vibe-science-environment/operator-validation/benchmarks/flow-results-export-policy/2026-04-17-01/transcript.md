# flow-results-export-policy — 2026-04-17-01

- Benchmark: phase3-writing-deliverables
- Command: /flow-results
- Started: 2026-04-17T11:55:11.096Z
- Ended: 2026-04-17T11:55:11.142Z
- Elapsed seconds: 0.046
- Attempt: ATT-2026-04-17-11-55-11-102-826c7a66 (succeeded)

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
- .vibe-science-environment/results/experiments/EXP-507/figures/plots/results-507.png
- .vibe-science-environment/results/experiments/EXP-507/stats-appendix.md

## Assertions
- attempt-status: PASS
- required-writes: PASS
- forbidden-writes: PASS

## Metrics
- snapshot-publish-success: PASS (value=1)
- state-write-scope: PASS (value=1)
- attempt-lifecycle-completeness: PASS (value=1)

## Output Summary
- Summary: Results packaging regenerated shared export-policy evidence without owning truth.
- Warnings: No structured statistical details were provided during packaging. | Claim C-507 is not export-eligible yet: unverified_citations. | Claim C-507 is not export-eligible yet.
- Snapshot lastCommand: /flow-results
- Snapshot degradedReason: none
