# Phase 2 Wave 3 — Packaging Runtime

**Goal:** Make experiment outputs packageable and findable without importing Phase 3 writing policy.

---

## Packaging Rule

Phase 2 packages evidence artifacts.

It does NOT:
- decide export eligibility
- create claim-backed writing exports
- backdoor `environment/lib/export-eligibility.js`

If a surface needs claim-backed export logic, it waits for Phase 3.

---

## WP-34 — Typed Bundle Manifest Helpers

Create the runtime helper surfaces needed for result bundles, for example:
- `environment/lib/bundle-manifest.js`

Responsibilities:
- validate bundle manifests against schema
- normalize raw `outputArtifacts` path strings into typed artifact entries
- require `path`, `type`, `role`, and `createdAt`

Acceptance:
- downstream code never depends on raw path strings alone
- bundle manifests always record `sourceAttemptId`
- malformed artifact entries fail honestly instead of being guessed

---

## WP-35 — Results Packaging Runtime

Create:
- `environment/flows/results.js`

Responsibilities:
- assemble `.vibe-science-environment/results/experiments/EXP-NNN/`
- write `analysis-report.md`
- write `stats-appendix.md`
- write `figure-catalog.md`
- write `bundle-manifest.json`
- record `relatedClaims`, `sourceAttemptId`, and `datasetHash`

Rules:
- runtime packaging is allowed
- truth certification is not
- reports separate evidence from prose

Acceptance:
- one completed experiment can be bundled reproducibly
- bundle paths are deterministic and inspectable
- no Phase 3 export logic is embedded here

---

## WP-36 — Figure Catalog And Session Digest

Implement the packaging outputs that make results understandable:
- per-figure purpose
- source artifact linkage
- caption
- interpretation

For `session digest export`:
- only implement after Wave 0 freezes the contract
- keep it operational, not truth-creating
- keep it separate from Phase 3 advisor-pack and writing-export surfaces

Acceptance:
- figure catalogs are richer than a file listing
- the quality bar forbids fabricated statistics
- session digest output follows the frozen contract exactly

---

## WP-37 — Experiment Result Findability

Update the outer-project surfaces that help a researcher find prior results fast.

Minimum scope:
- surface bundle locations from experiment-facing views
- preserve link from bundle back to experiment manifest and related claims
- keep blocked / dead-claim warnings visible without rewriting manifest truth

Acceptance:
- a researcher can find a past experiment bundle in under 1 minute
- findability does not depend on browsing raw directories manually
- bundle discovery remains outer-project state, not kernel truth

---

## WP-38A — `/flow-results` Command Shim

Create `commands/flow-results.md` as a thin entrypoint over `environment/flows/results.js` + shared middleware.

The shim follows the same pattern as `/flow-experiment`:
- detect CLI bridge
- route through middleware
- delegate packaging logic to the flow helper
- degrade honestly

If packaging runtime (WP-35) is not stable enough by end of Wave 3, defer this shim to Wave 4 with an explicit note — do not leave it silently absent.

---

## Parallelism

- WP-34 starts first
- WP-35 starts after the normalized bundle contract is stable
- WP-36, WP-37, and WP-38A can run in parallel once bundle output paths are fixed

---

## Exit Condition

Wave 3 is complete when Phase 2 has real experiment packaging runtime surfaces
with typed bundles, figure catalogs, and usable result findability.
