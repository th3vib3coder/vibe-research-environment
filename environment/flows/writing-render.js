export function renderClaimBackedSeed(snapshot, claim, options = {}) {
  const head = options.claimHead ?? null;
  const citations = normalizeArray(options.citations);
  const manifests = normalizeArray(options.manifests);
  const resultBundles = normalizeArray(options.resultBundles);
  const notes = normalizeArray(options.notes);
  const lines = [
    `# Results Seed - Claim ${claim.claimId}`,
    '',
    `- Snapshot ID: ${snapshot.snapshotId}`,
    `- Claim ID: ${claim.claimId}`,
    `- Exported at: ${snapshot.createdAt}`,
    `- Status at export: ${claim.statusAtExport}`,
    `- Confidence at export: ${formatConfidence(claim.confidenceAtExport)}`,
    `- Governance profile at creation: ${claim.governanceProfileAtCreation}`,
    `- Eligible for claim-backed writing: ${claim.eligible ? 'yes' : 'no'}`,
    '',
    '## Claim-Backed Facts',
    ...renderClaimBackedFacts(head, claim),
    '',
    '## Citations',
    ...renderCitations(citations),
    '',
    '## Artifact-Backed Context',
    ...renderArtifactBackedContext(manifests, resultBundles),
  ];

  if (notes.length > 0) {
    lines.push('');
    lines.push('## Export Notes');
    lines.push(...notes.map((note) => `- ${note}`));
  }

  lines.push('');
  lines.push('## Free-Writing Boundary');
  lines.push(
    '- Use this seed to draft prose, not to redefine truth.',
    '- Methods, preprocessing, and parameter narration must stay traceable to manifests and result bundles.',
    '- Discussion, hypotheses, and framing remain non-kernel-authoritative.',
    '- Do not introduce blocked claims or unverified citations as validated findings.',
    '',
  );

  return lines.join('\n');
}

function renderClaimBackedFacts(head, claim) {
  const narrative = typeof head?.narrative === 'string' ? head.narrative.trim() : '';
  const lines = [];

  if (narrative !== '') {
    lines.push(`- Canonical finding: ${narrative}`);
  } else {
    lines.push('- Canonical finding summary unavailable; use claimId plus lifecycle metadata only.');
  }

  if (Array.isArray(claim.reasons) && claim.reasons.length > 0) {
    lines.push(`- Eligibility notes: ${claim.reasons.join(', ')}`);
  }

  return lines;
}

function renderCitations(citations) {
  if (citations.length === 0) {
    return ['- No tracked citations were available at export time.'];
  }

  return citations.map((citation) => {
    const verificationStatus = citation?.verificationStatus ?? citation?.verificationStatusAtExport ?? 'UNKNOWN';
    return `- ${citation?.citationId ?? 'UNKNOWN'} (${verificationStatus})`;
  });
}

function renderArtifactBackedContext(manifests, resultBundles) {
  if (manifests.length === 0) {
    return ['- No supporting experiment manifests are linked to this claim.'];
  }

  const bundleByExperiment = new Map(
    resultBundles
      .filter((entry) => entry?.experimentId)
      .map((entry) => [entry.experimentId, entry]),
  );

  const lines = [];
  for (const manifest of manifests) {
    lines.push(
      `- ${manifest.experimentId} (${manifest.status})${formatObjectiveSuffix(manifest.objective)}`,
    );

    const bundle = bundleByExperiment.get(manifest.experimentId);
    if (bundle != null) {
      lines.push(`  result bundle: ${bundle.bundleDir}`);
      if (bundle.analysisReportPath) {
        lines.push(`  analysis report: ${bundle.analysisReportPath}`);
      }
      if (bundle.figureCatalogPath) {
        lines.push(`  figure catalog: ${bundle.figureCatalogPath}`);
      }
    }
  }

  return lines;
}

function formatObjectiveSuffix(objective) {
  if (typeof objective !== 'string' || objective.trim() === '') {
    return '';
  }

  return ` - ${objective.trim()}`;
}

function formatConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'unavailable';
  }

  return value.toFixed(2);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}
