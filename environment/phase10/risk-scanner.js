const CAUSAL_OR_MECHANISTIC_PATTERNS = [
  /\bcauses?\b/iu,
  /\bdrives?\b/iu,
  /\bleads?\s+to\b/iu,
  /\bmediates?\b/iu,
  /\binduces?\b/iu,
  /\bregulates?\b/iu,
  /\bmechanis(?:m|tic)\b/iu,
  /\bpathways?\b/iu
];

const HEDGE_CAUSALITY_PATTERNS = [
  /\bmay\s+underl(?:ie|y)\b/iu,
  /\bsuggests?\s+that\b/iu,
  /\bis\s+consistent\s+with\b/iu,
  /\bcould\s+underl(?:ie|y)\b/iu
];

function hasPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function scanAssertionRisk(assertion = {}) {
  const text = String(assertion.text ?? '');
  const flags = [];

  if (hasPattern(text, CAUSAL_OR_MECHANISTIC_PATTERNS)) {
    flags.push('causal-or-mechanistic-language');
  }
  if (hasPattern(text, HEDGE_CAUSALITY_PATTERNS)) {
    flags.push('hedge-causality');
  }

  return [...new Set(flags)].sort();
}
