# Phase 7 Wave 3 — Three-Tier Writing Enforcement

**Goal:** Replace the prose-only three-tier distinction
(`writing-render.js:18,24,35`) with a schema-enforced, validator-guarded
data boundary. Upgrade F-13 from PARTIAL to PASS by making the tiers a
structural contract rather than three markdown headers the researcher can
silently cross-pollute.

---

## Scope Rule

Wave 3 ships: one new schema (`writing-seed-block.schema.json`); one
surgical edit to `writing-render.js` + `writing.js` (tier-scoped seeds
in a tier-subdirectory layout); one runtime enforcer
(`writing-tier-enforcer.js`) with typed errors; one CI validator
(`validate-three-tier-writing.js`); one Wave 5 prep package for F-13.

Wave 3 does **not** rewrite `buildWritingHandoff` surrounding logic
(Phase 5.5 WP-120/121 remain authoritative); touch kernel-side code;
migrate historical seeds (see Open Questions); change citation/claim
truth semantics; add a new top-level folder under `environment/`.

Wave 3 depends on: Wave 0 WP-179 (three-tier data contract frozen) and
Phase 5.5 WP-120/121 (snapshot immutability — fresh snapshotIds on
every rerun let the layout evolve per-snapshotId without stranding
old content).

---

## WP-196 — Structured Three-Tier Schema

Create `environment/schemas/writing-seed-block.schema.json`. Every seed
file opens with a YAML frontmatter block; `writing-tier-enforcer.js`
parses it, the CI validator verifies it.

**Directory layout change** (per WP-179):

```
.vibe-science-environment/writing/exports/seeds/<snapshotId>/
  claim-backed/<blockId>.md
  artifact-backed/<blockId>.md
  free/<blockId>.md
```

The `<tier>` subdirectory is new; pre-Wave-3 snapshots wrote
`<snapshotId>/<claimId>.md` flat. New snapshots only write the nested
layout.

**Full schema body**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "vibe-env/writing-seed-block.schema.json",
  "title": "VRE Writing Seed Block (Tier-Scoped)",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "blockId", "snapshotId", "tier", "createdAt"],
  "properties": {
    "schemaVersion": { "const": "vibe-env.writing-seed-block.v1" },
    "blockId":    { "type": "string", "pattern": "^WSB-[A-Za-z0-9_-]+$" },
    "snapshotId": { "type": "string", "pattern": "^WEXP-.+$" },
    "createdAt":  { "type": "string", "format": "date-time" },
    "tier":       { "enum": ["claim-backed", "artifact-backed", "free"] },
    "claimRefs":    { "type": "array", "items": { "type": "string", "pattern": "^C-[0-9]{3}$" } },
    "artifactRefs": { "type": "array", "items": { "type": "string", "minLength": 1 } },
    "note":         { "type": "string" }
  },
  "oneOf": [
    {
      "properties": {
        "tier": { "const": "claim-backed" },
        "claimRefs": { "type": "array", "minItems": 1,
          "items": { "type": "string", "pattern": "^C-[0-9]{3}$" },
          "uniqueItems": true }
      },
      "required": ["claimRefs"],
      "not": { "anyOf": [ { "required": ["artifactRefs"] } ] }
    },
    {
      "properties": {
        "tier": { "const": "artifact-backed" },
        "artifactRefs": { "type": "array", "minItems": 1,
          "items": { "type": "string", "minLength": 1 },
          "uniqueItems": true }
      },
      "required": ["artifactRefs"],
      "not": { "anyOf": [ { "required": ["claimRefs"] } ] }
    },
    {
      "properties": { "tier": { "const": "free" } },
      "not": { "anyOf": [ { "required": ["claimRefs"] }, { "required": ["artifactRefs"] } ] }
    }
  ]
}
```

**Edge cases handled**: empty `claimRefs` → rejected by `minItems: 1`;
duplicate entries → rejected by `uniqueItems: true`; killed/disputed
claims → schema only gates *shape*, so WP-199 runtime enforcer
additionally rejects any `claimRef` whose lifecycle is KILLED/DISPUTED
(schema-legal but violates the claim-backed contract).

**Six implementation questions**: (1) enter via JSON file + Ajv loader;
(2) state at `environment/schemas/writing-seed-block.schema.json`;
(3) read by WP-199 enforcer and WP-198 validator; (4) written by humans;
(5) validated via `tests/schemas/` self-tests (`schemaTests: 39 → 40`);
(6) degrades loudly — Ajv compile failure crashes CI; not kernel-facing.

---

## WP-197 — Emit Tier-Scoped Seeds From `writing.js` + `writing-render.js`

Replace the markdown-header-only three-tier rendering with per-tier
seed files. The Phase 5.5 WP-120/121 code (snapshot immutability, atomic
hard-link publish) is preserved verbatim.

**Current lines being replaced** (quoted from
`environment/flows/writing-render.js`):

```javascript
 18:    '## Claim-Backed Facts',
 24:    '## Artifact-Backed Context',
 35:    '## Free-Writing Boundary',
