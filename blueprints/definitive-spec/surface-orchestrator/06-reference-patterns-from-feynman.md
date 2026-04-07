# Surface Orchestrator Layer — Reference Patterns from Feynman

---

## Purpose

Capture what is worth adopting from
`https://github.com/getcompanion-ai/feynman` without importing weaker
assumptions into VRE or the future orchestrator.

This is a **design filter for pre-planning**, not an implementation plan.

It exists to:
- extract useful product-shell patterns
- identify specific risks in those patterns
- map the useful parts onto our architecture
- sharpen what a future orchestrator Phase 0 must freeze

It does not:
- assign work packages
- authorize implementation by itself
- override kernel or VRE contracts

---

## Main Conclusion

Feynman does **not** change our core architecture.

It confirms that the split we already have is still correct:
- `vibe-science` stays the truth and governance kernel
- VRE stays the research operating system
- the missing layer is a stronger northbound orchestrator shell

So the real value of this comparison is not "make VRE more like Feynman."

The real value is:
- validate that a strong operator shell is worth building
- identify which northbound features should be first-class
- identify which convenience patterns become dangerous if they gain truth
  authority

---

## Concrete Decisions Feynman Improves

Feynman mostly confirms a direction we already had, but it sharpens three
planning decisions.

### 1. The Shell Is Product, Not Polish

Setup, doctor, status, capability browsing, and artifact browsing should not be
treated as cleanup after the runtime exists. They are part of the real product
surface.

### 2. Recall / Resume Is Core

Resumable work, searchable prior artifacts, and continuity across sessions
should be part of the base orchestrator contract, not an optional add-on.

### 3. Lane Policy Must Be Explicit

Per-lane model and autonomy policy is an architectural choice, not a UI detail.
The future orchestrator should own:
- lane roles
- model routing
- cost ceilings
- escalation thresholds

---

## Where VRE Already Owns The Ground

The orchestrator must add usability and supervision without duplicating VRE.

| Area | VRE already owns | Orchestrator would add | Boundary |
|------|------------------|------------------------|----------|
| lifecycle health | install bundles, doctor, repair, capability state | one shell that summarizes VRE plus queue/lane/channel state | VRE stays authoritative for runtime integrity |
| status | `/flow-status`, control snapshot, degraded-mode surfacing | queue, lane, escalation, recovery, and delivery state | orchestrator reads VRE status, not replace it |
| recall | memory mirrors, marks, sync state | cross-session recall over runs, artifacts, and queue history | recall stays historical, not canonical |
| writing/export safety | export eligibility, snapshots, alerts, packs | northbound tasks such as `draft`, `review`, `report` | orchestrator may route and package, never redefine export policy |
| automation | reviewable digests, run ledgers, artifacts | operator-facing watch/monitor semantics and escalation | orchestrator consumes automation state |
| connectors | low-risk adapters and visible failures | channel routing and delivery | connector truth boundaries remain in VRE |

---

## Feynman Patterns Worth Adopting

### A. First-Class Operator Shell

Reference surfaces:
- `src/cli.ts`
- `src/setup/doctor.ts`

Adoption meaning for us:
- one top-level shell above VRE
- one place to see readiness, degraded state, lanes, and channel health

### B. Artifact Browser

Reference surface:
- `extensions/research-tools/project.ts`

Adoption meaning for us:
- one read-only browser for outputs, packs, digests, reports, and review
  artifacts
- strong discoverability before starting a new run

### C. Session Recall And Resume

Reference surfaces:
- `skills/session-search/SKILL.md`
- session-search package behavior

Adoption meaning for us:
- search prior runs, queues, and artifacts quickly
- resume from durable state instead of rebuilding context from scratch

### D. Northbound Workflow Catalog

Reference surfaces:
- `prompts/deepresearch.md`
- `prompts/lit.md`
- `prompts/audit.md`
- `prompts/watch.md`

Adoption meaning for us:
- explicit operator tasks such as `review`, `audit`, `compare`, `draft`, and
  `watch`
- routing from those tasks into declared VRE surfaces and review lanes

### E. Specialist Lanes

Reference surfaces:
- `.feynman/agents/researcher.md`
- `.feynman/agents/reviewer.md`
- `.feynman/agents/verifier.md`

Adoption meaning for us:
- bounded lanes for evidence, synthesis, challenge, and verification
- clearer role separation than one undifferentiated assistant loop

### F. Lane Model Policy

Reference surface:
- `extensions/research-tools/feynman-model.ts`

Adoption meaning for us:
- durable model / cost / autonomy policy per lane
- explicit ownership of that policy inside the orchestrator

---

## What We Must Not Import

These are tied to concrete Feynman patterns, not just our own generic values.

| Risk source | Risk | Our response |
|-------------|------|--------------|
| `.feynman/SYSTEM.md`, prompt files, agent instructions | safety largely prompt-governed | keep schemas, validators, ownership zones, saved evidence, and closeout discipline below the orchestrator |
| `prompts/deepresearch.md`, `prompts/lit.md` | planning, evidence, verification, and delivery can blur into one workflow shell | keep modes explicit and preserve verified vs speculative state |
| session-search surfaces | recall could drift into implicit authority | recall is historical context; current validated state still comes from VRE |
| `prompts/watch.md` and background behavior | scheduled work could slide into hidden direction-setting | watch/monitor must stay bounded by explicit escalation and delivery rules |
| `review`, `audit`, verifier-style workflows | review artifacts can be mistaken for truth artifacts | keep review outputs attributable, non-canonical, and separately logged |

---

## Questions Phase 0 Must Freeze

1. What exactly is the split between orchestrator status and VRE
   `/flow-status`?
2. When recall disagrees with current VRE state, which one wins?
3. How does orchestrator-provided continuity context coexist with kernel/host
   injection?
4. Who owns lane model, autonomy, and cost ceilings?
5. How do `review`, `audit`, `draft`, `compare`, and `watch` map to stable
   southbound VRE contracts?

---

## Priority Rules

### Priority 1

Build capabilities first if they:
- materially improve operator continuity or control
- are mostly composable on top of current VRE contracts
- are useful without hidden autonomy

This points first to:
- operator shell
- artifact browser
- recall / resume
- northbound workflow routing
- lane model policy

### Priority 2

Build later if they:
- improve usability or monitoring
- depend on Priority 1 contracts already existing
- add presentation or scheduling complexity more than epistemic value

This includes:
- preview pipeline
- watch / monitor delivery surfaces
- external review trace browsing

### Priority 3

Delay capabilities that:
- materially increase autonomy
- increase package and integration complexity sharply
- add convenience without strengthening operator control first

This includes:
- broad autonomous loops
- large plugin-marketplace behavior
- weakly bounded convenience surfaces

---

## Final Reading

Feynman gives us useful pressure, but not a new inner architecture.

The right adoption path is:
- keep kernel and VRE rigor exactly where it is
- lift the best shell and coordination ideas into the future orchestrator
- refuse any shortcut that turns convenience into hidden epistemic authority
