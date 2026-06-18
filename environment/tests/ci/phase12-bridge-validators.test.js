import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validatePhase12BridgeReview
} from '../../phase12/bridge-validators.js';
import {
  default as validatePhase12BridgeValidators,
  validBridgeInput
} from './phase12-bridge-validators.js';

function expectCode(input, code) {
  const result = validatePhase12BridgeReview(input);
  assert.equal(result.ok, false, `expected ${code}`);
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
  return result;
}

test('bridge validator accepts a complete review-only bridge packet', () => {
  const result = validatePhase12BridgeReview(validBridgeInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.delegatedValidators, [
    'validatePhase12ArtifactSet',
    'validateLaw13BridgeArtifact'
  ]);
});

test('bridge validator delegates existing self-ACCEPT enforcement', () => {
  const input = validBridgeInput();
  input.review.reviewer = 'codex';
  expectCode(input, 'E_PHASE12_SELF_ACCEPT_FORBIDDEN');
});

test('bridge validator delegates Phase 10 R2 path enforcement', () => {
  const input = validBridgeInput();
  input.phase10Law13ReviewExtension.r2PathPresent = false;
  expectCode(input, 'E_PHASE10_R2_PATH_REQUIRED');
});

test('bridge validator delegates Phase 11 source-read enforcement', () => {
  const input = validBridgeInput();
  input.phase11GraphReviewExtension.sourceReadRequired = false;
  expectCode(input, 'E_PHASE12_BRIDGE_CHECK_REQUIRED');
});

test('bridge validator rejects graph paths marked as implementation proof', () => {
  const input = validBridgeInput();
  input.bridgeReviewMetadata.graphPathRole = 'implementation-proof';
  expectCode(input, 'E_PHASE12_GRAPH_PATH_NOT_IMPLEMENTATION_PROOF');
});

test('bridge validator rejects Phase 10 publication or writeback requests', () => {
  const publish = validBridgeInput();
  publish.bridgeReviewMetadata.phase10PublicationRequested = true;
  expectCode(publish, 'E_PHASE12_PHASE10_WRITEBACK_FORBIDDEN');

  const writeback = validBridgeInput();
  writeback.bridgeReviewMetadata.phase10WritebackRequested = true;
  expectCode(writeback, 'E_PHASE12_PHASE10_WRITEBACK_FORBIDDEN');
});

test('bridge validator rejects Graphify execution or writeback requests', () => {
  const execute = validBridgeInput();
  execute.bridgeReviewMetadata.graphifyExecutionRequested = true;
  expectCode(execute, 'E_PHASE12_GRAPHIFY_EXECUTION_FORBIDDEN');

  const writeback = validBridgeInput();
  writeback.bridgeReviewMetadata.graphifyWritebackRequested = true;
  expectCode(writeback, 'E_PHASE12_GRAPHIFY_EXECUTION_FORBIDDEN');
});

test('bridge validator output remains review metadata, not LAW 13 provenance', () => {
  const input = validBridgeInput();
  input.evidenceBundle.tracking.provenanceRefs = [
    { kind: 'phase12-bridge-validator-output', path: 'validation/bridge.json' }
  ];
  expectCode(input, 'E_PHASE12_BRIDGE_VALIDATOR_OUTPUT_NOT_PROVENANCE');
});

test('bridge validator source delegates instead of re-implementing reused checks', async () => {
  const source = await readFile('environment/phase12/bridge-validators.js', 'utf8');
  assert(source.includes('validatePhase12ArtifactSet('));
  assert(source.includes('validateLaw13BridgeArtifact('));
  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
});

test('phase12 bridge validator CI module passes production cases', async () => {
  await validatePhase12BridgeValidators();
});
