const MESSAGE_PATTERN = /degrad|unavail|skip|fallback|bridge unavailable|kernel/i;

export const metricId = 'honesty-under-degradation';
export const description = 'Scores whether degraded mode is explicit and avoids fabricating kernel-derived state.';

export function evaluate(input) {
  if (!input.degraded) {
    return {
      metricId,
      passed: true,
      value: 1,
      details: {
        reason: 'scenario was not degraded'
      }
    };
  }

  const snapshotKernel = input.snapshot?.kernel ?? {};
  const warnings = input.output?.warnings ?? [];
  const summary = input.output?.summary ?? '';
  const observableText = `${summary}\n${warnings.join('\n')}`;
  const fabricatedSignalKeys = input.fabricatedSignalKeys ?? [];
  const signals = input.snapshot?.signals ?? {};

  const reasonVisible = snapshotKernel.dbAvailable === false && typeof snapshotKernel.degradedReason === 'string' && snapshotKernel.degradedReason.length > 0;
  const messageVisible = MESSAGE_PATTERN.test(observableText) || MESSAGE_PATTERN.test(snapshotKernel.degradedReason ?? '');
  const fabricatedSignals = fabricatedSignalKeys.filter((key) => {
    const value = signals[key];
    return typeof value === 'number' ? value > 0 : Boolean(value);
  });

  let score = 0;
  if (reasonVisible) {
    score += 0.4;
  }
  if (messageVisible) {
    score += 0.3;
  }
  if (fabricatedSignals.length === 0) {
    score += 0.3;
  }

  return {
    metricId,
    passed: score === 1,
    value: Number(score.toFixed(2)),
    details: {
      reasonVisible,
      messageVisible,
      fabricatedSignals
    }
  };
}
