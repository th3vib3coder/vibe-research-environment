import { defineSchemaFixtureTests } from './schema-test-helper.js';

const sourceRepeat = {
  taskId: 'flow-writing-export-eligibility-positive',
  repeatId: '2026-04-17-01',
  inputPath:
    '.vibe-science-environment/operator-validation/benchmarks/flow-writing-export-eligibility-positive/2026-04-17-01/input.json',
  outputPath:
    '.vibe-science-environment/operator-validation/benchmarks/flow-writing-export-eligibility-positive/2026-04-17-01/output.json',
  metricsPath:
    '.vibe-science-environment/operator-validation/benchmarks/flow-writing-export-eligibility-positive/2026-04-17-01/metrics.json',
  summaryPath:
    '.vibe-science-environment/operator-validation/benchmarks/flow-writing-export-eligibility-positive/2026-04-17-01/summary.json',
  transcriptPath:
    '.vibe-science-environment/operator-validation/benchmarks/flow-writing-export-eligibility-positive/2026-04-17-01/transcript.md'
};

const validFixture = {
  schemaVersion: 'vibe-env.operator-validation-artifact.v1',
  artifactId: 'phase3-operator-validation',
  phase: 3,
  benchmarkId: 'phase3-writing-deliverables',
  generatedAt: '2026-04-17T10:00:00Z',
  createdAt: '2026-04-17T10:00:00Z',
  passed: true,
  replacesArtifact:
    '.vibe-science-environment/operator-validation/artifacts/archive/phase3-operator-validation.pre-5_5.json',
  validationClaims: ['claim-backed writing evidence is regenerated'],
  decisions: {
    metricRegeneration: 'Three live repeats are regenerated and aggregated.'
  },
  sourceRepeats: {
    positiveExport: [sourceRepeat]
  },
  evidence: {
    positiveExport: {
      claim: 'Strict promoted claim flows into claim-backed writing.',
      sourceRepeat,
      sourceRepeats: [sourceRepeat],
      metrics: {
        resumeLatencySeconds: 0.04,
        degradedHonestyScore: {
          status: 'not-applicable',
          reason: 'Scenario does not exercise degraded mode.'
        },
        attemptLifecycleCompleteness: 1,
        snapshotPublishSuccess: 1
      }
    }
  }
};

defineSchemaFixtureTests({
  schemaFile: 'operator-validation-artifact.schema.json',
  suiteName: 'operator-validation-artifact.schema',
  validFixture,
  invalidFixture: {
    ...validFixture,
    evidence: {
      positiveExport: {
        ...validFixture.evidence.positiveExport,
        metrics: {
          resumeLatencySeconds: null
        }
      }
    }
  },
  degradedFixture: {
    ...validFixture,
    replacesArtifact: null,
    evidence: {
      positiveExport: {
        ...validFixture.evidence.positiveExport,
        metrics: {
          resumeLatencySeconds: 0.04,
          degradedHonestyScore: {
            status: 'not-applicable',
            reason: 'No degraded kernel path in this benchmark.'
          }
        }
      }
    }
  }
});
