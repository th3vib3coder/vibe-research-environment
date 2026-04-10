const DEFAULT_FAILURE_POLICIES = Object.freeze({
  'token-cooldown-or-budget-pause': {
    recoveryAction: 'resume-after-cooldown',
    escalateImmediately: false,
  },
  'tool-failure': {
    recoveryAction: 'retry-with-backoff',
    escalateImmediately: false,
  },
  'dependency-unavailable': {
    recoveryAction: 'retry-with-backoff',
    escalateImmediately: false,
  },
  'contract-mismatch': {
    recoveryAction: 'stop-and-preserve-state',
    escalateImmediately: true,
  },
  'state-conflict-or-corruption': {
    recoveryAction: 'stop-and-preserve-state',
    escalateImmediately: true,
  },
  'ambiguous-user-request': {
    recoveryAction: 'escalate-to-user',
    escalateImmediately: true,
  },
  'blocked-scientific-prerequisite': {
    recoveryAction: 'escalate-to-user',
    escalateImmediately: true,
  },
  'lane-drift': {
    recoveryAction: 'restate-or-reissue-prompt',
    escalateImmediately: false,
  },
});

export function getDefaultRecoveryPolicy(failureClass) {
  const policy = DEFAULT_FAILURE_POLICIES[failureClass];
  if (!policy) {
    throw new Error(`Unknown orchestrator failure class: ${failureClass}`);
  }

  return {
    failureClass,
    ...policy,
  };
}
