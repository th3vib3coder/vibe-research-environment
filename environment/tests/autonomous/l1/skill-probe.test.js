import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  Phase13SkillProbeError,
  evaluateSkillAvailability
} from '../../../autonomous/l1/skill-probe.js';

const repoRoot = process.cwd();
const tablePath = path.join(repoRoot, 'environment/autonomous/l1/stage-skill-table.json');

async function loadTable() {
  return JSON.parse(await readFile(tablePath, 'utf8'));
}

function registry(overrides = {}) {
  return {
    hostSkills: [
      'scientific-brainstorming',
      'adversarial-pairing',
      'verification-before-completion'
    ],
    skillFamilies: ['literature-search'],
    vibeScienceWorkflows: ['vibe'],
    codexGlobalInstalls: [],
    ...overrides
  };
}

function resultFor(report, stageId, targetId) {
  return report.targetResults.find((row) =>
    row.stageId === stageId && row.targetId === targetId
  );
}

describe('Phase 13 L1 skill availability probe', () => {
  it('rejects missing table and missing injected registry', async () => {
    const table = await loadTable();

    assert.throws(
      () => evaluateSkillAvailability(),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_PROBE_TABLE_REQUIRED'
    );
    assert.throws(
      () => evaluateSkillAvailability(table),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_PROBE_REGISTRY_REQUIRED'
    );
  });

  it('emits one availability row for every table target', async () => {
    const table = await loadTable();
    const report = evaluateSkillAvailability(table, registry());
    const targetCount = table.stages.reduce(
      (total, stage) => total + stage.targets.length,
      0
    );

    assert.equal(report.schemaVersion, 'phase13.l1-skill-availability-report.v1');
    assert.equal(report.policyOnly, true);
    assert.equal(report.runtimeOpened, false);
    assert.equal(report.skillInvocationAttempted, false);
    assert.equal(report.degradeApplied, false);
    assert.equal(report.targetResults.length, targetCount);
    assert.equal(new Set(report.targetResults.map((row) => row.resultId)).size, targetCount);
  });

  it('marks present and missing host skills without invoking them', async () => {
    const table = await loadTable();
    const report = evaluateSkillAvailability(table, registry());

    assert.equal(
      resultFor(report, 'problem-framing', 'scientific-brainstorming').status,
      'available'
    );
    assert.equal(
      resultFor(report, 'hypothesis-from-data', 'hypothesis-generation').status,
      'missing'
    );
    assert.equal(report.skillInvocationAttempted, false);
  });

  it('treats vibe-science workflow separately from host skill availability', async () => {
    const table = await loadTable();
    const report = evaluateSkillAvailability(table, registry({ hostSkills: ['vibe'] }));
    const vibe = resultFor(report, 'novelty-literature-gap', 'vibe');

    assert.equal(vibe.targetKind, 'vibe-science-workflow');
    assert.equal(vibe.status, 'available');
    assert.equal(report.vibeNamingStates.hostSkillVibe.status, 'available');
    assert.equal(report.vibeNamingStates.vibeScienceWorkflow.status, 'available');
    assert.equal(report.vibeNamingStates.codexGlobalInstall.status, 'missing');
  });

  it('requires explicit skill-family matches', async () => {
    const table = await loadTable();
    const missingFamily = evaluateSkillAvailability(table, registry({ skillFamilies: [] }));
    const presentFamily = evaluateSkillAvailability(table, registry());

    assert.equal(
      resultFor(missingFamily, 'novelty-literature-gap', 'literature-search').status,
      'missing'
    );
    assert.equal(
      resultFor(presentFamily, 'novelty-literature-gap', 'literature-search').status,
      'available'
    );
  });

  it('rejects duplicate target rows in the table', async () => {
    const table = await loadTable();
    const duplicate = structuredClone(table);
    duplicate.stages[0].targets.push({ ...duplicate.stages[0].targets[0] });

    assert.throws(
      () => evaluateSkillAvailability(duplicate, registry()),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DUPLICATE_TARGET'
    );
  });

  it('rejects blank stage and target identifiers', async () => {
    const table = await loadTable();
    const blankStage = structuredClone(table);
    blankStage.stages[0].stageId = ' ';
    const blankTarget = structuredClone(table);
    blankTarget.stages[0].targets[0].targetId = '';

    assert.throws(
      () => evaluateSkillAvailability(blankStage, registry()),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_PROBE_TABLE_REQUIRED'
    );
    assert.throws(
      () => evaluateSkillAvailability(blankTarget, registry()),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_PROBE_TABLE_REQUIRED'
    );
  });

  it('does not emit T13.1.3 degrade markers', async () => {
    const table = await loadTable();
    const report = evaluateSkillAvailability(table, registry({ hostSkills: [] }));
    const serialized = JSON.stringify(report);

    assert.equal(report.degradeApplied, false);
    assert.equal(serialized.includes('SKILL_UNAVAILABLE'), false);
  });
});
