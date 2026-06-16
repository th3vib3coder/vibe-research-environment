import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  evaluateFirstResearchPacketExecution,
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';

export default async function validatePhase11FirstResearchPacket() {
  const result = evaluateFirstResearchPacketExecution(
    makeFirstResearchPacketExecutionFixture()
  );

  assert(result.ok, `Valid first research packet failed: ${JSON.stringify(result.issues)}`);
  assert(
    result.decision === 'first-research-packet-blocked-actionable',
    `Unexpected decision: ${result.decision}`
  );
  assert(result.claimReady === false, 'First packet must not be claim-ready');
  assert(result.promotesClaim === false, 'First packet must not promote a claim');
  assert(result.realDataReadInCi === false, 'CI must not perform real H5AD reads');
  assert(result.reusesResearchPacketSchema === true, 'Packet schema must be reused');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-first-research-packet', validatePhase11FirstResearchPacket);
}
