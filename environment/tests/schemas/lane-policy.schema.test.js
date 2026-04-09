import {
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'lane-policy.schema.json',
  suiteName: 'lane-policy.schema',
  validFixture: {
    schemaVersion: 'vibe-orch.lane-policy.v1',
    lanes: {
      execution: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'streaming',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: false,
        model: 'gpt-5.4',
        thinkingDepth: 'high',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 2,
          backoffStrategy: 'fixed',
          cooldownMinutes: 10
        },
        costCeiling: {
          maxPromptTokens: 12000,
          maxOutputTokens: 4000,
          maxUsd: null
        },
        escalationThreshold: 'medium',
        notes: null
      },
      review: {
        enabled: true,
        providerRef: 'anthropic/claude-code',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: true,
        supervisionCapability: 'output-only',
        interactive: false,
        backgroundSafe: true,
        parallelAllowed: false,
        reviewOnly: true,
        model: 'claude-opus-4-6',
        thinkingDepth: 'high',
        autonomyLevel: 'advisory',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null
        },
        costCeiling: {
          maxPromptTokens: 6000,
          maxOutputTokens: 3000,
          maxUsd: null
        },
        escalationThreshold: 'high',
        notes: null
      }
    }
  },
  invalidFixture: {
    schemaVersion: 'vibe-orch.lane-policy.v1',
    lanes: {
      execution: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'terminal',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'streaming',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: false,
        model: 'gpt-5.4',
        thinkingDepth: 'high',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 2,
          backoffStrategy: 'fixed',
          cooldownMinutes: 10
        },
        costCeiling: {
          maxPromptTokens: 12000,
          maxOutputTokens: 4000,
          maxUsd: null
        },
        escalationThreshold: 'urgent'
      }
    }
  },
  degradedFixture: {
    schemaVersion: 'vibe-orch.lane-policy.v1',
    lanes: {
      execution: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'streaming',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: false,
        model: 'gpt-5.4',
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'fixed',
          cooldownMinutes: 5
        },
        costCeiling: {
          maxPromptTokens: 8000,
          maxOutputTokens: 2000,
          maxUsd: null
        },
        escalationThreshold: 'high',
        notes: 'Temporary conservative defaults while the coordinator MVP lands.'
      },
      review: {
        enabled: true,
        providerRef: 'anthropic/claude-code',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'output-only',
        interactive: false,
        backgroundSafe: true,
        parallelAllowed: false,
        reviewOnly: true,
        model: 'claude-opus-4-6',
        thinkingDepth: 'medium',
        autonomyLevel: 'advisory',
        retryPolicy: {
          maxAttempts: 0,
          backoffStrategy: 'manual',
          cooldownMinutes: null
        },
        costCeiling: {
          maxPromptTokens: 4000,
          maxOutputTokens: 1500,
          maxUsd: null
        },
        escalationThreshold: 'immediate',
        notes: null
      }
    }
  }
});
