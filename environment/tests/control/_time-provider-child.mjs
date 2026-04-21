import { nowIso, nowMs } from '../../control/time-provider.js';

const projectPath = process.argv[2];

if (!projectPath) {
  throw new Error('projectPath argument is required');
}

process.stdout.write(JSON.stringify({
  nowMs: await nowMs(projectPath),
  nowIso: await nowIso(projectPath)
}));