```

Today these three headers live in one `<claimId>.md` file per seed.
`renderClaimBackedSeed` is called once per eligible claim and the result
is published to `seeds/<snapshotId>/<claimId>.md` via
`writing.js:112-126`.

**After WP-197** — `renderClaimBackedSeed` is decomposed into three
tier-specific builders, each returning `{frontmatter, body}`. Unified
pseudocode (one signature per tier):

```javascript
// writing-render.js (NEW)
function baseFrontmatter(snapshot, claim, tier) {
  return {
    schemaVersion: 'vibe-env.writing-seed-block.v1',
    blockId: `WSB-${claim.claimId}-${tier === 'claim-backed' ? 'claim' :
              tier === 'artifact-backed' ? 'artifact' : 'free'}`,
    snapshotId: snapshot.snapshotId,
    createdAt: snapshot.createdAt,
    tier,
  };
}

export function renderClaimBackedBlock(snapshot, claim, opts) {
  return { frontmatter: { ...baseFrontmatter(snapshot, claim, 'claim-backed'),
                          claimRefs: [claim.claimId] },
           body: renderClaimBackedFacts(opts.claimHead, claim)
                 + renderCitations(opts.citations) };
}
export function renderArtifactBackedBlock(snapshot, claim, opts) {
  const artifactRefs = opts.manifests
    .flatMap(m => [m.manifestPath, ...(m.outputArtifacts || [])]).filter(Boolean);
  if (artifactRefs.length === 0) return null;  // no artifact evidence = no block
  return { frontmatter: { ...baseFrontmatter(snapshot, claim, 'artifact-backed'),
                          artifactRefs },
           body: renderArtifactBackedContext(opts.manifests, opts.resultBundles) };
}
export function renderFreeBlock(snapshot, claim) {
  return { frontmatter: baseFrontmatter(snapshot, claim, 'free'),
           body: FREE_WRITING_BOUNDARY_MARKDOWN };  // the old 4-bullet guidance
}
```

**`writing.js:98-148` surgical change** — inside the `for (const claim
of snapshot.claims)` loop, replace the single `writeTextOnce(artifact
Path, content)` with a three-file loop: build each block, call
`assertTierBlock` (WP-199) at write-time, resolve the tier subdir path
(`seeds/<snapshotId>/<tier>/<blockId>.md`), serialize as YAML
frontmatter fence + markdown body, and call `writeTextOnce`. Example
serialization for C-014:

```
---
schemaVersion: vibe-env.writing-seed-block.v1
blockId: WSB-C-014-claim
snapshotId: WEXP-2026-04-17-abc12345
tier: claim-backed
claimRefs: [C-014]
---
(body markdown)
```

**Export-record change** — `appendExportRecord` now receives
`artifactPath` = the **claim-backed** block path (still the primary
evidence surface for drift replay), not a single-seed-per-claim path.
This preserves existing replay semantics (replay keys on
`(snapshotId, claimId)`) because the claim-backed block path is still
`1:1` with `claimId`.

**Backwards compatibility**: Phase 5.5 WP-120/121 makes snapshotIds
non-reusable (every rerun mints a fresh `WEXP-...`), so pre-Wave-3
flat seed directories stay readable on disk and post-Wave-3 ones write
the nested layout; mixed on-disk state is safe because layout is keyed
per-snapshotId. `readExportSnapshots` (`writing.js:411`) reads snapshot
JSONs, not seed files, so alert replay is untouched. The validator
discriminates layouts by presence of any tier subdirectory under
`<snapshotId>/`; absence → disclosed `legacy-layout` skip.

**Six implementation questions**: (1) enter via existing
`buildWritingHandoff` command path; (2) state is tier-scoped block
files on disk (new layout); (3) read by humans + WP-198 validator;
(4) written by `buildWritingHandoff` via `writeTextOnce`;
(5) validated via extended `writing-seeds-immutable.test.js` + new
`writing-tier-blocks.test.js` (`flowTests: 8 → 9`); (6) degrades
via existing `removeSeedRootIfEmpty(seedRoot)` cleanup path at
`writing.js:83` — Phase 5.5's fail-fast surface is reused.

---

## WP-198 — CI Validator: `validate-three-tier-writing.js`

New validator at `environment/tests/ci/validate-three-tier-writing.js`.
Registered in `run-all.js`; `ciValidators` count bumped `11 → 12` in
`validate-counts.js`.

**Behavior**:
1. Walk `.vibe-science-environment/writing/exports/seeds/*/`.
2. For each `<snapshotId>/`, detect layout: nested (has any of
   `claim-backed/` `artifact-backed/` `free/`) → validate in full;
   flat (only `<claimId>.md`) → record disclosed `legacy-layout` skip.
3. For each `<tier>/<blockId>.md`: parse YAML frontmatter fence (error
   on malformed); validate against `writing-seed-block.schema.json`
   (Ajv); assert subdirectory name equals `frontmatter.tier` (guards
   against a file misplaced under the wrong tier subdir).
4. **Claim-ref full mode**: attempt kernel-bridge load via
   `environment/orchestrator/_io.js` helpers (shipped by Phase 6; Wave 0
   confirms availability); if it loads, reject any `claimRef` that is
   unknown OR resolves to `KILLED`/`DISPUTED`.
5. **Claim-ref degraded mode**: if kernel-bridge absent or throws,
   fall back to a `claimExportStatuses` override argument (Phase 5.5
   WP-124 pattern — `{claimId, statusAtExport, eligible}` objects
   sourced from the most recent `phase3-operator-validation.json` OR a
   test fixture). If neither is available, emit a disclosed partial
   (`status: "partial", reason: "no-claim-source-available"`) and fail
   CI unless invoked with `--allow-degraded-claim-refs` (local-dev-only
   escape hatch; CI keeps it false).
6. **Artifact-ref**: every ref must `fs.stat` under `projectRoot`;
   `..` escapes rejected; symlinks resolved then re-checked for
   still-inside-root.
7. **Free-block**: schema already forbids refs; validator additionally
   greps the body for `C-[0-9]{3}` and emits a WARN (not FAIL) to
   surface laundering attempts.

**Contract alignment to WP-179**: WP-179 says "validator enforces every
claim-backed file has at least one `claimRef` that exists in the
project's claim-ledger". WP-198 meets that literally for claim
existence, and strengthens it: a ref that exists but is KILLED/DISPUTED
also fails — otherwise the three-tier boundary leaks. This is a tightening
of WP-179, not a violation; Wave 0 open questions noted
"should killed/disputed refs be rejected?" — WP-198 answers YES.

**Six implementation questions**: (1) enter via `npm run check` →
`run-all.js`; (2) state is seed files + kernel-bridge OR override;
(3) read by CI runner (and chained by WP-140 closeout validator in
Wave 5); (4) writes nothing to disk, only validator-report text;
(5) validated via `validate-three-tier-writing.test.js` with positive,
wrong-tier-mix, killed-claim, absent-artifact, and degraded-mode
fixtures; (6) degrades to `claimExportStatuses` override when kernel-
bridge is absent, and to a disclosed partial (loud, not silent) when
both are absent.

---

## WP-199 — Runtime Enforcer: `writing-tier-enforcer.js`

New module at `environment/lib/writing-tier-enforcer.js`. Used by
WP-197 at write-time (fail-fast) and by WP-198 at CI-time (regression
guard). Two-way reuse keeps the contract in one place.

**Exports**:

```javascript
export class WritingTierValidationError extends Error {
  constructor(message, { tier, reason, blockId }) {
    super(message);
    this.name = 'WritingTierValidationError';
    this.tier = tier;     // 'claim-backed' | 'artifact-backed' | 'free'
    this.reason = reason; // 'missing-refs' | 'killed-claim' | 'disputed-claim' |
                          // 'unknown-claim' | 'unresolved-artifact' |
                          // 'extraneous-refs' | 'malformed-frontmatter'
    this.blockId = blockId;
  }
}

export function assertClaimBackedBlock({ frontmatter, claimLedger });
// throws if: tier mismatch; claimRefs missing/empty/duplicated; any
// claimRef not in claimLedger (unknown-claim); any claimRef with
// currentStatus KILLED/DISPUTED (killed-claim/disputed-claim);
// artifactRefs present (extraneous-refs).

export function assertArtifactBackedBlock({ frontmatter, projectRoot });
// throws if: tier mismatch; artifactRefs missing/empty/duplicated; any
// artifactRef does not fs.stat() under projectRoot (unresolved-artifact);
// claimRefs present (extraneous-refs).

export function assertFreeBlock({ frontmatter });
// throws if: tier mismatch; claimRefs or artifactRefs present
// (extraneous-refs).

export function assertTierBlock(args);
// dispatcher on frontmatter.tier; calls one of the above.
```

`claimLedger` shape is the `projections.claimStatuses` array already
produced by `loadCurrentProjections` in `writing.js:238-248`. No new
shape, no new reader.

**Six implementation questions**: (1) enter via synchronous call from
`writing.js` (write-time) or `validate-three-tier-writing.js` (CI-time);
(2) no persistent state — pure function over input; (3) reads only its
own arguments; (4) writes nothing; (5) validated via
`writing-tier-enforcer.test.js` covering 3 happy × 4 failure modes per
tier (`libTests: 20 → 21`); (6) degrades by throwing typed error —
caller decides (WP-197 cleans up half-written snapshot dir; WP-198
records FAIL). No silent recovery.

---

## WP-200 — Closeout Upgrade Preparation For F-13

Wave 3 does not edit `phase3-closeout.md` — that is Wave 5's
responsibility. WP-200 produces the exact material Wave 5 will drop in.

**Current `phase3-closeout.md:75`** (quoted verbatim):

```
| 8 | three-tier writing distinction has runtime-enforced data boundaries | PARTIAL | [writing-render.js](../../../environment/flows/writing-render.js), [phase3-operator-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase3-operator-validation.json); follow-up FU-55-003 |
```

**Proposed PASS replacement** (to land in Wave 5):

```
| 8 | three-tier writing distinction has runtime-enforced data boundaries | PASS | [writing-seed-block.schema.json](../../../environment/schemas/writing-seed-block.schema.json), [writing-tier-enforcer.test.js](../../../environment/tests/lib/writing-tier-enforcer.test.js), [validate-three-tier-writing.js](../../../environment/tests/ci/validate-three-tier-writing.js); FU-55-003 retired in Phase 7 Wave 3 |
```

**Conditional**: PASS is only honest if the negative-case test is
airtight. WP-200's airtight-test requirement:
`writing-tier-enforcer.test.js` MUST include a case where a
claim-backed block is handed a KILLED claim, AND the test asserts
`WritingTierValidationError` with `reason: 'killed-claim'`. Without
this, the three-tier boundary does not actually block the exact failure
mode Phase 3 set out to prevent (a killed finding leaking into
Results).

**If the negative-case test does NOT land in Wave 3** (e.g. implementation
slips): the Wave 5 closeout MUST stay PARTIAL with the following text
instead:

```
| 8 | three-tier writing distinction has runtime-enforced data boundaries | PARTIAL | schema + runtime enforcer shipped (Phase 7 Wave 3) but the killed-claim-in-claim-backed negative test did not land; the boundary is structural but not yet proven against the exact failure mode Phase 3 set out to prevent. FU-7-003 tracks the missing test. |
```

**Evidence manifest** (what Wave 5 cites): schema
`writing-seed-block.schema.json` (WP-196); enforcer
`lib/writing-tier-enforcer.js` (WP-199); validator
`tests/ci/validate-three-tier-writing.js` (WP-198); unit test
`tests/lib/writing-tier-enforcer.test.js` (airtight killed-claim case);
integration test `tests/flows/writing-tier-blocks.test.js` (three
tier-scoped files per eligible claim).

**FU-55-003 retirement plan**: if WP-196..WP-199 ship AND the airtight
killed-claim test lands — FU-55-003 retires; if structure-only ships —
FU-55-003 is replaced by narrower FU-7-003 (just the negative-case
test). Wave 5 MUST NOT silently drop FU-55-003; retirement requires
an explicit "retired by Phase 7 WP-200" line in `## Follow-Up Register`.

**Honesty language** (drop-in for Wave 5 correction note):

> Phase 7 Wave 3 replaced the markdown-header-only three-tier rendering
> with a schema-enforced, validator-guarded data boundary. The schema
> requires explicit `tier` on every seed block and rejects cross-tier
> ref contamination via `oneOf`. The runtime enforcer throws
> `WritingTierValidationError` at write-time when a claim-backed block
> references a killed or disputed claim; the CI validator regression-
> guards the same invariants. Gate 8 upgrades PARTIAL → PASS.
> FU-55-003 is retired.

**Six implementation questions**: (1) enter via Wave 5 editor copying
this prep into `phase3-closeout.md`; (2) state is the prep text here
until Wave 5 lands; (3) read by Wave 5 author + `validate-closeout-
honesty.js` post-edit; (4) written when the Wave 5 author edits
`phase3-closeout.md:75`; (5) validated via `validate-closeout-
honesty.js` against the new PASS row (schema, enforcer, validator all
on disk); (6) degrades by staying PARTIAL with FU-7-003 if the airtight
test slips — no silent PASS.

---

## Parallelism

- WP-196 runs first (schema freezes the shape).
- WP-199 depends on WP-196 (needs the schema to know what to validate).
- WP-197 depends on WP-199 (write-time asserts use the enforcer).
- WP-198 depends on WP-196 + WP-199 (reuses the enforcer).
- WP-200 depends on WP-196 through WP-199 being ship-ready; the
  document itself lands in Wave 5 but the text is drafted here.

---

## Open Questions (Flagged For Review, Not Silently Closed)

1. **Inferred vs explicit tier.** Should `tier` be inferable from refs?
   **Wave 3 decision:** NO — always explicit. Inferred tier hides
   operator intent and makes "forgot a ref" indistinguishable from a
   free block. Explicit tier is honesty-first.
2. **Block-ID uniqueness.** Unique per snapshot? **Wave 3 decision:**
   YES, enforced by WP-198. Cross-snapshot collisions are harmless
   because snapshotIds are unique (Phase 5.5 WP-120).
3. **Historical seed migration.** Migrate or grandfather pre-Wave-3
   flat seeds? **Wave 3 decision:** GRANDFATHER. Migration would edit
   frozen snapshots, violating Phase 5.5 immutability. Old snapshots
   stay flat; validator skips with disclosed `legacy-layout` reason.
   New snapshots (post-merge) use nested layout. Archive rotation is
   out of Wave 3 scope.

---

## Exit Condition

Wave 3 is complete when: `writing-seed-block.schema.json` exists with
self-tests; `writing-tier-enforcer.js` exports the four asserts +
`WritingTierValidationError`; `writing.js` + `writing-render.js` emit
three tier-scoped block files per eligible claim under
`seeds/<snapshotId>/<tier>/<blockId>.md`;
`validate-three-tier-writing.js` is registered in `run-all.js` and
`ciValidators` is `12`; counts reflect new tests (`schemaTests: 40`,
`flowTests: 9`, `libTests: 21`); `npm run check` passes on a fresh
repo; the Wave 5 closeout upgrade text is drafted and attached to
WP-200; the Open Questions are explicitly answered, not left implicit.
