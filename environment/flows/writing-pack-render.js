export function renderAdvisorStatusSummary(packDate, session, writing) {
  return [
    `# Advisor Status Summary - ${packDate}`,
    '',
    `- Active flow: ${session?.activeFlow ?? 'none'}`,
    `- Current stage: ${session?.currentStage ?? 'none'}`,
    `- Last command: ${session?.lastCommand ?? 'none'}`,
    `- Recent writing snapshots: ${writing.totalSnapshots}`,
    `- Recent export alerts: ${writing.totalAlerts}`,
    '',
    '## Latest Snapshot',
    ...(writing.snapshots.length === 0
      ? ['- No writing snapshot has been generated yet.']
      : writing.snapshots.slice(0, 3).map((snapshot) => (
          `- ${snapshot.snapshotId} (${snapshot.claimIds.length} claims, ${snapshot.eligibleClaimCount} eligible)`
        ))),
    '',
  ].join('\n');
}

export function renderExperimentProgress(manifests, bundles) {
  const bundleByExperiment = new Map((bundles ?? []).map((bundle) => [bundle.experimentId, bundle]));
  const lines = ['# Experiment Progress', ''];

  if (!Array.isArray(manifests) || manifests.length === 0) {
    lines.push('- No experiment manifests are registered.', '');
    return lines.join('\n');
  }

  for (const manifest of manifests.sort((left, right) => left.experimentId.localeCompare(right.experimentId))) {
    lines.push(`## ${manifest.experimentId}`);
    lines.push(`- Title: ${manifest.title}`);
    lines.push(`- Status: ${manifest.status}`);
    lines.push(`- Related claims: ${formatList(manifest.relatedClaims)}`);
    const bundle = bundleByExperiment.get(manifest.experimentId);
    lines.push(`- Result bundle: ${bundle?.bundleDir ?? 'not packaged'}`);
    lines.push(`- Latest digest: ${bundle?.latestSessionDigest?.digestId ?? 'none'}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function renderOpenQuestions(session, flowIndex, manifests, writing) {
  const lines = ['# Open Questions', ''];
  const blockers = uniqueStrings([
    ...(session?.blockers ?? []),
    ...(flowIndex?.blockers ?? []),
    ...manifests.flatMap((manifest) => (
      (manifest.blockers ?? []).map((entry) => `${manifest.experimentId}: ${entry}`)
    )),
  ]);

  if (blockers.length === 0 && writing.alerts.length === 0) {
    lines.push('- No explicit blockers or export alerts are currently open.', '');
    return lines.join('\n');
  }

  if (blockers.length > 0) {
    lines.push('## Blockers');
    lines.push(...blockers.slice(0, 10).map((entry) => `- ${entry}`));
    lines.push('');
  }

  if (writing.alerts.length > 0) {
    lines.push('## Export Alerts');
    lines.push(...writing.alerts.slice(0, 10).map((entry) => `- ${entry.claimId}: ${entry.message}`));
    lines.push('');
  }

  return lines.join('\n');
}

export function renderNextSteps(session, flowIndex, writing) {
  const nextActions = uniqueStrings([
    ...(session?.nextActions ?? []),
    ...(flowIndex?.nextActions ?? []),
    ...(writing.totalAlerts > 0 ? ['review export alert surface before reusing old draft language'] : []),
    ...(writing.totalSnapshots === 0 ? ['run /flow-writing to generate a frozen snapshot before drafting results'] : []),
  ]);

  return [
    '# Next Steps',
    '',
    ...(nextActions.length === 0
      ? ['- No next actions were recorded.']
      : nextActions.slice(0, 10).map((entry) => `- ${entry}`)),
    '',
  ].join('\n');
}

export function renderReviewerComments(comments) {
  return [
    '# Reviewer Comments',
    '',
    ...(comments.length === 0
      ? ['- No reviewer comments were imported.']
      : comments.map((comment) => `- ${comment}`)),
    '',
  ].join('\n');
}

export function renderClaimStatus(claimIds, claimHeads, citationChecks, exports) {
  const claimHeadById = new Map((claimHeads ?? []).map((entry) => [entry.claimId, entry]));
  const exportsByClaim = new Map();
  for (const entry of exports ?? []) {
    if (typeof entry?.claimId !== 'string' || exportsByClaim.has(entry.claimId)) {
      continue;
    }
    exportsByClaim.set(entry.claimId, entry);
  }
  const lines = ['# Claim Status', ''];

  if (claimIds.length === 0) {
    lines.push('- No challenged claims were identified.', '');
    return lines.join('\n');
  }

  for (const claimId of claimIds) {
    const head = claimHeadById.get(claimId) ?? null;
    const exportRecord = exportsByClaim.get(claimId) ?? null;
    const relatedCitations = (citationChecks ?? []).filter((entry) => entry?.claimId === claimId);

    lines.push(`## ${claimId}`);
    lines.push(`- Current status: ${head?.currentStatus ?? 'unavailable'}`);
    lines.push(`- Current confidence: ${formatConfidence(head?.confidence ?? null)}`);
    lines.push(`- Latest export snapshot: ${exportRecord?.snapshotId ?? 'none'}`);
    lines.push(`- Latest export artifact: ${exportRecord?.artifactPath ?? 'none'}`);
    lines.push(`- Citations now: ${formatCitationStatuses(relatedCitations)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function renderExperimentPlan(claimIds, manifests, bundles) {
  const bundleByExperiment = new Map((bundles ?? []).map((bundle) => [bundle.experimentId, bundle]));
  const lines = ['# Experiment Plan', ''];
  const relevant = (manifests ?? []).filter((manifest) => (
    Array.isArray(manifest.relatedClaims)
    && manifest.relatedClaims.some((claimId) => claimIds.includes(claimId))
  ));

  if (relevant.length === 0) {
    lines.push('- No registered experiments are linked to the challenged claims yet.', '');
    return lines.join('\n');
  }

  for (const manifest of relevant.sort((left, right) => left.experimentId.localeCompare(right.experimentId))) {
    const bundle = bundleByExperiment.get(manifest.experimentId);
    lines.push(`## ${manifest.experimentId}`);
    lines.push(`- Objective: ${manifest.objective}`);
    lines.push(`- Status: ${manifest.status}`);
    lines.push(`- Bundle: ${bundle?.bundleDir ?? 'not packaged'}`);
    lines.push(`- Current blockers: ${formatList(manifest.blockers)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function renderResponseDraft(comments, claimIds, claimHeads, alerts) {
  const claimHeadById = new Map((claimHeads ?? []).map((entry) => [entry.claimId, entry]));
  const lines = [
    '# Response Draft',
    '',
    '## Boundary',
    '- This pack organizes evidence and open issues only.',
    '- It does not fabricate resolved answers or new validated findings.',
    '',
  ];

  if (comments.length === 0) {
    lines.push('## Reviewer Input');
    lines.push('- Reviewer comments are not yet imported.');
    lines.push('');
  }

  for (const claimId of claimIds) {
    const head = claimHeadById.get(claimId) ?? null;
    const claimAlerts = (alerts ?? []).filter((entry) => entry?.claimId === claimId);
    lines.push(`## ${claimId}`);
    lines.push('- Reviewer concern: [summarize from reviewer-comments.md]');
    lines.push(`- Current status: ${head?.currentStatus ?? 'unavailable'}`);
    lines.push(`- Current confidence: ${formatConfidence(head?.confidence ?? null)}`);
    lines.push(`- Known alerts: ${claimAlerts.length === 0 ? 'none' : claimAlerts.map((entry) => entry.kind).join(', ')}`);
    lines.push('- Needed follow-up: [fill after reviewing claim-status.md and experiment-plan.md]');
    lines.push('- Draft response: [write once evidence is confirmed]');
    lines.push('');
  }

  if (claimIds.length === 0) {
    lines.push('## No Claim Targets');
    lines.push('- Add challenged claim ids to turn this skeleton into a claim-specific rebuttal plan.');
    lines.push('');
  }

  return lines.join('\n');
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'none';
}

function formatConfidence(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(2) : 'unavailable';
}

function formatCitationStatuses(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'none';
  }

  return values
    .map((entry) => `${entry.citationId ?? 'UNKNOWN'}:${entry.verificationStatus ?? 'UNKNOWN'}`)
    .join(', ');
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''))];
}
