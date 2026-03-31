function toSeconds(startedAt, endedAt) {
  if (!startedAt || !endedAt) {
    return null;
  }

  const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(elapsedMs) ? elapsedMs / 1000 : null;
}

export const metricId = 'resume-latency';
export const description = 'Measures whether a resume scenario completes within the Phase 1 operator budget.';

export function evaluate(input) {
  const thresholdSeconds = input.maxSeconds ?? 120;
  const elapsedSeconds = input.elapsedSeconds ?? toSeconds(input.startedAt, input.endedAt);

  if (elapsedSeconds == null || Number.isNaN(elapsedSeconds)) {
    return {
      metricId,
      passed: false,
      value: null,
      thresholdSeconds,
      reason: 'elapsed time unavailable'
    };
  }

  return {
    metricId,
    passed: elapsedSeconds <= thresholdSeconds,
    value: elapsedSeconds,
    thresholdSeconds
  };
}
