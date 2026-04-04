import { getSessionSnapshot } from '../control/session-snapshot.js';
import { getConnectorHealthOverview } from '../connectors/health.js';
import { getResultsOverview } from '../flows/results-discovery.js';
import { getWritingOverview } from '../flows/writing-overview.js';
import { STALE_MEMORY_WARNING, getMemoryFreshness } from '../memory/status.js';
import {
  buildMemoryIdempotencyKey,
  cloneValue,
  formatIsoWeek,
  memoryWarnings,
  renderMarkdownArtifact,
  sanitizeFileSegment,
} from './plan-render.js';

export function buildAutomationPlan(projectPath, definition, context) {
  switch (definition.automationId) {
    case 'weekly-research-digest':
      return buildWeeklyResearchDigestPlan(projectPath, definition, context);
    case 'stale-memory-reminder':
      return buildStaleMemoryReminderPlan(projectPath, definition, context);
    case 'export-warning-digest':
      return buildExportWarningDigestPlan(projectPath, definition, context);
    default:
      throw new Error(`Unsupported built-in automation: ${definition.automationId}`);
  }
}

async function buildWeeklyResearchDigestPlan(projectPath, definition, context) {
  const [session, memory, connectors, results, writing] = await Promise.all([
    getSessionSnapshot(projectPath),
    getMemoryFreshness(projectPath, {
      now: Date.parse(context.timestamp),
    }),
    getConnectorHealthOverview(projectPath),
    getResultsOverview(projectPath, {
      bundleLimit: 5,
      digestLimit: 5,
    }),
    getWritingOverview(projectPath, {
      snapshotLimit: 5,
      exportLimit: 5,
      alertLimit: 5,
      packLimit: 5,
    }),
  ]);

  const weekKey = formatIsoWeek(context.timestamp);
  const warnings = [
    ...memoryWarnings(memory),
    ...cloneValue(connectors.warnings ?? []),
    ...cloneValue(results.warnings ?? []),
    ...cloneValue(writing.warnings ?? []),
  ];
  const degradedReason =
    session == null
      ? 'Session snapshot is missing; digest summarizes only currently available outer-project surfaces.'
      : warnings.length > 0
        ? 'Digest completed with partial warnings from one or more derived surfaces.'
        : null;
  const status = degradedReason == null ? 'completed' : 'degraded';

  return {
    status,
    blockedReason: null,
    degradedReason,
    idempotencyKey: weekKey,
    artifactFileName: `${weekKey}.md`,
    artifactContent: renderMarkdownArtifact({
      title: 'Weekly Research Digest',
      generatedAt: context.timestamp,
      automationId: definition.automationId,
      status,
      triggerType: context.triggerType,
      idempotencyKey: weekKey,
      sourceSurfaces: definition.sourceSurfaces,
      notes: [
        session == null
          ? 'Control-plane session snapshot is currently missing.'
          : `Active flow: ${session.activeFlow ?? 'none'}`,
        `Memory stale: ${memory.isStale ? 'yes' : 'no'}`,
        `Recent result bundles: ${results.totalBundles}`,
        `Recent writing alerts: ${writing.totalAlerts}`,
        `Visible connector warnings: ${connectors.warnings.length}`,
      ],
      sections: [
        {
          heading: 'Session',
          lines: [
            `Active flow: ${session?.activeFlow ?? 'missing'}`,
            `Current stage: ${session?.currentStage ?? 'missing'}`,
            `Last command: ${session?.lastCommand ?? 'none'}`,
            `Last attempt id: ${session?.lastAttemptId ?? 'none'}`,
          ],
        },
        {
          heading: 'Memory',
          lines: [
            `Status: ${memory.status}`,
            `Last sync at: ${memory.lastSyncAt ?? 'missing'}`,
            `Warning: ${memory.warning ?? 'none'}`,
          ],
        },
        {
          heading: 'Results',
          lines: [
            `Total bundles: ${results.totalBundles}`,
            `Total session digests: ${results.totalSessionDigests}`,
            `Latest experiment ids: ${results.bundles.map((entry) => entry.experimentId).join(', ') || 'none'}`,
          ],
        },
        {
          heading: 'Writing',
          lines: [
            `Total snapshots: ${writing.totalSnapshots}`,
            `Total exports: ${writing.totalExports}`,
            `Total export alerts: ${writing.totalAlerts}`,
            `Advisor packs: ${writing.totalAdvisorPacks}`,
            `Rebuttal packs: ${writing.totalRebuttalPacks}`,
          ],
        },
        {
          heading: 'Connectors',
          lines: [
            `Runtime installed: ${connectors.runtimeInstalled ? 'yes' : 'no'}`,
            `Configured connectors: ${connectors.totalConnectors}`,
            ...connectors.connectors.map((entry) => `${entry.displayName}: ${entry.healthStatus}`),
          ],
        },
      ],
      warnings,
      blockedReason: null,
      degradedReason,
    }),
    sourceSurfaces: cloneValue(definition.sourceSurfaces),
    summary: {
      calendarWeek: weekKey,
      hasSession: session !== null,
      staleMemory: memory.isStale,
      totalResultBundles: results.totalBundles,
      totalExportAlerts: writing.totalAlerts,
    },
    warnings,
  };
}

