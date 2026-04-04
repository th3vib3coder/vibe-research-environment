# 12 — Domain Packs

**Phase:** 4+ (deferred — designed now so Phases 1-3 don't block it)

---

## Purpose

Different research domains need different literature sources, artifact templates, report formats, and workflow emphasis. Domain packs provide variation without modifying the kernel.

---

## What Packs MAY Contain

| Content type | Example |
|-------------|---------|
| Literature source presets | "Use PubMed + bioRxiv for biomed; arXiv + OpenReview for ML" |
| Workflow templates | "Standard biomed experiment requires IRB reference field" |
| Report templates | "NeurIPS-style results section template" |
| Memory scaffolds | "Biomed project starts with Papers/, Protocols/, Datasets/" |
| Adapter presets | "Default Zotero collection structure for omics" |
| Advisory hints | "Common confounders in scRNA-seq: batch effect, dropout, cell-cycle" |
| Example commands | "Start a differential expression analysis" |

## What Packs MAY NOT Contain

| Forbidden | Why |
|-----------|-----|
| Modified gate semantics | Gates are kernel-owned, invariant A |
| Altered claim truth rules | Claims are kernel-owned |
| Altered citation truth rules | Citations are kernel-owned |
| Weakened stop behavior | Stop semantics are kernel-owned |
| Hidden core bypasses | Violates invariant C |
| Conditional runtime branching inside kernel hooks | Kernel hooks don't know about packs |

---

## Pack Activation

Packs are activated via `domain-config.json` in the project root:

```json
{
  "domain": "scrna-seq",
  "display_name": "Single-Cell RNA Sequencing",
  "literature_sources": ["PubMed", "bioRxiv", "GEO"],
  "report_template": "biomed-standard",
  "workflow_presets": {
    "default_experiment_fields": ["organism", "tissue", "cell_count", "sequencing_platform"],
    "common_confounders": ["batch_effect", "dropout_rate", "cell_cycle_phase"]
  }
}
```

**Location:** `.vibe-science-environment/domain-config.json` (NOT project root — keeps it in our state zone, not kernel's)
**Loaded by:** Outer-project commands and helpers at flow invocation time.
**NOT loaded by:** Kernel SessionStart. The kernel does NOT know about domain packs.
**Scope:** Project-scoped (one config per project), not global.
**Fallback:** If file missing, flows use default presets (no domain-specific behavior).
**Overwrite rule:** Activation is safe-by-default. If a domain config already exists, helpers must not silently replace it unless the caller explicitly opts into overwrite behavior.

---

## Pack Design Rule

Every pack MUST declare:
1. What domain assumptions it makes
2. What workflows it supports
3. What external connectors it expects
4. What artifacts it produces
5. What it does NOT modify in the core

## Phase 4 Opening Slice

Phase 4 should start with:
- pack registry and resolver runtime under `environment/domain-packs/`
- repo-owned pack manifests, templates, and presets under `environment/domain-packs/<pack>/`
- project-scoped activation from `.vibe-science-environment/domain-config.json`
- one reference production pack, `omics`, because it is specific enough to prove the model without changing truth semantics

Deliberately deferred from the opening slice:
- pack composition or inheritance chains
- connector-specific write privileges
- packs that alter automation permissions or kernel semantics
- more than one production-grade pack before the base resolver is proven stable

---

## Candidate Packs

| Pack | Domain | Key features |
|------|--------|-------------|
| `ml-research` | ML/AI | arXiv, OpenReview, hyperparameter tracking, GPU experiment fields |
| `biomed` | Biomedical | PubMed, clinical trial fields, IRB tracking, CONSORT checklist |
| `omics` | scRNA-seq, genomics | GEO, bioRxiv, batch effect confounders, cell-type fields |
| `causal-inference` | Causal methods | DAG templates, intervention fields, counterfactual tracking |

---

## Invariants

1. Packs change presets, not truth semantics
2. Kernel never knows about packs (no SessionStart auto-load)
3. Packs are project-scoped, not global
4. Every pack declares what it does NOT modify
5. No conditional runtime branching in kernel hooks based on domain
