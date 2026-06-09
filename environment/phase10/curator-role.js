export const CURATOR_AGENT_ROLE_ID = 'curator-agent';

export const CURATOR_ALLOWED_TASK_KINDS = Object.freeze([
  'phase10-wiki-lint',
  'phase10-wiki-compile',
]);

export const CURATOR_ALLOWED_ACTIONS = Object.freeze([
  'run-wiki-lint',
  'run-wiki-compile',
  'write-wiki-page',
  'propose-handoff',
]);

export function planCuratorWikiLint(input = {}) {
  return Object.freeze({
    status: 'planned',
    taskKind: 'phase10-wiki-lint',
    phase10Role: CURATOR_AGENT_ROLE_ID,
    readsFullInbox: false,
    readsSkillCachePayloads: false,
    canMutateClaimLedger: false,
    input,
  });
}

export function planCuratorWikiCompile(input = {}) {
  return Object.freeze({
    status: 'planned',
    taskKind: 'phase10-wiki-compile',
    phase10Role: CURATOR_AGENT_ROLE_ID,
    readsFullInbox: false,
    readsSkillCachePayloads: false,
    canMutateClaimLedger: false,
    input,
  });
}
