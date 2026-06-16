import { assert, isDirectRun, runValidator } from './_helpers.js';
import {
  evaluatePhase11ResearchPacket,
  makePhase11ResearchPacketFixture
} from '../../phase11/research-packet.js';

export default async function validatePhase11ResearchPacket() {
  const result = evaluatePhase11ResearchPacket(makePhase11ResearchPacketFixture());

  assert(result.ok, `Valid Phase 11 packet scaffold failed: ${JSON.stringify(result.issues)}`);
  assert(result.decision === 'packet-scaffold-ready', `Unexpected decision: ${result.decision}`);
  assert(result.claimReady === false, 'Packet scaffold must not be claim-ready');
  assert(result.performsAnalysis === false, 'Packet scaffold must not perform analysis');
  assert(result.promotesClaim === false, 'Packet scaffold must not promote a claim');
  assert(result.usesExistingExperimentSurfaces === true, 'Packet must reuse existing VRE surfaces');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-research-packet', validatePhase11ResearchPacket);
}
