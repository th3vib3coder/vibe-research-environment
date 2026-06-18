import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const tablePath = path.join(repoRoot, 'environment/autonomous/l1/stage-skill-table.json');

const EXPECTED_STAGE_IDS = Object.freeze([
  'problem-framing',
  'novelty-literature-gap',
  'hypothesis-from-data',
  'claim-attack-evidence-grading',
  'plan-output',
  'closeout'
]);

const REQUIRED_TARGETS = Object.freeze({
  'problem-framing': ['scientific-brainstorming'],
  'novelty-literature-gap': ['vibe', 'literature-search'],
  'hypothesis-from-data': ['hypothesis-generation'],
  'claim-attack-evidence-grading': [
    'scientific-critical-thinking',
    'adversarial-pairing'
  ],
  'plan-output': ['writing-plans', 'scientific-writing'],
  closeout: ['verification-before-completion']
});

async function loadDecisionTable() {
  return JSON.parse(await readFile(tablePath, 'utf8'));
}

function stageById(table, stageId) {
  return table.stages.find((stage) => stage.stageId === stageId);
}

function targetById(stage, targetId) {
  return stage.targets.find((target) => target.targetId === targetId);
}

describe('Phase 13 L1 stage-skill decision table', () => {
  it('is a policy-only artifact with no runtime authority', async () => {
    const table = await loadDecisionTable();

    assert.equal(table.schemaVersion, 'phase13.l1-stage-skill-table.v1');
    assert.equal(table.phase, 13);
    assert.equal(table.layer, 'L1');
    assert.equal(table.artifact, 'stage-skill-table');
    assert.equal(table.policyOnly, true);
    assert.equal(table.runtimeOpened, false);
    assert.notEqual(table.executionEnabled, true);
    assert.equal(table.runtimeConsumer, 'gated-on-L0');
  });

  it('keeps the canonical stage order deterministic', async () => {
    const table = await loadDecisionTable();
    const actualStageIds = table.stages.map((stage) => stage.stageId);

    assert.deepEqual(table.orderedStageIds, EXPECTED_STAGE_IDS);
    assert.deepEqual(actualStageIds, EXPECTED_STAGE_IDS);
    assert.equal(new Set(actualStageIds).size, actualStageIds.length);
  });

  it('maps every stage to the required non-runtime skill targets', async () => {
    const table = await loadDecisionTable();

    for (const [stageId, requiredTargets] of Object.entries(REQUIRED_TARGETS)) {
      const stage = stageById(table, stageId);
      assert.ok(stage, `missing stage ${stageId}`);
      assert.ok(Array.isArray(stage.targets), `missing targets for ${stageId}`);

      for (const targetId of requiredTargets) {
        assert.ok(
          targetById(stage, targetId),
          `missing target ${targetId} for ${stageId}`
        );
      }
    }
  });

  it('classifies vibe as a Vibe Science workflow, not a guaranteed host skill', async () => {
    const table = await loadDecisionTable();
    const noveltyStage = stageById(table, 'novelty-literature-gap');
    const vibeTarget = targetById(noveltyStage, 'vibe');

    assert.equal(vibeTarget.targetKind, 'vibe-science-workflow');
    assert.equal(vibeTarget.required, true);
    assert.notEqual(vibeTarget.targetKind, 'host-skill');
  });

  it('keeps attack and closeout stages adversarial and verified', async () => {
    const table = await loadDecisionTable();
    const attackStage = stageById(table, 'claim-attack-evidence-grading');
    const closeoutStage = stageById(table, 'closeout');

    assert.ok(targetById(attackStage, 'scientific-critical-thinking'));
    assert.ok(targetById(attackStage, 'adversarial-pairing'));
    assert.ok(targetById(closeoutStage, 'verification-before-completion'));
  });
});
