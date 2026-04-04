export function renderMarkdownArtifact({
  title,
  generatedAt,
  automationId,
  status,
  triggerType,
  idempotencyKey,
  sourceSurfaces,
  notes,
  sections,
  warnings,
  blockedReason,
  degradedReason,
}) {
  const lines = [
    `# ${title}`,
    '',
    `Generated at: ${generatedAt}`,
    `Automation ID: ${automationId}`,
    `Status: ${status}`,
    `Trigger type: ${triggerType}`,
    `Idempotency key: ${idempotencyKey ?? 'none'}`,
    '',
    '## Source Surfaces',
    ...sourceSurfaces.map((surface) => `- ${surface}`),
  ];

  if (notes.length > 0) {
    lines.push('', '## Notes', ...notes.map((note) => `- ${note}`));
  }

  if (blockedReason != null || degradedReason != null) {
    lines.push('', '## Run State');
    if (blockedReason != null) {
      lines.push(`- Blocked reason: ${blockedReason}`);
    }
    if (degradedReason != null) {
      lines.push(`- Degraded reason: ${degradedReason}`);
    }
  }

  for (const section of sections) {
    lines.push('', `## ${section.heading}`, ...section.lines.map((line) => `- ${line}`));
  }

  if (warnings.length > 0) {
    lines.push('', '## Warnings', ...warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

export function buildMemoryIdempotencyKey(memory, timestamp) {
  const dayKey = timestamp.slice(0, 10);
  if (memory.status === 'missing' || memory.status === 'unavailable' || memory.status === 'invalid') {
    return `memory-${memory.status}-${dayKey}`;
  }
  if (memory.isStale) {
    return `memory-stale-${sanitizeFileSegment(memory.lastSyncAt ?? dayKey)}`;
  }
  return `memory-fresh-${sanitizeFileSegment(memory.lastSyncAt ?? dayKey)}`;
}

export function memoryWarnings(memory) {
  return memory.warning == null ? [] : [memory.warning];
}

export function formatIsoWeek(timestamp) {
  const date = new Date(timestamp);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export function sanitizeFileSegment(value) {
  return String(value).replaceAll(':', '-').replaceAll('.', '-').replaceAll('/', '-');
}

export function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
