# Phase 7 Wave 4 — Connectors, Automation, Domain-Pack Rule Engine

**Goal:** close G-08 (Obsidian honesty), G-09 (Zotero formal deferral),
G-10 (scheduling host-native), G-11 (domain-pack rule enforcement)
through ten additive WPs honoring Wave 0 defaults WP-180 (Contract B),
WP-181 (Option B), WP-182 (GitHub Actions).

Wave 4 ships: a rename + a deferred contract + a scheduled workflow + a
rule engine. It does NOT ship an Obsidian API integration, does NOT ship
a Zotero adapter, and does NOT change kernel read-only.

---

## WP-201 — Obsidian Connector Rename (WP-180 Contract B)

Rename `environment/connectors/obsidian-export.js` to
`environment/connectors/vault-target-export.js`. File-copy semantics are
preserved; only the label changes.

**Before/after cite table (every reference):**

| # | Current | Post-rename |
|---|---------|-------------|
| 1 | `environment/connectors/obsidian-export.js` | `environment/connectors/vault-target-export.js` |
| 2 | `environment/connectors/manifests/obsidian-export.connector.json` | `environment/connectors/manifests/vault-target-export.connector.json` |
| 3 | `environment/install/bundles/connectors-core.bundle.json:21,23` | entries rewritten |
| 4 | `environment/tests/lib/connectors.test.js:18,32,342,352,354` | import + id list + assertions |
| 5 | `environment/tests/schemas/connector-status.schema.test.js:37` | `connectorId: 'vault-target-export'` |
| 6 | `environment/tests/schemas/connector-run-record.schema.test.js:62` | `connectorId: 'vault-target-export'` |
| 7 | `environment/tests/control/query.test.js:421` | filter id updated |
| 8 | `environment/tests/ci/validate-runtime-contracts.js:102` | manifest whitelist |
| 9 | `blueprints/definitive-spec/09-install-and-lifecycle.md:162,164` | doc cites |
| 10 | `blueprints/definitive-spec/14-testing-strategy.md:92` | doc cite |
| 11 | `blueprints/definitive-spec/implementation-plan/phase4-02-wave-1-connector-substrate.md:31` | doc cite |
| 12 | `.vibe-science-environment/operator-validation/benchmarks/flow-status-connector-failure-visibility/2026-04-04-01/*` | historical evidence NOT rewritten; Wave 4 closeout note cites rename |

A one-shot migration helper
`environment/connectors/migrations/rename-obsidian.js` copies any legacy
`.vibe-science-environment/connectors/obsidian-export/` state into the
new directory non-destructively. Run-log records are not rewritten.

**Six questions.** Enters `/connector-export` via `runWithMiddleware` →
`connectorId=vault-target-export`. State: renamed manifest + run-log
JSONL + status JSON. Reads: registry loader, health, query surface,
tests. Writes: migration helper + `recordConnectorRun`. Tested:
regression asserts no remaining `obsidian-export` import, registry
lists new id, legacy run-log migrates cleanly. Degrades: migration
failure leaves legacy state; new registry entry starts empty — no
kernel effect.

**If WP-180 shipped Contract A**: replace WP-201 with YAML-frontmatter
injection, wikilinks, tags, skip-honest Obsidian-CLI integration test.

---

## WP-202 — Obsidian Connector Honesty Documentation

The rename only matters if text layer stops overclaiming.

**Manifest before/after.** Current `obsidian-export.connector.json` has
`"displayName": "Obsidian Export"` and no `description`. Renamed
manifest carries `"displayName": "Vault Target Export"` and
`"description": "One-way markdown copier mirroring the two generated
memory files (project-overview.md and decision-log.md) into an external
directory. Not an Obsidian plugin, API integration, URI-scheme handler,
or vault-metadata writer. Output is plain markdown that Obsidian, any
editor, or a filesystem browser can open."`. The
`connector-manifest.schema.json` gains an optional `description: string`
field (additive — no breaking change).

