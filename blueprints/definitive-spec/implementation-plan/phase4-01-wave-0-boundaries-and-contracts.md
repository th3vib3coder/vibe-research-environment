# Phase 4 Wave 0 — Boundaries And Contracts

**Goal:** Freeze the Phase 4 state zones, schemas, bundle ownership, and
opening sequence before runtime code lands.

---

## WP-63 — Phase 4 Scope Freeze

Update the active planning surfaces so the repo has one current story:
- `IMPLEMENTATION-PLAN.md`
- `13-delivery-roadmap.md`
- `10-connectors.md`
- `11-automation.md`
- `12-domain-packs.md`
- `14-testing-strategy.md`

Acceptance:
- Phase 3 is explicitly closed in plan-entry documents
- Phase 4 is explicitly marked as the new active planning slice
- the opening sequence for connectors, automation, and domain packs is written down before any runtime work

---

## WP-64 — Connector Contracts

Freeze the Phase 4 connector contracts:
- `environment/schemas/connector-manifest.schema.json`
- `environment/schemas/connector-run-record.schema.json`
- `environment/install/bundles/connectors-core.bundle.json`

Freeze the machine-owned state zone:
- `.vibe-science-environment/connectors/`

Minimum contract fields:
- connector id
- connector direction (`import` or `export`)
- owned paths
- failure visibility surface
- last run / last health check metadata

Acceptance:
- every connector declares what it reads, writes, and forbids
- connector failures are modeled as visible records, not console-only output
- no connector contract claims authority over claim truth, citation truth, or gate truth

---

## WP-65 — Automation Contracts

Freeze the Phase 4 automation contracts:
- `environment/schemas/automation-definition.schema.json`
- `environment/schemas/automation-run-record.schema.json`
- `environment/install/bundles/automation-core.bundle.json`

Freeze the machine-owned state zone:
- `.vibe-science-environment/automation/definitions/`
- `.vibe-science-environment/automation/runs/`
- `.vibe-science-environment/automation/artifacts/`

Minimum contract fields:
- automation id
- trigger type (`command` or `scheduled`)
- command surface for manual rerun, even when host scheduling exists
- artifact path
- idempotency key or rerun guard where practical
- visible status (`ready`, `blocked`, `degraded`, `failed`)

Acceptance:
- every automation is command-runnable even if scheduling is unavailable
- invisible background mutation is impossible by contract
- automation contracts only describe summaries, reminders, packaging, or alerts

---

## WP-66 — Domain-Pack Contracts

Freeze the Phase 4 domain-pack contracts:
- `environment/schemas/domain-config.schema.json`
- `environment/schemas/domain-pack.schema.json`
- `environment/install/bundles/domain-packs-core.bundle.json`

Freeze the ownership split:
- repo-owned pack assets under `environment/domain-packs/`
- project-scoped activation under `.vibe-science-environment/domain-config.json`

Minimum contract fields:
- domain id
- display name
- supported workflows
- literature source presets
- experiment field presets
- report or deliverable template presets
- explicit non-authority statement

Acceptance:
- missing or invalid domain config fails closed to default behavior
- pack manifests declare what they support and what they do not modify
- no pack contract leaks into kernel hooks or kernel-owned semantics

---

## WP-67 — Shared Install And Lifecycle Freeze

Define install/lifecycle expectations for the three new bundles:
- install
- doctor
- repair
- uninstall
- upgrade

Acceptance:
- each new bundle has a future lifecycle owner before files land
- uninstall scope is bounded to owned paths only
- no Phase 4 bundle is allowed to claim paths already owned by Phase 1-3 bundles

---

## Parallelism

- WP-64, WP-65, and WP-66 can run in parallel once the scope freeze is accepted
- WP-67 starts after the bundle path inventory is frozen

---

## Exit Condition

Wave 0 is complete when connectors, automation, and domain packs each have
explicit machine-owned contracts, state zones, and lifecycle ownership with no
truth-semantic ambiguity.
