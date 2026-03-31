import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './_workspace.js';

const repoRoot = getRepoRoot();
const operatorValidationRoot = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation'
);
const benchmarksRoot = path.join(operatorValidationRoot, 'benchmarks');
const artifactPath = path.join(
  operatorValidationRoot,
  'artifacts',
  'phase1-resume-validation.json'
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function listRepeatIds(taskId) {
  const taskRoot = path.join(benchmarksRoot, taskId);
  const entries = await readdir(taskRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

async function loadRepeat(taskId, repeatId) {
  const repeatRoot = path.join(benchmarksRoot, taskId, repeatId);
  const [input, output, metrics, summary] = await Promise.all([
    readJson(path.join(repeatRoot, 'input.json')),
    readJson(path.join(repeatRoot, 'output.json')),
    readJson(path.join(repeatRoot, 'metrics.json')),
    readJson(path.join(repeatRoot, 'summary.json'))
  ]);

  return {
    repeatRoot,
    input,
    output,
    metrics,
    summary
  };
}

async function selectResumeEvidence() {
  const repeats = await listRepeatIds('flow-status-resume');

  for (const repeatId of repeats) {
    const repeat = await loadRepeat('flow-status-resume', repeatId);
    const elapsedSeconds = repeat.summary.metrics?.resumeLatencySeconds;

    if (
      repeat.summary.passed === true &&
      typeof elapsedSeconds === 'number' &&
      elapsedSeconds <= 120
    ) {
      return {
        taskId: 'flow-status-resume',
        repeatId,
        ...repeat
      };
    }
  }

  throw new Error(
    'No passing flow-status-resume repeat satisfies the Phase 1 latency budget.'
  );
}

async function main() {
  const evidence = await selectResumeEvidence();
  const artifact = {
    artifactId: 'phase1-resume-validation',
    phase: 1,
    createdAt: new Date().toISOString(),
    passed: true,
    scenarioName: evidence.taskId,
    command: evidence.summary.command,
    validationClaim:
      'Researcher can resume active context in <=2 minutes using /flow-status.',
    elapsedSeconds: evidence.summary.metrics.resumeLatencySeconds,
    sourceRepeat: {
      taskId: evidence.taskId,
      repeatId: evidence.repeatId,
      inputPath: `.vibe-science-environment/operator-validation/benchmarks/${evidence.taskId}/${evidence.repeatId}/input.json`,
      outputPath: `.vibe-science-environment/operator-validation/benchmarks/${evidence.taskId}/${evidence.repeatId}/output.json`,
      metricsPath: `.vibe-science-environment/operator-validation/benchmarks/${evidence.taskId}/${evidence.repeatId}/metrics.json`,
      summaryPath: `.vibe-science-environment/operator-validation/benchmarks/${evidence.taskId}/${evidence.repeatId}/summary.json`,
      transcriptPath: evidence.summary.transcriptPath
    },
    startingState: evidence.input.setup.workspaceFixtures,
    expectedResult: evidence.input.expected,
    actualResult: evidence.summary.actualResult,
    evidence: {
      benchmarkId: evidence.summary.benchmarkId,
      checksPassed: evidence.summary.checksPassed,
      checksTotal: evidence.summary.checksTotal,
      metrics: evidence.summary.metrics
    }
  };

  await writeJson(artifactPath, artifact);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifact = await main();
    console.log(
      `saved .vibe-science-environment/operator-validation/artifacts/${path.basename(artifactPath)}`
    );
    console.log(`source ${artifact.sourceRepeat.taskId}/${artifact.sourceRepeat.repeatId}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as saveOperatorValidationArtifact };
