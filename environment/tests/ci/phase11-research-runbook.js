import { assert, isDirectRun, readJson, readText, runValidator } from './_helpers.js';
import {
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';
import {
  makeResearchRunbookAuthority,
  renderResearchRunbook,
  validateResearchRunbook
} from '../../phase11/research-runbook.js';

export default async function validatePhase11ResearchRunbook() {
  const snapshot = await readJson(
    'environment/tests/fixtures/phase11/research-runbook-authority.json'
  );
  const markdown = await readText('environment/runbooks/phase11-research-runbook.md');
  const authority = makeResearchRunbookAuthority({
    execution: makeFirstResearchPacketExecutionFixture(),
    snapshot
  });
  const canonicalMarkdown = renderResearchRunbook(authority);

  assert(
    markdown.trimEnd() === canonicalMarkdown.trimEnd(),
    'Phase 11 research runbook must match the canonical tracked-authority projection.'
  );

  const result = validateResearchRunbook({ markdown, authority });
  assert(
    result.ok,
    `Phase 11 research runbook failed: ${JSON.stringify(result.issues)}`
  );
  assert(
    result.decision === 'research-runbook-handoff-ready',
    `Unexpected research runbook decision: ${result.decision}`
  );
  assert(result.claimPromotionAllowed === false, 'Runbook must not allow claim promotion');
  assert(result.realDataReadAllowedInCi === false, 'Runbook must not allow real reads in CI');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-research-runbook', validatePhase11ResearchRunbook);
}
