import path from 'node:path';

import { objectiveDir, atomicWriteUtf8 } from './store.js';
import { BLOCKER_FLAG_FILE } from './resume-snapshot.js';

export function blockerFlagPath(projectRoot, objectiveId) {
  return path.join(objectiveDir(projectRoot, objectiveId), BLOCKER_FLAG_FILE);
}

export async function writeObjectiveBlockerFlag(projectRoot, objectiveId, {
  code,
  message,
  snapshotPath,
  writtenAt
}) {
  const targetPath = blockerFlagPath(projectRoot, objectiveId);
  const lines = [
    `BLOCKER_CODE=${code}`,
    `BLOCKER_MESSAGE=${message}`,
    `OBJECTIVE_ID=${objectiveId}`,
    `WRITTEN_AT=${writtenAt}`
  ];
  if (snapshotPath) {
    lines.push(`SNAPSHOT_PATH=${snapshotPath}`);
  }
  await atomicWriteUtf8(targetPath, `${lines.join('\n')}\n`);
  return targetPath;
}
