import test from 'node:test';
import assert from 'node:assert/strict';

const validSequences = [
  ['CREATED', 'R2_REVIEWED', 'PROMOTED'],
  ['CREATED', 'R2_REVIEWED', 'KILLED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED', 'R2_REVIEWED', 'PROMOTED'],
  ['CREATED', 'R2_REVIEWED', 'DISPUTED', 'R2_REVIEWED', 'KILLED']
];

function isValidClaimSequence(sequence) {
  return validSequences.some((candidate) => JSON.stringify(candidate) === JSON.stringify(sequence));
}

test('CREATED -> PROMOTED without R2_REVIEWED is blocked', () => {
  assert.equal(isValidClaimSequence(['CREATED', 'PROMOTED']), false);
});

test('valid sequence CREATED -> R2_REVIEWED -> PROMOTED passes', () => {
  assert.equal(isValidClaimSequence(['CREATED', 'R2_REVIEWED', 'PROMOTED']), true);
});

test('dead claims do not resurrect through promotion', () => {
  assert.equal(isValidClaimSequence(['CREATED', 'R2_REVIEWED', 'KILLED', 'PROMOTED']), false);
});
