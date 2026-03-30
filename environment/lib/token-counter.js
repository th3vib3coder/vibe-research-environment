import { inspect } from 'node:util';

const DEFAULT_CHARS_PER_TOKEN = 4;
const PROVIDER_NATIVE_MODE = 'provider_native';
const CHAR_FALLBACK_MODE = 'char_fallback';

function normalizeText(text) {
  if (typeof text === 'string') {
    return text;
  }

  if (text == null) {
    return '';
  }

  return String(text);
}

function normalizeCharsPerToken(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CHARS_PER_TOKEN;
  }

  return value;
}

function estimateCharFallbackCount(text, options = {}) {
  if (text.length === 0) {
    return 0;
  }

  const charsPerToken = normalizeCharsPerToken(options.charsPerToken);
  return Math.ceil(text.length / charsPerToken);
}

function extractCount(value) {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidates = [
      value.count,
      value.input_tokens,
      value.inputTokens,
      value.total_tokens,
      value.totalTokens,
      value.tokens
    ];

    for (const candidate of candidates) {
      if (Number.isInteger(candidate) && candidate >= 0) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveProviderCounter(options = {}) {
  if (typeof options.providerCounter === 'function') {
    return options.providerCounter;
  }

  if (typeof options.client?.countTokens === 'function') {
    return (text, context) => options.client.countTokens({ text, ...context });
  }

  if (typeof options.client?.messages?.countTokens === 'function') {
    return (text, context) =>
      options.client.messages.countTokens({
        model: context.model,
        messages: [{ role: 'user', content: text }]
      });
  }

  if (typeof options.client?.beta?.messages?.countTokens === 'function') {
    return (text, context) =>
      options.client.beta.messages.countTokens({
        model: context.model,
        messages: [{ role: 'user', content: text }]
      });
  }

  if (typeof options.client?.responses?.countTokens === 'function') {
    return (text, context) =>
      options.client.responses.countTokens({
        model: context.model,
        input: text
      });
  }

  return null;
}

function normalizeFallbackError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return inspect(error);
}

function reportFallbackError(handler, message) {
  if (typeof handler !== 'function') {
    return;
  }

  try {
    handler(message);
  } catch {
    // Fallback reporting must never override the actual fallback result.
  }
}

export async function countTokens(text, options = {}) {
  const normalizedText = normalizeText(text);
  const providerCounter = resolveProviderCounter(options);

  if (providerCounter) {
    try {
      const result = await providerCounter(normalizedText, {
        provider: options.provider ?? null,
        model: options.model ?? null
      });
      const count = extractCount(result);

      if (count != null) {
        return {
          count,
          mode: PROVIDER_NATIVE_MODE
        };
      }
    } catch (error) {
      reportFallbackError(options.onFallbackError, normalizeFallbackError(error));
    }
  }

  return {
    count: estimateCharFallbackCount(normalizedText, options),
    mode: CHAR_FALLBACK_MODE
  };
}

export const INTERNALS = {
  DEFAULT_CHARS_PER_TOKEN,
  estimateCharFallbackCount,
  extractCount,
  normalizeText,
  resolveProviderCounter
};