async function buildStaleMemoryReminderPlan(projectPath, definition, context) {
  const memory = await getMemoryFreshness(projectPath, {
    now: Date.parse(context.timestamp),
  });
  const idempotencyKey = buildMemoryIdempotencyKey(memory, context.timestamp);
  const warnings = memoryWarnings(memory);

  let status;
  let blockedReason = null;
  let degradedReason = null;
  if (memory.status === 'missing' || memory.status === 'unavailable' || memory.status === 'invalid') {
    status = 'degraded';
    degradedReason = `Memory freshness is ${memory.status}; reminder stayed visible instead of fabricating freshness.`;
  } else if (!memory.isStale) {
    status = 'blocked';
    blockedReason = 'Memory mirrors are fresh; no reminder is currently needed.';
  } else {
    status = 'completed';
  }

  return {
    status,
    blockedReason,
    degradedReason,
    idempotencyKey,
    artifactFileName: `${sanitizeFileSegment(idempotencyKey)}.md`,
    artifactContent: renderMarkdownArtifact({
      title: 'Stale Memory Reminder',
      generatedAt: context.timestamp,
      automationId: definition.automationId,
      status,
      triggerType: context.triggerType,
      idempotencyKey,
      sourceSurfaces: definition.sourceSurfaces,
      notes: [
        `Memory status: ${memory.status}`,
        `Last sync at: ${memory.lastSyncAt ?? 'missing'}`,
        `Freshness warning: ${memory.warning ?? 'none'}`,
      ],
      sections: [
        {
          heading: 'Freshness',
          lines: [
            `Has sync state: ${memory.hasSyncState ? 'yes' : 'no'}`,
            `Is stale: ${memory.isStale ? 'yes' : 'no'}`,
            `Last successful sync at: ${memory.lastSuccessfulSyncAt ?? 'missing'}`,
          ],
        },
        {
          heading: 'Reminder',
          lines: [
            memory.warning ?? 'No reminder was necessary.',
            status === 'completed'
              ? STALE_MEMORY_WARNING
              : blockedReason ?? degradedReason ?? 'No reminder output.',
          ],
        },
      ],
      warnings,
      blockedReason,
      degradedReason,
    }),
    sourceSurfaces: cloneValue(definition.sourceSurfaces),
    summary: {
      memoryStatus: memory.status,
      isStale: memory.isStale,
      lastSyncAt: memory.lastSyncAt,
    },
    warnings,
  };
}

async function buildExportWarningDigestPlan(projectPath, definition, context) {
  const writing = await getWritingOverview(projectPath, {
    snapshotLimit: 0,
    exportLimit: 0,
    alertLimit: 25,
    packLimit: 0,
  });
  const latestAlert = writing.alerts[0] ?? null;
  const idempotencyKey = latestAlert == null
    ? `no-alerts-${context.timestamp.slice(0, 10)}`
    : `alerts-${latestAlert.alertId}-${writing.totalAlerts}`;

  let status;
  let blockedReason = null;
  let degradedReason = null;
  if (writing.totalAlerts === 0) {
    status = 'blocked';
    blockedReason = 'No export alerts currently require summarizing.';
  } else if (writing.warnings.length > 0) {
    status = 'degraded';
    degradedReason = 'Some export alert records were unreadable; digest is partial.';
  } else {
    status = 'completed';
  }

  return {
    status,
    blockedReason,
    degradedReason,
    idempotencyKey,
    artifactFileName: `${sanitizeFileSegment(idempotencyKey)}.md`,
    artifactContent: renderMarkdownArtifact({
      title: 'Export Warning Digest',
      generatedAt: context.timestamp,
      automationId: definition.automationId,
      status,
      triggerType: context.triggerType,
      idempotencyKey,
      sourceSurfaces: definition.sourceSurfaces,
      notes: [
        `Visible export alerts: ${writing.totalAlerts}`,
        `Warnings while reading alerts: ${writing.warnings.length}`,
      ],
      sections: [
        {
          heading: 'Alert Summary',
          lines: writing.totalAlerts === 0
            ? ['No export alerts were available at digest time.']
            : writing.alerts.map((alert) => `${alert.alertId}: ${alert.kind} (${alert.claimId})`),
        },
      ],
      warnings: cloneValue(writing.warnings ?? []),
      blockedReason,
      degradedReason,
    }),
    sourceSurfaces: cloneValue(definition.sourceSurfaces),
    summary: {
      totalAlerts: writing.totalAlerts,
      latestAlertId: latestAlert?.alertId ?? null,
    },
    warnings: cloneValue(writing.warnings ?? []),
  };
}
