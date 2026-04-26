import path from 'node:path';

import { objectiveDigestsDir, objectiveDir, atomicWriteUtf8 } from './store.js';

function normalizeTimestampForFileName(timestamp) {
  return timestamp.replaceAll(':', '-').replaceAll('.', '-');
}

export function objectiveDigestLatestPath(projectRoot, objectiveId) {
  return path.join(objectiveDir(projectRoot, objectiveId), 'digest-latest.md');
}

export function renderObjectiveDigestMarkdown(summary) {
  const lines = [
    '# Objective Digest',
    '',
    `- Objective: ${summary.objectiveId}`,
    `- Written At: ${summary.writtenAt}`,
    `- Wake Id: ${summary.wakeId ?? 'n/a'}`,
    `- Runtime Status: ${summary.status}`,
    `- Queue Cursor: ${summary.queueCursor == null ? 'n/a' : String(summary.queueCursor)}`,
    `- Last Task Id: ${summary.lastTaskId ?? 'n/a'}`,
    `- Snapshot Path: ${summary.snapshotPath ?? 'n/a'}`,
    `- Event Log Path: ${summary.eventLogPath ?? 'n/a'}`,
    `- Handoff Ledger Path: ${summary.handoffLedgerPath ?? 'n/a'}`,
    `- Queue Path: ${summary.queuePath ?? 'n/a'}`,
    `- Digest Kind: ${summary.digestKind ?? 'loop-state'}`
  ];

  if (summary.stopReason) {
    lines.push(`- Stop Reason: ${summary.stopReason}`);
  }

  if (summary.taskAttemptId) {
    lines.push(`- Task Attempt Id: ${summary.taskAttemptId}`);
  }

  if (summary.taskId) {
    lines.push(`- Task Id: ${summary.taskId}`);
  }

  if (summary.analysisId) {
    lines.push(`- Analysis Id: ${summary.analysisId}`);
  }

  if (summary.memorySyncStatus) {
    lines.push(`- Memory Sync: ${summary.memorySyncStatus}`);
  }

  if (summary.handoffId) {
    lines.push(`- Handoff Id: ${summary.handoffId}`);
  }

  if (summary.latestR2VerdictId) {
    lines.push(`- Latest R2 Verdict Id: ${summary.latestR2VerdictId}`);
  }

  if (summary.r2Verdict) {
    lines.push(`- R2 Verdict: ${summary.r2Verdict}`);
  }

  if (summary.claimId) {
    lines.push(`- Claim Id: ${summary.claimId}`);
  }

  if (summary.notes) {
    lines.push('', '## Notes', summary.notes);
  }

  return `${lines.join('\n')}\n`;
}

export async function writeObjectiveDigest(projectRoot, objectiveId, summary) {
  const writtenAt = summary.writtenAt;
  const digestFileName = `digest-${normalizeTimestampForFileName(writtenAt)}.md`;
  const digestsDir = objectiveDigestsDir(projectRoot, objectiveId);
  const immutablePath = path.join(digestsDir, digestFileName);
  const latestPath = objectiveDigestLatestPath(projectRoot, objectiveId);
  const content = renderObjectiveDigestMarkdown({
    ...summary,
    objectiveId,
    writtenAt
  });
  await atomicWriteUtf8(immutablePath, content);
  await atomicWriteUtf8(latestPath, content);
  return {
    immutablePath,
    latestPath
  };
}
