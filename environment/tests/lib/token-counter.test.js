import test from 'node:test';
import assert from 'node:assert/strict';

import { INTERNALS, countTokens } from '../../lib/token-counter.js';

test('countTokens uses provider-native counter when available', async () => {
  const result = await countTokens('hello world', {
    provider: 'anthropic',
    model: 'claude-test',
    providerCounter: async (text, context) => {
      assert.equal(text, 'hello world');
      assert.equal(context.provider, 'anthropic');
      assert.equal(context.model, 'claude-test');
      return { input_tokens: 11 };
    }
  });

  assert.deepEqual(result, {
    count: 11,
    mode: 'provider_native'
  });
});

test('countTokens falls back honestly when provider-native counting throws', async () => {
  const fallbackErrors = [];
  const result = await countTokens('12345678', {
    providerCounter: async () => {
      throw new Error('sdk unavailable');
    },
    onFallbackError(message) {
      fallbackErrors.push(message);
    }
  });

  assert.deepEqual(result, {
    count: 2,
    mode: 'char_fallback'
  });
  assert.deepEqual(fallbackErrors, ['sdk unavailable']);
});

test('countTokens swallows fallback reporting failures and still returns fallback output', async () => {
  const result = await countTokens('12345678', {
    providerCounter: async () => {
      throw new Error('sdk unavailable');
    },
    onFallbackError() {
      throw new Error('logger failed');
    }
  });

  assert.deepEqual(result, {
    count: 2,
    mode: 'char_fallback'
  });
});

test('countTokens falls back when provider-native counter returns an unsupported shape', async () => {
  const result = await countTokens('1234', {
    providerCounter: async () => ({ nope: true })
  });

  assert.deepEqual(result, {
    count: 1,
    mode: 'char_fallback'
  });
});

test('countTokens normalizes non-string input and respects charsPerToken fallback tuning', async () => {
  const result = await countTokens(123456, {
    charsPerToken: 3
  });

  assert.deepEqual(result, {
    count: 2,
    mode: 'char_fallback'
  });
});

test('fallback estimator returns zero tokens for empty input', () => {
  assert.equal(INTERNALS.estimateCharFallbackCount(''), 0);
});
