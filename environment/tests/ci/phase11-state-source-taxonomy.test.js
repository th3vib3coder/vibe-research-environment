import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES,
  validateStateSourceTaxonomy
} from './phase11-state-source-taxonomy.js';

function makeValidTaxonomy(overrides = {}) {
  const taxonomy = {
    schemaVersion: 'phase11.state-source-taxonomy.v1',
    phase: 11,
    wave: '11.2',
    taskId: 'T11.2.0',
    sources: [
      {
        id: 'decision-gates-json',
        kind: 'authority',
        path: 'vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json',
        owner: 'operator-gate',
        checkCommand: 'node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1], \'utf8\'))" <path>',
        regenerationAllowed: false
      },
      {
        id: 'git-and-github-actions',
        kind: 'authority',
        path: 'git:origin/main + GitHub Actions runs',
        owner: 'git-github-actions',
        checkCommand: 'git merge-base --is-ancestor <sha> origin/main && gh run view <run>',
        regenerationAllowed: false
      },
      {
        id: 'phase11-feature-ledger',
        kind: 'runtime-ledger',
        path: 'phase11-vre-feature-ledger.md',
        owner: 'phase11-ledger',
        appendOnlyPolicy: 'append-only-row-per-task',
        owningValidator: 'environment/tests/ci/check-phase11-ledger.js'
      },
      {
        id: 'phase9-feature-ledger',
        kind: 'runtime-ledger',
        path: 'phase9-vre-feature-ledger.md',
        owner: 'phase9-ledger',
        appendOnlyPolicy: 'append-only-bridge-row-for-shared-ci',
        owningValidator: 'environment/tests/ci/check-phase9-ledger.js'
      },
      {
        id: 'wiki-curated-pages',
        kind: 'authority',
        path: 'vibe-science/blueprints/private/WIKI_VRE/**/*.md',
        owner: 'wiki-curator',
        checkCommand: 'node tools/wiki-lint.mjs --json',
        regenerationAllowed: false
      },
      {
        id: 'wiki-generated-registries',
        kind: 'projection',
        path: 'vibe-science/blueprints/private/WIKI_VRE/entities/registry-*.md',
        owner: 'wiki-registry',
        generatorCommand: 'node tools/build-registries.mjs --json',
        checkCommand: 'node tools/build-registries.mjs --check --json',
        sourceAuthority: 'wiki-curated-pages',
        regenerationAllowed: true
      },
      {
        id: 'wiki-mirror',
        kind: 'projection',
        path: 'vibe-science/blueprints/private/WIKI_VRE/vre_wiki/',
        owner: 'wiki-mirror',
        generatorCommand: 'node tools/sync-mirror.mjs --json',
        checkCommand: 'node tools/sync-mirror.mjs --check --json',
        sourceAuthority: 'wiki-curated-pages',
        regenerationAllowed: true
      },
      {
        id: 'wiki-coverage-inventories',
        kind: 'projection',
        path: 'vibe-science/blueprints/private/WIKI_VRE/coverage/',
        owner: 'wiki-coverage',
        generatorCommand: 'node tools/generate-vre-coverage.mjs --json',
        checkCommand: 'node tools/generate-vre-coverage.mjs --check --json',
        sourceAuthority: 'vre-runtime-tree',
        regenerationAllowed: true
      },
      {
        id: 'ci-run-all',
        kind: 'ci-enforcement',
        path: 'environment/tests/ci/run-all.js',
        owner: 'ci-validator',
        checkCommand: 'node environment/tests/ci/run-all.js'
      },
      {
        id: 'ci-validate-counts',
        kind: 'ci-enforcement',
        path: 'environment/tests/ci/validate-counts.js',
        owner: 'ci-validator',
        checkCommand: 'node environment/tests/ci/validate-counts.js'
      },
      {
        id: 'scratch-tmp-vre',
        kind: 'scratch-noise',
        path: '.tmp-vre-*',
        owner: 'codex-test-harness',
        cleanupPolicy: 'owned-cleanup',
        cleanupEligible: true,
        cleanupOwner: 'codex-test-harness'
      },
      {
        id: 'scratch-tmp',
        kind: 'scratch-noise',
        path: '.tmp/',
        owner: 'codex-test-harness',
        cleanupPolicy: 'owned-cleanup',
        cleanupEligible: true,
        cleanupOwner: 'codex-test-harness'
      },
      {
        id: 'scratch-analysis',
        kind: 'scratch-noise',
        path: 'analysis/',
        owner: 'operator-research',
        cleanupPolicy: 'never-auto-delete',
        cleanupEligible: false
      },
      {
        id: 'scratch-audit-config',
        kind: 'scratch-noise',
        path: 'audit.config.yaml',
        owner: 'operator-research',
        cleanupPolicy: 'never-auto-delete',
        cleanupEligible: false
      },
      {
        id: 'scratch-audit',
        kind: 'scratch-noise',
        path: 'audit/',
        owner: 'operator-research',
        cleanupPolicy: 'never-auto-delete',
        cleanupEligible: false
      },
      {
        id: 'scratch-nested-vibe-science',
        kind: 'scratch-noise',
        path: 'vibe-science/',
        owner: 'operator-research',
        cleanupPolicy: 'never-auto-delete',
        cleanupEligible: false
      },
      {
        id: 'research-loop-governance-flake',
        kind: 'state-risk',
        path: 'environment/tests/cli/research-loop.test.js',
        owner: 'wave-11.2',
        followUpId: 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001',
        requiredTreatment: 'make governance-event counting order-independent or reset shared state',
        status: 'reviewed-closed',
        closureTaskId: 'T11.2.4',
        closureEvidence: {
          testPath: 'environment/tests/cli/research-loop.test.js',
          regressionTest: 'research-loop logs objective_blocked governance event for rule-only blocker',
          duplicateGuardTest: 'governance event selector fails closed on duplicate matching events'
        }
      }
    ],
    downstreamBindings: [
      {
        taskId: 'T11.2.1',
        mustConsume: [
          'cleanupPolicy',
          'authority-not-regenerated',
          'projection-generator-and-check'
        ]
      },
      {
        taskId: 'T11.2.2',
        mustConsume: [
          'cleanupPolicy',
          'authority-not-regenerated',
          'projection-generator-and-check'
        ]
      }
    ],
    ...overrides
  };

  return taxonomy;
}