**phase4-closeout.md line change.** Current line 73-74 reads `"The
Obsidian connector is a vault-target markdown export adapter, not an
Obsidian plugin, API integration, or URI-scheme integration."` WP-202
replaces with `"The Obsidian connector was renamed to
\`vault-target-export\` in Wave 4 (WP-201). See
\`environment/connectors/manifests/vault-target-export.connector.json\`
for the operator-visible description."`

**Six questions.** Doc-only patch. State: manifest + closeout. Reads:
registry loader surfaces description; operator status. Writes: one-time
manifest + closeout rewrite. Tested: schema test asserts description
present; closeout validator (WP-119) asserts no remaining `"Obsidian
plugin"`/`"Obsidian API"` phrases. No runtime surface → no degradation
path.

---

## WP-203 — Zotero Ingress Formal Deferral (WP-181 Option B)

Ship `blueprints/definitive-spec/deferred/zotero-ingress-contract.md`
(directory created in Wave 4). No runtime code under
`environment/connectors/zotero-*`.

**Frozen contract content (five required sections):**

- **Endpoint**: `POST /v1/citations/import-bundle` on the kernel HTTP
  surface. Kernel-side; out of VRE scope.
- **Request shape**: `{bundleId, source: "zotero", exportedAt: iso8601,
  items: [{zoteroKey, title, doi?, authors[], pubYear, containerTitle?,
  collectionPath[], attachmentRefs[]}]}`. No claim IDs, no gate refs —
  raw metadata only.
- **Response shape**: `{ingestId, accepted: int, rejected: int,
  rejections: [{zoteroKey, reason}]}`.
- **Auth**: bearer token scoped to `citation:write-bundle`; VRE client
  reads from operator keyring with `VRE_KERNEL_TOKEN` env fallback. No
  anonymous writes.
- **Error taxonomy**: `kernel-unavailable`, `auth-failed`,
  `bundle-malformed`, `duplicate-bundle`, `rate-limited`,
  `partial-accept` — each mapped to a typed error class in the future
  adapter.

Future VRE client: `environment/connectors/zotero-ingress.js` exports
`importZoteroBundle(projectPath, bundleDescriptor, options)` returning
the kernel response and recording a connector-run entry shaped like
`exportMemoryMirror`. Future integration test:
`tests/integration/zotero-ingress.test.js` with a fake kernel HTTP
server asserting adapter serialization + error classification.

**phase4-closeout.md update.** Line 75-76 changes from `"Zotero was
discussed in planning but did not ship in Phase 4…"` to `"Zotero ingress
remains deferred per WP-181 Option B. Architectural contract frozen in
\`blueprints/definitive-spec/deferred/zotero-ingress-contract.md\` under
\`FU-7-001\`. No runtime code in Phase 7."`

**Six questions.** No runtime entry. State: markdown + closeout line
replacement. Reads: Phase 8+ implementers, reviewers. Writes: Wave 4
author; closeout updater (WP-209). Tested: deferred-doc validator
asserts the five required section headings. Unimplemented state IS the
degraded state; closeout documents it.

**If WP-181 shipped Option A**: replace WP-203 with kernel endpoint
coordination + `zotero-ingress.js` adapter + fake-kernel integration
test.

---

## WP-204 — GitHub Actions Scheduled Digest Workflow (WP-182 Default)

Create `.github/workflows/scheduled-digest.yml`. Existing `ci.yml`
triggers on push/PR only — no schedule conflict. Monday 14:00 UTC is
mid-afternoon Europe / late-morning US-Eastern, a reasonable operator
review window.

