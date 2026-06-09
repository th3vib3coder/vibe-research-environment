import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  LAW13_BRIDGE_CONTRACT_ID,
  REQUIRED_LAW13_BRIDGE_FIELDS,
  validateLaw13BridgeArtifact
} from '../../phase10/law13-bridge.js';

function validArtifact() {
  return {
    artifactId: 'RELAY-CI-001',
    transition: 'claimed',
    law13ReviewExtension: {
      contractId: LAW13_BRIDGE_CONTRACT_ID,
      law13StatusChecked: true,
      provenanceRefsChecked: true,
      queryNotProvenanceCheck: true,
      r2PathRequired: true,
      r2PathPresent: true,
      suppositionIsolationChecked: true
    },
    provenanceRefs: [
      { kind: 'raw-source', targetRef: { type: 'raw-document', id: 'RAW-ci' } }
    ],
    metadataRefs: [
      { kind: 'phase12-relay-verdict', verdictId: 'VERDICT-ci' },
      { kind: 'query-origin', queryId: 'QUERY-ci', path: 'wiki/queries/query-ci.md' }
    ]
  };
}

export default async function validatePhase10Law13Bridge() {
  assert(
    JSON.stringify(REQUIRED_LAW13_BRIDGE_FIELDS) === JSON.stringify([
      'law13StatusChecked',
      'provenanceRefsChecked',
      'queryNotProvenanceCheck',
      'r2PathRequired',
      'r2PathPresent',
      'suppositionIsolationChecked'
    ]),
    'Phase 12 LAW 13 bridge required field catalog drifted'
  );

  const valid = validateLaw13BridgeArtifact(validArtifact());
  assert(valid.ok, `Valid LAW 13 bridge fixture failed: ${JSON.stringify(valid.issues)}`);

  const missingR2 = validArtifact();
  missingR2.law13ReviewExtension.r2PathPresent = false;
  const missingR2Result = validateLaw13BridgeArtifact(missingR2);
  assert(
    missingR2Result.issues.some((issue) => issue.code === 'E_PHASE10_R2_PATH_REQUIRED'),
    'claimed bridge artifact must fail when required R2 path is absent'
  );

  const relayProvenance = validArtifact();
  relayProvenance.provenanceRefs = [
    { kind: 'computed-artifact', targetRef: { type: 'phase12-relay-verdict', id: 'VERDICT-ci' } }
  ];
  const relayResult = validateLaw13BridgeArtifact(relayProvenance);
  assert(
    relayResult.issues.some((issue) => issue.code === 'E_PHASE10_RELAY_VERDICT_NOT_PROVENANCE'),
    'relay verdicts must fail as LAW 13 provenance'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-law13-bridge', validatePhase10Law13Bridge);
}
