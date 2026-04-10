import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDefaultContinuityProfile,
  buildDefaultLanePolicies,
} from '../../orchestrator/state.js';
import { selectLaneBinding } from '../../orchestrator/provider-gateway.js';

function buildPolicies() {
  return buildDefaultLanePolicies({
    lanes: {
      execution: {
        enabled: true,
        providerRef: null,
        integrationKind: 'local-logic',
        authMode: 'local-only',
        billingMode: 'none',
        apiFallbackAllowed: false,
        supervisionCapability: 'programmatic',
        interactive: false,
        backgroundSafe: true,
        parallelAllowed: false,
        reviewOnly: false,
        model: null,
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: null,
          maxOutputTokens: null,
          maxUsd: null,
        },
        escalationThreshold: 'high',
        notes: null,
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'programmatic',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: true,
        model: 'gpt-5.4',
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: 4000,
          maxOutputTokens: 2000,
          maxUsd: 3,
        },
        escalationThreshold: 'immediate',
        notes: null,
      },
    },
  });
}

test('provider gateway accepts local logic execution bindings', () => {
  const binding = selectLaneBinding({
    laneId: 'execution',
    lanePolicies: buildPolicies(),
    continuityProfile: buildDefaultContinuityProfile(),
    requiredCapability: 'programmatic',
  });

  assert.equal(binding.integrationKind, 'local-logic');
  assert.equal(binding.providerRef, null);
  assert.equal(binding.fallbackApplied, false);
});

test('provider gateway fails closed when lane policy forbids API fallback', () => {
  assert.throws(
    () => selectLaneBinding({
      laneId: 'review',
      lanePolicies: buildPolicies(),
      continuityProfile: buildDefaultContinuityProfile({
        runtime: {
          preferredLaneRoles: [],
          defaultAllowApiFallback: true,
        },
      }),
      requiredCapability: 'programmatic',
      providerExecutors: {
        'openai/codex:api': async () => ({}),
      },
    }),
    /cannot satisfy/u,
  );
});

test('provider gateway uses API fallback when lane policy allows it', () => {
  const lanePolicies = buildPolicies();
  lanePolicies.lanes.review.apiFallbackAllowed = true;

  const binding = selectLaneBinding({
    laneId: 'review',
    lanePolicies,
    continuityProfile: buildDefaultContinuityProfile(),
    requiredCapability: 'programmatic',
    providerExecutors: {
      'openai/codex:api': async () => ({}),
    },
  });

  assert.equal(binding.integrationKind, 'api');
  assert.equal(binding.fallbackApplied, true);
});