```yaml
name: Scheduled Weekly Digest
on:
  schedule:
    - cron: "0 14 * * MON"
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  weekly-digest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Run weekly-digest helper
        env:
          VRE_KERNEL_PATH: ${{ secrets.VRE_KERNEL_PATH }}
        run: node bin/vre weekly-digest --json > digest-output.json
      - name: Upload digest artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: weekly-digest-${{ github.run_id }}
          path: |
            digest-output.json
            .vibe-science-environment/automation/artifacts/weekly-research-digest/**
          if-no-files-found: warn
          retention-days: 30
```

Helper error → step fails loud; `if: always()` captures the partial
artifact regardless. No `continue-on-error`. `VRE_KERNEL_PATH` is a
secret; when absent the helper runs degraded (matches
`builtin-plans.js:77` `session == null` path). `workflow_dispatch: {}`
lets a maintainer trigger manually for verification. Phase 6 `check.yml`
does not use `schedule:` — no cron conflict.

**Six questions.** Enters: cron or manual dispatch. State: GH artifact
store (30-day) + ephemeral runner workspace. Reads: repo at default ref
+ local project state. Writes: `digest-output.json` captured by upload;
automation runtime still writes under
`.vibe-science-environment/automation/artifacts/` (ephemeral unless
captured). Tested: WP-210. Degrades: missing secret → degraded digest
with explicit `degradedReason`; helper error → loud failure.

---

## WP-205 — Scheduling Dedupe Preservation

The ISO-week idempotency key from `builtin-plans.js:47,66` remains the
backstop. Two scheduled fires in the same ISO week (cron + manual
dispatch) produce exactly one artifact: the runtime at `runtime.js:41-46`
detects the prior record, returns `status: "blocked"` with
`blockedReason: "Automation weekly-research-digest already recorded
source state <weekKey>."`, reuses `previousForKey.artifactPath`.

**Interaction (goes into closeout + workflow README comment):**

```
cron fires Monday 14:00 UTC → workflow → node bin/vre weekly-digest
  → runWeeklyResearchDigest → buildWeeklyResearchDigestPlan computes
  isoweek key (builtin-plans.js:47) → runtime.js:32-46 checks run-log
  for prior same-key record → IF found: status=blocked, prior artifact
  reused → ELSE: writeAutomationArtifact, status=completed|degraded
```

No code change. WP-205 ships a regression test
`environment/tests/integration/scheduled-digest-dedup.test.js` that
invokes the helper twice with the same ISO-week clock and asserts the
second call returns `status: "blocked"` with the expected reason.

**Six questions.** Enters: existing automation runtime. State:
`.vibe-science-environment/automation/runs/weekly-research-digest.jsonl`.
Reads: `findLatestRunForIdempotency`. Writes:
`appendAutomationRunRecord`. Tested: new dedup integration test; WP-210
parser; existing weekly-digest tests green. Degrades: unreadable
run-log → helper creates artifact + warning rather than silent block.

---

## WP-206 — Domain-Pack Rule Engine

Create `environment/domain-packs/rule-engine.js` closing FU-55-005
(phase4-closeout.md line 62 PARTIAL → PASS).

```javascript
export class DomainPackRuleViolationError extends Error {
  constructor({ domainPack, ruleName, context, remediation }) {
    super(`Domain pack "${domainPack}" rule "${ruleName}" rejected the operation: ${remediation}`);
    this.name = 'DomainPackRuleViolationError';
    Object.assign(this, { domainPack, ruleName, context, remediation });
  }
}

const RULE_HANDLERS = Object.freeze({
  forbiddenMutations: handleForbiddenMutations,
  doesNotModify: handleDoesNotModify,
});

export async function enforceRule({ ruleName, context, domainPack }) {
  const handler = RULE_HANDLERS[ruleName];
  if (handler == null) throw new Error(`Unknown domain-pack rule: ${ruleName}`);
  await handler({ context, domainPack });
}

function handleForbiddenMutations({ context, domainPack }) {
  const forbidden = domainPack.forbiddenMutations ?? [];
  if (context.targetField != null && forbidden.includes(context.targetField)) {
    throw new DomainPackRuleViolationError({
      domainPack: domainPack.packId, ruleName: 'forbiddenMutations', context,
      remediation: `Field "${context.targetField}" is declared forbiddenMutation by ${domainPack.packId}. Register a new experiment or open an amendment record instead.`,
    });
  }
}

function handleDoesNotModify({ context, domainPack }) {
  const blocked = domainPack.doesNotModify ?? [];
  if (context.operation != null && blocked.includes(context.operation)) {
    throw new DomainPackRuleViolationError({
      domainPack: domainPack.packId, ruleName: 'doesNotModify', context,
      remediation: `Operation "${context.operation}" is declared doesNotModify by ${domainPack.packId}.`,
    });
  }
}
```

