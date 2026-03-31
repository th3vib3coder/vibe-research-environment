export const metricId = 'state-write-scope';
export const description = 'Checks that writes stay inside allowed outer-project paths and never touch kernel truth.';

function isUnderAllowedPrefix(file, allowedPrefixes) {
  return allowedPrefixes.some((prefix) => file.startsWith(prefix));
}

function isUnderForbiddenPrefix(file, forbiddenPrefixes) {
  return forbiddenPrefixes.some((prefix) => file.startsWith(prefix));
}

export function evaluate(input) {
  const actualWrites = input.actualWrites ?? [];
  const allowedPrefixes = input.allowedPrefixes ?? [];
  const forbiddenPrefixes = input.forbiddenPrefixes ?? [];

  const violations = actualWrites.filter((file) =>
    !isUnderAllowedPrefix(file, allowedPrefixes) || isUnderForbiddenPrefix(file, forbiddenPrefixes)
  );

  const safeWrites = actualWrites.length - violations.length;
  const value = actualWrites.length === 0 ? 1 : safeWrites / actualWrites.length;

  return {
    metricId,
    passed: violations.length === 0,
    value: Number(value.toFixed(2)),
    details: {
      actualWrites,
      violations
    }
  };
}