test('valid state-source taxonomy passes', () => {
  const result = validateStateSourceTaxonomy(makeValidTaxonomy());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
});

test('missing decision-gates authority fails closed', () => {
  const taxonomy = makeValidTaxonomy({
    sources: makeValidTaxonomy().sources.filter((source) => source.id !== 'decision-gates-json')
  });
  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.requiredSourceMissing
      && issue.sourceId === 'decision-gates-json'
  ));
});

test('projection without generator or check command fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const projection = taxonomy.sources.find((source) => source.id === 'wiki-mirror');
  delete projection.generatorCommand;
  delete projection.checkCommand;

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.projectionGeneratorMissing
      && issue.sourceId === 'wiki-mirror'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.projectionCheckMissing
      && issue.sourceId === 'wiki-mirror'
  ));
});

test('runtime ledger without append-only policy fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const ledger = taxonomy.sources.find((source) => source.id === 'phase11-feature-ledger');
  delete ledger.appendOnlyPolicy;

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.runtimeLedgerAppendOnlyMissing
      && issue.sourceId === 'phase11-feature-ledger'
  ));
});

test('cleanup-eligible scratch without explicit owner fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const scratch = taxonomy.sources.find((source) => source.id === 'scratch-tmp');
  delete scratch.cleanupOwner;

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.scratchCleanupOwnerMissing
      && issue.sourceId === 'scratch-tmp'
  ));
});

test('analysis scratch marked cleanup-eligible fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const analysis = taxonomy.sources.find((source) => source.id === 'scratch-analysis');
  analysis.cleanupPolicy = 'owned-cleanup';
  analysis.cleanupEligible = true;
  analysis.cleanupOwner = 'codex-test-harness';

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.researchScratchAutoDelete
      && issue.sourceId === 'scratch-analysis'
  ));
});

test('operator research scratch marked cleanup-eligible fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const nested = taxonomy.sources.find((source) => source.id === 'scratch-nested-vibe-science');
  nested.cleanupPolicy = 'owned-cleanup';
  nested.cleanupEligible = true;
  nested.cleanupOwner = 'codex-test-harness';

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.researchScratchAutoDelete
      && issue.sourceId === 'scratch-nested-vibe-science'
  ));
});

test('missing research-loop governance flake state-risk entry fails closed', () => {
  const taxonomy = makeValidTaxonomy({
    sources: makeValidTaxonomy().sources.filter((source) =>
      source.followUpId !== 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001'
    )
  });
  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.followUpMissing
  ));
});

test('reviewed-closed state-risk without closure evidence fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const stateRisk = taxonomy.sources.find((source) =>
    source.followUpId === 'FU-P11-RESEARCH-LOOP-GOVERNANCE-FLAKE-001'
  );
  stateRisk.status = 'reviewed-closed';
  delete stateRisk.closureEvidence;

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.stateRiskClosureEvidenceMissing
      && issue.sourceId === 'research-loop-governance-flake'
  ));
});

test('authority marked regenerable fails closed', () => {
  const taxonomy = makeValidTaxonomy();
  const gate = taxonomy.sources.find((source) => source.id === 'decision-gates-json');
  gate.regenerationAllowed = true;

  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.authorityRegenerationAllowed
      && issue.sourceId === 'decision-gates-json'
  ));
});

test('missing doctor/reconcile downstream binding fails closed', () => {
  const taxonomy = makeValidTaxonomy({
    downstreamBindings: [
      {
        taskId: 'T11.2.1',
        mustConsume: [
          'cleanupPolicy',
          'authority-not-regenerated',
          'projection-generator-and-check'
        ]
      }
    ]
  });
  const result = validateStateSourceTaxonomy(taxonomy);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE11_STATE_SOURCE_TAXONOMY_REASON_CODES.downstreamBindingMissing
      && issue.taskId === 'T11.2.2'
  ));
});