Exact-string match. Rule-chaining explicitly out of scope (see open
questions). Engine is side-effect-free: reads pack + context, throws
or returns; no run-log write, no kernel touch. Empty rule arrays → no-op.

**Six questions.** Enters: WP-207 sites call `enforceRule`. State: none
(pure function); active pack read by callers via
`getDomainPackOverview`. Reads: validated pack object. Writes: nothing;
throws typed error. Tested:
`environment/tests/lib/domain-pack-rule-engine.test.js` covers both
handlers, unknown rule name, empty arrays. Degrades: pack without rule
arrays → silent allow.

---

## WP-207 — Rule Engine Integration Sites

Three one-line additions.

**Site 1** — `environment/flows/experiment.js:updateExperiment` (line
184+). After `patch` normalization, before any disk write:

```javascript
await enforceRule({
  ruleName: 'doesNotModify',
  context: {
    operation: patch.operation ?? 'experiment-update',
    targetField: patch.field,
  },
  domainPack: activePack,
});
```

**Site 2** — `environment/flows/results.js:packageExperimentResults`
(line 35+). After experiment-id validation, before bundle assembly:

```javascript
await enforceRule({
  ruleName: 'forbiddenMutations',
  context: {
    operation: options.operation ?? 'results-package',
    targetField: options.mutatedField ?? null,
  },
  domainPack: activePack,
});
```

**Site 3** — `environment/lib/manifest.js:writeManifestFile` (line
191+). First line of the function body:

```javascript
await enforceRule({
  ruleName: 'forbiddenMutations',
  context: {
    operation: manifest.__operation ?? 'manifest-write',
    targetField: manifest.__mutatingField ?? null,
  },
  domainPack: activePack,
});
```

`activePack` is read once per flow entry via
`getDomainPackOverview(projectPath)` and threaded down. Sites 2 and 3
accept nullable `targetField` — existing read-only callers remain no-op,
new mutation-aware callers trigger the check. Violations propagate to
middleware, which routes them to the Phase 5 escalation-record surface.
No silent swallow.

Operation-level `doesNotModify` checks are not decorative. The same three
sites must also call `enforceRule({ruleName:'doesNotModify', ...})` whenever
`patch.operation`, `options.operation`, or `manifest.__operation` is one of
the pack-declared operation strings. Tests must cover the exact omics
operations from WP-208:
`experiment-rerun-with-new-fastq-input`, `reference-genome-swap`,
`alignment-parameter-override`, and `batch-assignment-rewrite`.

**Six questions.** Enters: existing flow entries. State: violations
surface through existing escalation-record surface. Reads: active domain
pack. Writes: escalation record via middleware; no manifest mutation.
Tested: one test file per site (`experiment-rule-enforcement.test.js`,
`results-rule-enforcement.test.js`,
`manifest-rule-enforcement.test.js`) plus one exact-string operation-level
test per WP-208 `doesNotModify` entry. Degrades: no active pack → empty arrays
→ no-op.

---

## WP-208 — Omics Rule Population

Update `environment/domain-packs/omics/pack.domain-pack.json`. Field
names drawn from existing `experimentPresets.defaultFields` (organism,
tissue, cell_count, sequencing_platform, library_chemistry) and the
`experiment-manifest.schema.json` surface.

