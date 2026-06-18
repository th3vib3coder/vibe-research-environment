import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  Phase13SkillProbeError,
  buildMissingSkillDegradeReport,
  evaluateSkillAvailability
} from '../../../autonomous/l1/skill-probe.js';

function availabilityReport(overrides = {}) {
  return {
    schemaVersion: 'phase13.l1-skill-availability-report.v1',
    phase: 13,
    layer: 'L1',
    artifact: 'skill-availability-report',
    policyOnly: true,
    runtimeOpened: false,
    skillInvocationAttempted: false,
    degradeApplied: false,
    generatedFrom: 'registry-injected',
    targetResults: [
      {
        resultId: 'problem-framing::scientific-brainstorming',
        stageId: 'problem-framing',
        targetId: 'scientific-brainstorming',
        targetKind: 'host-skill',
        required: true,
        status: 'missing',
        runtimeOpened: false,
        skillInvocationAttempted: false
      },
      {
        resultId: 'novelty-literature-gap::literature-search',
        stageId: 'novelty-literature-gap',
        targetId: 'literature-search',
        targetKind: 'skill-family',
        required: false,
        status: 'missing',
        runtimeOpened: false,
        skillInvocationAttempted: false
      },
      {
        resultId: 'closeout::verification-before-completion',
        stageId: 'closeout',
        targetId: 'verification-before-completion',
        targetKind: 'host-skill',
        required: true,
        status: 'available',
        runtimeOpened: false,
        skillInvocationAttempted: false
      }
    ],
    vibeNamingStates: {},
    summary: {
      totalTargets: 3,
      availableTargets: 1,
      missingTargets: 2,
      requiredMissingTargets: 1
    },
    ...overrides
  };
}

describe('Phase 13 L1 missing-skill degrade report', () => {
  it('emits SKILL_UNAVAILABLE for missing required targets only', () => {
    const report = buildMissingSkillDegradeReport(availabilityReport());

    assert.equal(report.schemaVersion, 'phase13.l1-missing-skill-degrade.v1');
    assert.equal(report.policyOnly, true);
    assert.equal(report.runtimeOpened, false);
    assert.equal(report.skillInvocationAttempted, false);
    assert.equal(report.providerAutomationInvoked, false);
    assert.equal(report.degradeApplied, true);
    assert.equal(report.blocking, true);
    assert.equal(report.requiredGaps.length, 1);
    assert.equal(report.requiredGaps[0].marker, 'SKILL_UNAVAILABLE');
    assert.equal(report.requiredGaps[0].stageId, 'problem-framing');
    assert.equal(report.requiredGaps[0].targetId, 'scientific-brainstorming');
    assert.equal(report.requiredGaps[0].targetKind, 'host-skill');
    assert.equal(report.requiredGaps[0].operatorAction, 'install-or-route-to-human');
    assert.equal(report.requiredGaps[0].claimedStageRan, false);
    assert.equal(report.requiredGaps[0].fabricatedOutput, false);
    assert.equal(report.optionalGaps.length, 1);
    assert.equal(JSON.stringify(report.optionalGaps).includes('SKILL_UNAVAILABLE'), false);
  });

  it('keeps optional missing targets visible but non-blocking', () => {
    const source = availabilityReport({
      targetResults: availabilityReport().targetResults.filter((row) =>
        row.targetId !== 'scientific-brainstorming'
      )
    });
    const report = buildMissingSkillDegradeReport(source);

    assert.equal(report.requiredGaps.length, 0);
    assert.equal(report.optionalGaps.length, 1);
    assert.equal(report.blocking, false);
    assert.equal(report.degradeApplied, false);
    assert.equal(report.optionalGaps[0].stageId, 'novelty-literature-gap');
    assert.equal(report.optionalGaps[0].targetKind, 'skill-family');
  });

  it('emits no marker when every target is available', () => {
    const source = availabilityReport({
      targetResults: availabilityReport().targetResults.map((row) => ({
        ...row,
        status: 'available'
      }))
    });
    const report = buildMissingSkillDegradeReport(source);
    const serialized = JSON.stringify(report);

    assert.equal(report.requiredGaps.length, 0);
    assert.equal(report.optionalGaps.length, 0);
    assert.equal(report.blocking, false);
    assert.equal(report.degradeApplied, false);
    assert.equal(serialized.includes('SKILL_UNAVAILABLE'), false);
  });

  it('fails closed on malformed reports and duplicate result rows', () => {
    assert.throws(
      () => buildMissingSkillDegradeReport(),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED'
    );
    assert.throws(
      () => buildMissingSkillDegradeReport(availabilityReport({ schemaVersion: 'wrong' })),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED'
    );
    const duplicate = availabilityReport();
    duplicate.targetResults.push({ ...duplicate.targetResults[0] });
    assert.throws(
      () => buildMissingSkillDegradeReport(duplicate),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_DUPLICATE_RESULT'
    );
  });

  it('rejects reports that claim runtime, invocation, or previous degrade', () => {
    assert.throws(
      () => buildMissingSkillDegradeReport(availabilityReport({ runtimeOpened: true })),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED'
    );
    assert.throws(
      () => buildMissingSkillDegradeReport(
        availabilityReport({ skillInvocationAttempted: true })
      ),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED'
    );
    assert.throws(
      () => buildMissingSkillDegradeReport(availabilityReport({ degradeApplied: true })),
      (error) => error instanceof Phase13SkillProbeError
        && error.code === 'E_PHASE13_L1_DEGRADE_REPORT_REQUIRED'
    );
  });

  it('preserves vibe workflow naming without treating it as host skill execution', () => {
    const source = availabilityReport({
      targetResults: [
        {
          resultId: 'novelty-literature-gap::vibe',
          stageId: 'novelty-literature-gap',
          targetId: 'vibe',
          targetKind: 'vibe-science-workflow',
          required: true,
          status: 'missing',
          runtimeOpened: false,
          skillInvocationAttempted: false
        }
      ]
    });
    const report = buildMissingSkillDegradeReport(source);

    assert.equal(report.requiredGaps[0].targetId, 'vibe');
    assert.equal(report.requiredGaps[0].targetKind, 'vibe-science-workflow');
    assert.equal(report.requiredGaps[0].claimedStageRan, false);
  });

  it('does not mutate evaluateSkillAvailability output with degrade markers', () => {
    const table = {
      stages: [
        {
          stageId: 'closeout',
          targets: [
            {
              targetId: 'verification-before-completion',
              targetKind: 'host-skill',
              required: true
            }
          ]
        }
      ]
    };
    const report = evaluateSkillAvailability(table, {
      hostSkills: [],
      skillFamilies: [],
      vibeScienceWorkflows: [],
      codexGlobalInstalls: []
    });

    assert.equal(report.degradeApplied, false);
    assert.equal(JSON.stringify(report).includes('SKILL_UNAVAILABLE'), false);
  });
});
