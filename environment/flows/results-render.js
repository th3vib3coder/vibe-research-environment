export function buildBundleFiles(manifest, copiedArtifacts, options = {}) {
  const analysisQuestion = normalizeLine(
    options.analysisQuestion ?? manifest.objective ?? 'No analysis question was recorded.',
  );
  const findings = normalizeLines(options.findings, 'No structured findings were provided.');
  const caveats = normalizeLines(options.caveats, 'No packaging caveats were recorded.');
  const environment = normalizeLines(
    options.environment,
    'Environment details were not provided during packaging.',
  );
  const statistics = normalizeLines(
    options.statistics,
    'No structured statistical details were provided during packaging.',
  );
  const warningLines = options.warnings.map((warning) => `- ${warning}`);
  const artifactLines = copiedArtifacts.length === 0
    ? ['- No experiment output artifacts were declared for this bundle.']
    : copiedArtifacts.map((entry) => `- \`${entry.bundleRelativePath}\` (${entry.type}, ${entry.role})`);
  const claimExportLines = renderClaimExportLines(options.claimExportStatuses ?? []);

  return {
    'analysis-report.md': [
      `# Analysis Report - ${manifest.experimentId}`,
      '',
      `- Bundled at: ${options.timestamp}`,
      `- Source attempt: ${options.sourceAttemptId}`,
      `- Dataset hash: ${options.datasetHash ?? 'unavailable'}`,
      `- Related claims: ${formatList(manifest.relatedClaims)}`,
      '',
      '## Analysis Question',
      analysisQuestion,
      '',
      '## Key Findings',
      ...findings.map((line) => `- ${line}`),
      '',
      '## Caveats',
      ...[...caveats, ...options.warnings].map((line) => `- ${line}`),
      '',
      '## Environment',
      ...environment.map((line) => `- ${line}`),
      '',
      ...(claimExportLines.length > 0
        ? [
            '## Claim Export Readiness',
            ...claimExportLines,
            '',
          ]
        : []),
      '',
      '## Evidence Artifacts',
      ...artifactLines,
      '',
    ].join('\n'),
    'stats-appendix.md': [
      `# Stats Appendix - ${manifest.experimentId}`,
      '',
      `- Bundled at: ${options.timestamp}`,
      `- Source attempt: ${options.sourceAttemptId}`,
      `- Dataset hash: ${options.datasetHash ?? 'unavailable'}`,
      '',
      '## Comparison Question',
      normalizeLine(
        options.comparisonQuestion ?? 'No comparison question was locked during packaging.',
      ),
      '',
      '## Statistical Details',
      ...statistics.map((line) => `- ${line}`),
      '',
      '## Packaging Warnings',
      ...(warningLines.length > 0 ? warningLines : ['- No packaging warnings.']),
      '',
    ].join('\n'),
    'figure-catalog.md': renderFigureCatalog(manifest, copiedArtifacts),
  };
}

export function buildBundleArtifacts(bundleFiles, copiedArtifacts, timestamp) {
  const generatedArtifacts = Object.entries(bundleFiles).map(([relativePath, content]) => ({
    path: relativePath,
    type: 'report',
    role: relativePath.replace(/\.md$/u, ''),
    createdAt: timestamp,
    size: Buffer.byteLength(content, 'utf8'),
  }));

  const copiedBundleArtifacts = copiedArtifacts.map((entry) => ({
    path: entry.bundleRelativePath,
    type: entry.type,
    role: entry.role,
    createdAt: entry.createdAt,
    size: entry.size,
  }));

  return [...generatedArtifacts, ...copiedBundleArtifacts];
}

export function buildWarnings(manifest, copiedArtifacts, options = {}) {
  const warnings = [];

  if ((manifest.outputArtifacts ?? []).length === 0) {
    warnings.push('No experiment output artifacts were declared in the manifest.');
  }

  if (!Array.isArray(options.statistics) || options.statistics.length === 0) {
    warnings.push('No structured statistical details were provided during packaging.');
  }

  const figureArtifacts = copiedArtifacts.filter((entry) => entry.type === 'figure');
  if (figureArtifacts.length === 0) {
    warnings.push('No figure artifacts were packaged.');
  }

  for (const figure of figureArtifacts) {
    if (!figure.purpose) {
      warnings.push(`Figure ${figure.bundleRelativePath} is missing a purpose note.`);
    }
    if (!figure.caption) {
      warnings.push(`Figure ${figure.bundleRelativePath} is missing a caption.`);
    }
    if (!figure.interpretation) {
      warnings.push(`Figure ${figure.bundleRelativePath} is missing an interpretation.`);
    }
  }

  for (const claimStatus of options.claimExportStatuses ?? []) {
    if (claimStatus.eligible) {
      continue;
    }

    warnings.push(
      `Claim ${claimStatus.claimId} is not export-eligible yet: ${formatReasonList(claimStatus.reasons)}.`,
    );
  }

  return uniqueStrings(warnings);
}

export function buildWarningActions(experimentId, warnings) {
  const actions = [];

  if (warnings.some((warning) => warning.includes('statistical details'))) {
    actions.push(`add complete statistical details for ${experimentId}`);
  }
  if (warnings.some((warning) => warning.includes('Figure'))) {
    actions.push(`annotate figure interpretations for ${experimentId}`);
  }
  if (warnings.some((warning) => warning.includes('output artifacts'))) {
    actions.push(`attach experiment outputs for ${experimentId}`);
  }
  if (warnings.some((warning) => warning.includes('not export-eligible yet'))) {
    actions.push(`resolve export blockers for claim-linked results in ${experimentId}`);
  }

  return actions;
}

function renderClaimExportLines(claimExportStatuses) {
  if (!Array.isArray(claimExportStatuses) || claimExportStatuses.length === 0) {
    return [];
  }

  return claimExportStatuses.map((status) => (
    `- \`${status.claimId}\`: ${
      status.eligible ? 'eligible for claim-backed writing' : `blocked (${formatReasonList(status.reasons)})`
    }`
  ));
}

function renderFigureCatalog(manifest, copiedArtifacts) {
  const figureArtifacts = copiedArtifacts.filter((entry) => entry.type === 'figure');
  const lines = [`# Figure Catalog - ${manifest.experimentId}`, ''];

  if (figureArtifacts.length === 0) {
    lines.push('No figure artifacts were packaged.', '');
    return lines.join('\n');
  }

  for (const figure of figureArtifacts) {
    lines.push(`## ${figure.bundleRelativePath}`);
    lines.push(`- Source artifact: ${figure.sourceLabel}`);
    lines.push(`- Purpose: ${figure.purpose ?? 'Not provided during packaging.'}`);
    lines.push(`- Caption: ${figure.caption ?? 'Not provided during packaging.'}`);
    lines.push(
      `- Interpretation: ${figure.interpretation ?? 'Not provided during packaging.'}`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

function normalizeLines(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback == null ? [] : [fallback];
  }

  return value
    .map((entry) => normalizeLine(entry))
    .filter((entry) => entry !== '');
}

function normalizeLine(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'none';
}

function formatReasonList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'no reason recorded';
}

function uniqueStrings(values) {
  return [...new Set(values)];
}