```json
"forbiddenMutations": [
  "sequencing_platform",
  "library_chemistry",
  "reference_genome_build",
  "reference_transcriptome_version",
  "fastq_input_uris",
  "alignment_parameters_hash"
],
"doesNotModify": [
  "experiment-rerun-with-new-fastq-input",
  "reference-genome-swap",
  "alignment-parameter-override",
  "batch-assignment-rewrite"
]
```

**Rationale (grounded in omics discipline, not invented):**
`sequencing_platform` + `library_chemistry` — analysis path is
platform-conditioned; post-registration change invalidates
reproducibility. `reference_genome_build` + `reference_transcriptome_version`
— swap invalidates prior alignment; fresh experiment required.
`fastq_input_uris` — raw reads ARE the experiment; URI rewrite replaces
the subject of study. `alignment_parameters_hash` — parameters live in
the bundle manifest; retroactive change corrupts the declared analysis
contract. The four `doesNotModify` operations are the operation-level
analogues: each represents a path callers might try to take to bypass
the field-level rules, explicitly blocked.

Existing abstract `doesNotModify` entries (`"claim truth"`, `"citation
truth"`, `"gate semantics"`, `"kernel stop behavior"`) stay as
documentation-in-data; no caller passes those operation strings, so
they are silently no-op-preserved.

Schema implication: if `domain-pack.schema.json` does not already permit
`forbiddenMutations` at top level (it does not, per current pack), add
it as an optional array-of-strings field. Additive per Wave 0.

**Six questions.** Enters: rule engine reads pack at integration sites.
State: one file change. Reads: `readDomainPackManifest`. Writes: author
writes file; runtime never mutates pack JSON. Tested: omics-pack rule
fixture asserts new arrays; integration test on `updateExperiment` with
`patch.field = "sequencing_platform"` asserts violation with expected
remediation. Degrades: pack fails schema → resolver falls back to
defaults (`resolver.js:55-64`); rules ungated.

---

## WP-209 — phase4-closeout.md Updates

Integrate WP-201/202/203/204/208 outcomes.

**Correction Notes (lines 70-80)** — replace four bullets:
- Obsidian renamed to `vault-target-export` in Wave 4 (WP-201); manifest
  description (WP-202).
- Zotero deferred per WP-181 Option B; contract in
  `blueprints/definitive-spec/deferred/zotero-ingress-contract.md` under
  `FU-7-001`.
- Weekly automation has host-native binding at
  `.github/workflows/scheduled-digest.yml` (WP-204); ISO-week key
  (WP-205, from `builtin-plans.js:47,66`) remains backstop — double-fire
  produces one artifact.
- Domain-pack rules are runtime-enforced via
  `environment/domain-packs/rule-engine.js` (WP-206) at three sites
  (WP-207); omics carries 6 field-level + 4 operation-level rules
  (WP-208); FU-55-005 closed.

**Connector Surface (lines 93-98)** — add bullet: catalogue is
`{filesystem-export, vault-target-export}`; Zotero not listed — see
deferred contract.

**Automation Surface (lines 100-105)** — add bullet: weekly digest has
one host-native binding + one command surface; run-log prevents
double-artifact creation.

**Domain-Pack Surface (lines 107-112)** — add bullet: rule enforcement
real at `flows/experiment.js:updateExperiment`,
`flows/results.js:packageExperimentResults`,
`lib/manifest.js:writeManifestFile`.

**Gate 8 row (line 62)**: PARTIAL → PASS; evidence cite switches from
`resolver.js` to `rule-engine.js` plus the three integration tests.

**Six questions.** Enters: closeout editor. State: one doc. Reads:
closeout-honesty validator (WP-119), reviewers. Writes: Wave 4 author.
Tested: Wave 5 semantic upgrade (G-13). Degrades: doc-only.

