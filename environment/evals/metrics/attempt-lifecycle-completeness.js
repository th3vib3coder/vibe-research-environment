const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'blocked']);

export const metricId = 'attempt-lifecycle-completeness';
export const description = 'Checks that one invocation produces a coherent attempt lifecycle from open to terminal closure.';

export function evaluate(input) {
  const attemptRecords = input.attemptRecords ?? [];
  const statuses = attemptRecords.map((record) => record.status);
  const firstRecord = attemptRecords[0] ?? null;
  const terminalRecord = [...attemptRecords].reverse().find((record) => TERMINAL_STATUSES.has(record.status)) ?? null;

  let score = 0;
  if (attemptRecords.length > 0) {
    score += 0.25;
  }
  if (firstRecord?.status === 'preparing') {
    score += 0.25;
  }
  if (terminalRecord) {
    score += 0.25;
  }
  if (terminalRecord?.endedAt) {
    score += 0.25;
  }

  return {
    metricId,
    passed: score === 1,
    value: Number(score.toFixed(2)),
    details: {
      statuses,
      terminalStatus: terminalRecord?.status ?? null
    }
  };
}
