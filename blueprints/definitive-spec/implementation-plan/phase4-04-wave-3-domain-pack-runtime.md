# Phase 4 Wave 3 — Domain-Pack Runtime

**Goal:** Add project-scoped domain presets without changing core truth or flow
authority.

---

## WP-76 — Pack Registry, Loader, And Resolver

Add the shared pack runtime under `environment/domain-packs/`:
- `index.js`
- `loader.js`
- `resolver.js`

Responsibilities:
- load repo-owned pack manifests
- read `.vibe-science-environment/domain-config.json`
- resolve the active pack or cleanly fall back to default behavior

Acceptance:
- invalid or missing configs fail closed to default presets
- unknown pack ids never crash the flow runtime
- active pack metadata is available to operator-facing surfaces
- existing domain-config state is not silently overwritten without an explicit operator-facing override

---

## WP-77 — Safe Flow Integration Points

Add pack-aware integration only at preset boundaries:
- literature source presets
- experiment default fields
- result and writing template selection
- operator hints and confounder reminders

Acceptance:
- pack integration never changes middleware, export-policy, or kernel semantics
- pack-specific defaults are visible and inspectable
- flows remain runnable with no active pack

---

## WP-78 — First Reference Pack: `omics`

Build one production-grade reference pack under:
- `environment/domain-packs/omics/`

Minimum contents:
- literature source presets for omics work
- experiment field defaults for sequencing-oriented studies
- common confounder hints
- deliverable template presets relevant to omics work

Acceptance:
- the pack proves the runtime with a real domain
- pack content stays advisory or preset-oriented, never authoritative
- no pack asset writes outside owned paths

---

## WP-79 — Operator Surfacing Of Active Domain

Expose the active domain pack through existing summary paths.

Minimum surfaces:
- `/flow-status`
- pack-aware flow overviews where relevant

Acceptance:
- researchers can tell which pack is active
- pack activation is project-scoped and obvious
- missing pack activation remains a neutral default, not an error

---

## Parallelism

- WP-76 must land before WP-77 and WP-78
- WP-77 and WP-78 can run in parallel on the shared resolver
- WP-79 starts once active-pack metadata exists

---

## Exit Condition

Wave 3 is complete when the repo has a stable pack resolver, safe preset-only
flow integration, and one real reference pack that proves the model.
