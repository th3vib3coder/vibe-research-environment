# 09 — Install and Lifecycle

---

## Purpose

Define how the Vibe Research Environment is installed, updated, repaired, inspected, and uninstalled. Every install is reversible, inspectable, and lifecycle-managed.

**Source:** ECC's reversible install lifecycle, capability bundles, doctor/repair/uninstall patterns.

---

## Capability Bundles

The outer project is installable through capability bundles, not monolithic "install everything."

| Bundle | Contents | Phase |
|--------|----------|-------|
| `governance-core` | Outer-project validators, budget helpers, profile-aware behavior, compatibility checks for kernel governance prerequisites, evaluation-harness definitions | 1 |
| `control-plane` | Session snapshot, attempts ledger, telemetry stream, decision log, capability snapshot, query helpers, shared middleware | 1 |
| `flow-literature` | Literature flow command, templates, helpers, literature state schema | 1 |
| `flow-experiment` | Experiment flow command, manifest templates, experiment state/manifests schemas | 1 |
| `flow-results` | Results packaging, analysis bundle templates | 2 |
| `flow-writing` | Writing handoff, export snapshots, export record/alert schemas, advisor/rebuttal bundles | 3 |
| `memory-sync` | Memory layer, sync command, mirror templates | 2 |
| `connectors-core` | Connector contracts, one-way adapter substrate, connector health and run state | 4+ |
| `automation-core` | Automation contracts, run ledgers, digest/reminder substrate | 4+ |
| `domain-packs-core` | Domain-pack contracts, activation config, preset resolver substrate | 4+ |

`instinct-learning` is intentionally NOT installable in V1/V2. It requires its own dedicated spec covering storage, review states, sensitivity filtering, and lifecycle gates before it can join the install surface.

### Named Install Profiles (presets over bundles)

| Install Profile | Bundles included |
|----------------|-----------------|
| `core` | governance-core + control-plane |
| `researcher` | governance-core + control-plane + flow-literature + flow-experiment |
| `full` | All available bundles for current phase |