---

## WP-210 — Scheduled Workflow Regression Validator

Create `environment/tests/ci/validate-scheduled-workflow.js`, register
in `run-all.js`. Must survive YAML comments, conditionals, multiline
strings, secret references.

**Responsibilities**: (1) Read
`.github/workflows/scheduled-digest.yml`; ENOENT → loud fail. (2) Parse
via `js-yaml` if available; else a minimal line-based parser with `#`
comment stripping and folded-string handling (anchored documents
rejected with a clear "use js-yaml" error). (3) Assert
`on.schedule[0].cron` is a valid 5/6-field cron with day-of-week `MON`
or `1`. (4) Assert at least one step's `run:` matches
`/\bbin\/vre\s+weekly-digest\b/` (extra flags like `--json`, pipes
permitted). (5) Scan all string values: only `${{ secrets.<NAME> }}`
forms permitted under `env:` or `with:`; bare 20+char base64-ish
strings elsewhere fail. (6) Assert `permissions.contents` is `read` or
absent; `write` without explicit review comment fails. (7) Emit
structured result to `run-all.js`. Conditional `if:` expressions
ignored (validator inspects `run:`/`uses:` only); trailing whitespace,
mid-file comments, UTF-8 BOM tolerated.

**Meta-test** `validate-scheduled-workflow.test.js` covers: (a) valid
workflow passes; (b) workflow with inline secret literal fails; (c)
workflow missing `bin/vre weekly-digest` invocation fails; (d)
workflow with cron on a different valid day still passes.

**Six questions.** Enters: `npm run validate` → `run-all.js`. State:
reads workflow; no mutation. Reads: the YAML file. Writes: stdout
pass/fail; optional summary under `.vibe-science-environment/validators/`
if existing convention requires. Tested: the meta-test above. Degrades:
missing workflow file → loud fail (consistent with WP-204 posture).

---

## Parallelism

- WP-201 → WP-202 (sequential — 202 depends on 201's new manifest).
- WP-203 independent.
- WP-204 → WP-205 (sequential — 205 documents 204's interaction).
- WP-206 → WP-207, WP-208 (207/208 depend on the engine existing).
- WP-209 last — depends on 201/202/203/204/208 cites being real.
- WP-210 parallel with WP-204 once the workflow YAML exists.

---

## Wave 4 Decisions For Wave 5 Review

1. **Digest publication mode**: artifact-only. The workflow uploads generated
   digest evidence as a GitHub Actions artifact and does not commit generated
   files back to the repo. Git write-back is a future explicit scope expansion
   because it widens blast radius.
2. **Rule-chaining support**: no chaining. A failing rule throws directly so the
   audit trail names one cause and cannot loop through chained rules.
3. **Omics rules file layout**: inline in the omics pack until the rule set
   exceeds 25 rules or rule versioning becomes important.
4. **Zotero deferred-schema stub**: no placeholder schema. Deferred markdown is
   the single source of truth until the kernel-side citation-ingress contract is
   real.

---

## Exit Condition

Wave 4 complete when all hold:

- `vault-target-export.js` + renamed manifest replace Obsidian-branded
  files; no remaining `obsidian-export` import.
- Manifest description matches reality; closeout cites renamed
  connector.
- `blueprints/definitive-spec/deferred/zotero-ingress-contract.md`
  exists with five required sections.
- `.github/workflows/scheduled-digest.yml` exists with cron, invokes
  `bin/vre weekly-digest`, passes WP-210 validator.
- `rule-engine.js` exports `enforceRule` + `DomainPackRuleViolationError`;
  three sites invoke it; omics declares 6 field-level + 4 operation-
  level rules.
- `phase4-closeout.md` gate 8 → PASS with file-level evidence cite;
  WP-209 section edits landed.
- `npm run validate` and `npm test` pass with new suites.
- No Wave 0 contract silently downgraded.
