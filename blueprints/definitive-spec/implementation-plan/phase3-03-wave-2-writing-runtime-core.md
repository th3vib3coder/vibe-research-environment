# Phase 3 Wave 2 — Writing Runtime Core

**Goal:** Build the runtime that turns validated state into writing handoff artifacts without creating new truth.

---

## WP-52 — `environment/flows/writing.js` Snapshot-First Runtime

Implement the core writing runtime in `environment/flows/writing.js`.

Responsibilities:
- create the frozen export snapshot first
- gather export-eligible claims through the shared helper
- separate claim-backed, artifact-backed, and free surfaces
- generate structured claim-backed seeds that carry `snapshotId`
- keep artifact-backed sections grounded in manifests and result bundles only

Rules:
- do not fabricate claim summaries when no canonical summary exists
- do not parse ad hoc markdown to invent truth-bearing fields
- free writing stays clearly marked as non-kernel-authoritative

Acceptance:
- every claim-backed artifact references `snapshotId`
- non-eligible claims never appear as validated findings
- artifact-backed sections trace to Phase 2 manifests and bundles only

---

## WP-53 — Phase 3 Extension Of Results Surfaces

Harden the existing results surfaces so they consume the shared export helper where needed.

This may include:
- making `/flow-results` or its runtime clearly distinguish validated claim-backed findings from artifact-backed material
- surfacing why a claim-linked result is not export-eligible yet
- exposing the frozen snapshot linkage when a writing handoff is built from packaged results

Scope rule:
- do not recreate bundle packaging
- do not move Phase 2 responsibilities back into Phase 3
- only add the shared export-policy seam and the resulting operator-visible distinctions

Acceptance:
- results and writing surfaces agree on export eligibility
- no second policy implementation appears inside results code

---

## WP-54 — Post-Export Safety Replay

Implement comparison logic between the frozen export snapshot and current projections.

Required alert classes:
- claim now killed
- claim now disputed
- citation now retracted or otherwise invalidated
- confidence materially changed after export

Rules:
- warnings are explicit and replayable
- warnings never auto-edit drafts
- comparison uses snapshot-vs-current state, not remembered prose

Acceptance:
- rerunning writing flow surfaces honest post-export warnings
- alert records carry enough context to trace back to the original snapshot and claim ids

---

## Parallelism

- WP-52 starts first
- WP-53 can run in parallel once the shared helper surface is stable
- WP-54 starts after snapshot and alert helpers exist

---

## Exit Condition

Wave 2 is complete when:
- snapshot-first writing runtime exists
- results and writing surfaces consume one export-policy helper
- post-export replay logic exists without mutating truth or prose automatically
