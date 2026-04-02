# flow-results-package — 2026-04-02-02

- Benchmark: phase2-memory-packaging
- Command: /flow-results
- Started: 2026-04-02T12:51:42.041Z
- Ended: 2026-04-02T12:51:42.104Z
- Elapsed seconds: 0.063
- Attempt: ATT-2026-04-02-12-51-42-048-6524f15d (succeeded)

## Goal
Create a typed experiment result bundle through /flow-results and persist the sourceAttemptId in the bundle manifest.

## Actual Writes
- .vibe-science-environment/control/attempts.jsonl
- .vibe-science-environment/control/capabilities.json
- .vibe-science-environment/control/events.jsonl
- .vibe-science-environment/control/session.json
- .vibe-science-environment/flows/index.json
- .vibe-science-environment/results/experiments/EXP-201/analysis-report.md
- .vibe-science-environment/results/experiments/EXP-201/bundle-manifest.json
- .vibe-science-environment/results/experiments/EXP-201/figure-catalog.md
- .vibe-science-environment/results/experiments/EXP-201/figures/plots/package-201.png
- .vibe-science-environment/results/experiments/EXP-201/stats-appendix.md
- .vibe-science-environment/results/experiments/EXP-201/tables/package-201.csv

## Assertions
- attempt-status: PASS
- session-snapshot: PASS
- command-result: PASS
- file:.vibe-science-environment/results/experiments/EXP-201/bundle-manifest.json: PASS
- file:.vibe-science-environment/results/experiments/EXP-201/analysis-report.md: PASS
- file:.vibe-science-environment/results/experiments/EXP-201/figure-catalog.md: PASS
- required-writes: PASS
- forbidden-writes: PASS
- degraded-reason-visible: PASS

## Metrics
- honesty-under-degradation: PASS (value=1)
- snapshot-publish-success: PASS (value=1)
- state-write-scope: PASS (value=1)
- attempt-lifecycle-completeness: PASS (value=1)

## Output Summary
- Summary: Packaged results for EXP-201 using workspace artifacts only.
- Warnings: none
- Snapshot lastCommand: /flow-results
- Snapshot degradedReason: bridge unavailable