**Important:** Install profiles (what's installed) are INDEPENDENT from kernel governance mode (how strictly hooks fail when integrity degrades). A researcher can install the `full` bundle set and still run either the default kernel mode or `VIBE_SCIENCE_STRICT=1`. These two systems are orthogonal and do not affect each other.

Ownership note:
- the install lifecycle itself owns `.vibe-science-environment/.install-state.json` and `environment/schemas/install-state.schema.json`; these are mandatory repo infrastructure, not part of a removable capability bundle
- `control-plane` owns `.vibe-science-environment/control/` runtime state
- `control-plane` owns the shared flow substrate contracts: `environment/lib/flow-state.js`, `environment/schemas/flow-index.schema.json`, and `environment/templates/flow-index.v1.json`
- `governance-core` owns `environment/evals/` definitions and the workspace operator-validation artifact surface under `.vibe-science-environment/operator-validation/`
- `governance-core` also owns `.vibe-science-environment/governance/schema-validation/` for profile-safety validation artifacts
- `governance-core` also owns `.vibe-science-environment/metrics/` for budget and session-cost artifacts

### Bundle Manifest Contract

Each bundle is declared in:
- `environment/install/bundles/<bundle-id>.bundle.json`

Minimum shape:

```json
{
  "bundleId": "control-plane",
  "phase": 1,
  "dependsOn": ["governance-core"],
  "capabilitiesProvided": ["sessionSnapshot", "attemptLedger", "telemetry", "decisionLog", "capabilitySnapshot", "queryHelpers", "sharedMiddleware"],
  "ownedPaths": [
    "environment/control/session-snapshot.js",
    "environment/control/attempts.js",
    "environment/control/decisions.js",
    "environment/control/events.js",
    "environment/control/capabilities.js",
    "environment/control/middleware.js",
    "environment/control/query.js",
    "environment/lib/flow-state.js",
    "environment/schemas/session-snapshot.schema.json",
    "environment/schemas/capabilities-snapshot.schema.json",
    "environment/schemas/attempt-record.schema.json",
    "environment/schemas/event-record.schema.json",
    "environment/schemas/decision-record.schema.json",
    "environment/schemas/flow-index.schema.json",
    "environment/templates/session-snapshot.v1.json",
    "environment/templates/attempt-record.v1.json",
    "environment/templates/flow-index.v1.json"
  ],
  "bootstrapPaths": [
    ".vibe-science-environment/flows/",
    ".vibe-science-environment/control/"
  ]
}
```

This manifest is what `doctor`, `repair`, `uninstall`, and bundle-ownership
validators read. Without it, lifecycle commands are undefined.

The `governance-core` bundle MUST also own:
- `environment/lib/token-counter.js`
- `environment/lib/session-metrics.js`
- `environment/schemas/costs-record.schema.json`
- `environment/schemas/schema-validation-record.schema.json`
- `environment/evals/`
- `.vibe-science-environment/metrics/`
- `.vibe-science-environment/operator-validation/`
- `.vibe-science-environment/governance/schema-validation/`

The `flow-literature` bundle MUST also own:
- `environment/flows/literature.js`
- `environment/schemas/literature-flow-state.schema.json`
- `environment/templates/literature-flow-state.v1.json`

The `flow-experiment` bundle MUST also own:
- `environment/flows/experiment.js`
- `environment/lib/manifest.js`
- `environment/schemas/experiment-flow-state.schema.json`
- `environment/schemas/experiment-manifest.schema.json`
- `environment/templates/experiment-flow-state.v1.json`
- `environment/templates/experiment-manifest.v1.json`

The `memory-sync` bundle (Phase 2) starts by owning:
- `environment/schemas/memory-sync-state.schema.json`

Later Phase 2 waves extend it with:
- `environment/memory/sync.js`
- `commands/sync-memory.md`

The `flow-results` bundle (Phase 2) starts by owning:
- `environment/schemas/experiment-bundle-manifest.schema.json`
- `environment/templates/experiment-bundle-manifest.v1.json`
- `environment/schemas/session-digest.schema.json`

Later Phase 2 waves extend it with:
- `environment/lib/bundle-manifest.js`
- `environment/flows/results.js`
- `commands/flow-results.md`

The `flow-writing` bundle (Phase 3) starts by owning:
- `environment/schemas/export-snapshot.schema.json`
- `environment/schemas/export-record.schema.json`
- `environment/schemas/export-alert-record.schema.json`

Later Phase 3 waves extend it with:
- `environment/lib/export-eligibility.js`
- `environment/lib/export-snapshot.js`
- `environment/lib/export-records.js`
- `environment/flows/writing.js`
- `environment/flows/writing-render.js`
- `environment/flows/writing-overview.js`
- `environment/flows/writing-pack-render.js`
- `environment/flows/writing-packs.js`
- `commands/flow-writing.md`

Its bootstrap surface also owns:
- `.vibe-science-environment/writing/exports/`
- `.vibe-science-environment/writing/advisor-packs/`
- `.vibe-science-environment/writing/rebuttal/`

The `connectors-core` bundle (Phase 4) starts by owning:
- `environment/schemas/connector-manifest.schema.json`
- `environment/schemas/connector-run-record.schema.json`

Later Phase 4 waves extend it with:
- `environment/connectors/manifest.js`
- `environment/connectors/registry.js`
- `environment/connectors/health.js`
- `environment/connectors/filesystem-export.js`
- `environment/connectors/obsidian-export.js`
- `environment/connectors/manifests/filesystem-export.connector.json`
- `environment/connectors/manifests/obsidian-export.connector.json`

Its bootstrap surface also owns:
- `.vibe-science-environment/connectors/`

The `automation-core` bundle (Phase 4) starts by owning:
- `environment/schemas/automation-definition.schema.json`
- `environment/schemas/automation-run-record.schema.json`

Later Phase 4 waves extend it with:
- `environment/automation/definitions.js`
- `environment/automation/run-log.js`
- `environment/automation/artifacts.js`
- `environment/automation/builtin-plans.js`
- `environment/automation/plan-render.js`
- `environment/automation/runtime.js`
- `environment/automation/definitions/weekly-research-digest.automation.json`
- `environment/automation/definitions/stale-memory-reminder.automation.json`
- `environment/automation/definitions/export-warning-digest.automation.json`
- `commands/weekly-digest.md`
- `commands/stale-memory-reminder.md`
- `commands/export-warning-digest.md`
- `commands/automation-status.md`

Its bootstrap surface also owns:
- `.vibe-science-environment/automation/definitions/`
- `.vibe-science-environment/automation/runs/`
- `.vibe-science-environment/automation/artifacts/`

The `domain-packs-core` bundle (Phase 4) starts by owning:
- `environment/schemas/domain-config.schema.json`
- `environment/schemas/domain-pack.schema.json`

Later Phase 4 waves extend it with:
- `environment/domain-packs/index.js`
- `environment/domain-packs/loader.js`
- `environment/domain-packs/resolver.js`
- `environment/domain-packs/omics/pack.domain-pack.json`

Project-scoped activation still lives at:
- `.vibe-science-environment/domain-config.json`

Wave 0 rule:
- the activation file is created on first pack selection, not during base install bootstrap
- repo-owned pack assets remain under `environment/domain-packs/`

---

## Install State

Every install writes durable state tracking what was installed:

```json
{
  "schemaVersion": "vibe-env.install.v1",
  "installedAt": "2026-03-29T10:00:00Z",
  "bundles": ["governance-core", "control-plane", "flow-literature", "flow-experiment"],
  "bundleManifestVersion": "1.0.0",
  "operations": [
    {
      "kind": "copy-file",
      "source": "environment/templates/session-snapshot.v1.json",
      "destination": ".vibe-science-environment/control/session.json",
      "bundleId": "control-plane",
      "ownership": "managed",
      "mode": "copied",
      "sourceHash": "sha256:...",
      "installedHash": "sha256:...",
      "backupRef": null
    }
  ],
  "source": {
    "version": "1.0.0",
    "commit": "abc123"
  }
}
```

**Location:** `.vibe-science-environment/.install-state.json`
**Schema:** `environment/schemas/install-state.schema.json`

Required per managed path:
- source hash
- installed hash
- operation mode (`copied`, `generated`, `merged`)
- backup reference when prior content was overwritten
- owning bundle

---

## Lifecycle Commands

### `doctor`

Check installation health:
- Are all managed files present?
- Do file contents match expected state?
- Is the kernel reachable (core-reader functional)?
- Are templates in sync with source?
- Are control-plane schemas valid and writable?

Output: health report with `ok`, `warning`, or `error` per check.

### `repair`

Fix broken installations:
- Restore missing managed files from templates
- Re-apply configuration merges
- Do NOT overwrite user modifications to non-managed files

### `uninstall`

Clean removal:
- Remove managed files tracked in install-state
- Restore any previous content that was backed up
- Remove install-state file
- Leave kernel completely untouched

---

## Update Strategy

When the Vibe Research Environment ships a new version:

1. Run `doctor` to assess current state
2. Compare installed bundles against new version's manifest
3. Apply only changed files (incremental, not full reinstall)
4. Update install-state with new version info
5. Run `doctor` again to verify

**Rule:** Updates NEVER touch kernel files. Only outer-project managed files.

---

## Testing Strategy for Install

| Test | What it checks |
|------|---------------|
| Fresh install on empty workspace | All templates created, install-state written |
| Fresh install writes control-plane state | `control/session.json` and capability snapshot bootstrapped |
| Install with existing flow state | Does NOT overwrite existing experiment manifests |
| Doctor on healthy install | Reports `ok` for all checks |
| Doctor on corrupted install | Reports `error` for missing files |
| Repair restores missing files | Missing template recreated from source |
| Uninstall removes managed files | All managed files gone, kernel untouched |
| Upgrade from v1.0 to v1.1 | Changed files updated, unchanged files preserved |

---

## V1 Simplification

For V1 incubation (same repo), the install lifecycle is simpler:
- No separate `npm install` or package management
- Templates live in `environment/templates/`
- Flow commands and control-plane helpers bootstrap on first run (create dirs, copy templates)
- Install-state tracking still applies
- `doctor`/`repair` MUST already work for managed workspace state and templates
- full cross-repo upgrade and richer bundle rollout activate after repo split

The full install lifecycle (bundles, versioned updates, cross-repo install) activates when the project moves to a separate repo.

---

## Invariants

1. Every install is reversible (uninstall restores previous state)
2. Install state is durable and inspectable (JSON file)
3. Doctor/repair/uninstall are always available
4. Updates are incremental, not full reinstall
5. Install NEVER touches kernel files
6. User modifications to non-managed files are preserved
7. Only paths owned by exactly one bundle may be installed or removed
