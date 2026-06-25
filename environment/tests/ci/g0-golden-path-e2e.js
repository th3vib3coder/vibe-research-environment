import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readJsonl } from '../../control/_io.js';
import { walkLiteratureSources } from '../../lib/w-lit/literature-walk.js';
import { extractPaperAssertions } from '../../lib/w-lit/pass15-extractor.js';
import { emitPhase12EdgeProposals } from '../../lib/w-lit/edge-emitter.js';
import { createManifest } from '../../lib/manifest.js';
import { activateObjective } from '../../objectives/store.js';
import { evaluateHighStakesGate } from '../../autonomous/l0/high-stakes-gate.js';
import { bindExperimentManifestToObjective } from '../../orchestrator/experiment-binding.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from '../cli/_fixture.js';
import { assert, isDirectRun, runValidator } from './_helpers.js';

const OBJECTIVE_ID = 'OBJ-G0-SYNTHETIC-001';
const EXPERIMENT_ID = 'EXP-901';
const ANALYSIS_ID = 'ANL-G0-SYNTHETIC-001';
const CLAIM_ID = 'G0-SYNTHETIC-CLAIM-CANDIDATE-001';
const STATE_PATH = 'STATE.md';
const PROGRESS_PATH = 'artifacts/g0/PROGRESS.json';
const CLAIM_EDGES_PATH = ['.vibe-science-environment', 'claims', 'edges.jsonl'];

const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling'
  ),
  VIBE_SCIENCE_PLUGIN_CLI: path.join(
    repoRoot,
    'environment',
    'tests',
    'fixtures',
    'governance-log-capture-stub.js'
  ),
  VRE_RUN_ANALYSIS_TIMEOUT_MS: '5000'
};

const REQUIRED_ARTIFACT_IDS = Object.freeze([
  'literature-gap',
  'edge-proposals',
  'hypothesis',
  'analysis-manifest',
  'analysis-output',
  'confounder-raw',
  'confounder-conditioned',
  'confounder-matched',
  'high-stakes-stop',
  'validation',
  'r2-review',
  'claim-candidate'
]);

const CLOSED_SURFACE_FLAGS = Object.freeze([
  'providerAutomationOpened',
  'obdkAutomationOpened',
  'reviewedApiAutomationOpened',
  'realDataOpened',
  'biomedicalClaimAuthorityOpened',
  'claimExportOpened',
  'graphifyOpened',
  'l4SwarmOpened',
  'l5NewRuntimeOpened',
  'unattendedRuntimeOpened',
  'browserGuiOpened',
  'persistentPhase12WriterOpened'
]);

function fail(code, detail = '') {
  throw new Error(detail ? `${code} ${detail}` : code);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function projectPath(projectRoot, relativePath) {
  return path.join(projectRoot, ...relativePath.split('/'));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJsonFile(projectRoot, relativePath) {
  return JSON.parse(await readFile(projectPath(projectRoot, relativePath), 'utf8'));
}

async function writeProjectFile(projectRoot, relativePath, contents) {
  const target = projectPath(projectRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
  return target;
}

async function writeJsonFile(projectRoot, relativePath, value) {
  return writeProjectFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function sha256File(projectRoot, relativePath) {
  const bytes = await readFile(projectPath(projectRoot, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

async function readFixtureJson(section, fileName) {
  return JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        section,
        fileName
      ),
      'utf8'
    )
  );
}

async function seedObjective(projectRoot) {
  const fixture = await readFixtureJson('objective', 'valid-active.json');
  const objectiveRecord = {
    ...fixture,
    objectiveId: OBJECTIVE_ID,
    title: 'G0 synthetic golden-path objective',
    artifactsIndex: {
      ...fixture.artifactsIndex,
      experiments: []
    }
  };

  await activateObjective(projectRoot, objectiveRecord, {
    sessionId: 'sess-g0-golden-path'
  });
  return objectiveRecord;
}

async function seedExperimentManifest(projectRoot) {
  const legacyManifest = await readFixtureJson(
    'experiment-binding',
    'legacy-vre-experiment-manifest.json'
  );

  await createManifest(projectRoot, {
    ...legacyManifest,
    experimentId: EXPERIMENT_ID,
    objective: OBJECTIVE_ID,
    status: 'planned'
  });
  await bindExperimentManifestToObjective(projectRoot, OBJECTIVE_ID, EXPERIMENT_ID, {
    updatedAt: '2026-06-25T12:00:00Z'
  });
}

function analysisScript() {
  return `
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const input = args[args.indexOf('--input') + 1];
const output = args[args.indexOf('--output') + 1];
const raw = await readFile(input, 'utf8');
const rows = raw.trim().split(/\\r?\\n/u).slice(1).map((line) => {
  const [sample, group, marker, confounder] = line.split(',');
  return { sample, group, marker: Number(marker), confounder };
});
const cases = rows.filter((row) => row.group === 'synthetic-case');
const controls = rows.filter((row) => row.group === 'synthetic-control');
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const effectSize = mean(cases.map((row) => row.marker))
  - mean(controls.map((row) => row.marker));

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({
  schemaVersion: 'vre.g0.synthetic-analysis-output.v1',
  artifactId: 'analysis-output',
  step: 4,
  syntheticFixture: true,
  notBiomedicalEvidence: true,
  subprocessGenerated: true,
  runner: 'other',
  analysisId: '${ANALYSIS_ID}',
  inputRows: rows.length,
  effectSize,
  scientificReady: false,
  biologicalFinding: false
}, null, 2) + '\\n', 'utf8');
process.stdout.write('g0 synthetic analysis complete\\n');
`;
}

function analysisManifest() {
  const scriptPath = 'analysis/scripts/g0-targeted-analysis.mjs';
  const inputPath = 'data/synthetic/g0-marker-table.csv';
  const outputPath = 'artifacts/g0/analysis-output.json';
  return {
    schemaVersion: 'phase9.analysis-manifest.v1',
    objectiveId: OBJECTIVE_ID,
    experimentId: EXPERIMENT_ID,
    analysisId: ANALYSIS_ID,
    script: {
      path: scriptPath,
      sha256: '4444444444444444444444444444444444444444444444444444444444444444',
      language: 'other'
    },
    inputs: [
      {
        path: inputPath,
        kind: 'dataset',
        sha256: null,
        sizeBytes: null
      }
    ],
    outputs: [
      {
        path: outputPath,
        kind: 'table',
        sha256: null,
        sizeBytes: null
      }
    ],
    command: {
      runner: 'other',
      argv: [scriptPath, '--input', inputPath, '--output', outputPath]
    },
    budget: {
      maxRuntimeSeconds: 5,
      maxMemoryGb: 1,
      allowNetwork: false
    },
    safety: {
      destructive: false,
      treeWideWrite: false,
      externalCall: false
    },
    taskKind: 'analysis-execution-run',
    expectedArtifacts: [
      {
        path: outputPath,
        kind: 'table',
        required: true
      }
    ],
    humanApproval: {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      reason: null
    },
    createdAt: '2026-06-25T12:00:00Z',
    createdBy: 'sess-g0-golden-path'
  };
}

async function seedRunAnalysis(projectRoot) {
  const manifest = analysisManifest();
  await writeProjectFile(
    projectRoot,
    manifest.inputs[0].path,
    [
      'sample,group,marker,confounder',
      'SYN-001,synthetic-case,9,matched',
      'SYN-002,synthetic-case,8,matched',
      'SYN-003,synthetic-control,3,matched',
      'SYN-004,synthetic-control,4,matched'
    ].join('\n') + '\n'
  );
  await writeProjectFile(projectRoot, manifest.script.path, analysisScript());
  await writeJsonFile(projectRoot, 'analysis/manifests/g0-analysis.json', manifest);
  return manifest;
}

async function runTargetedAnalysis(projectRoot) {
  const result = await runVre(
    projectRoot,
    ['run-analysis', '--manifest', 'analysis/manifests/g0-analysis.json'],
    { env: FIXTURE_KERNEL_ENV }
  );
  if (result.code !== 0) {
    fail('E_G0_RUN_ANALYSIS_FAILED', `stdout=${result.stdout} stderr=${result.stderr}`);
  }
  const payload = JSON.parse(result.stdout);
  if (payload.ok !== true || payload.status !== 'complete') {
    fail('E_G0_RUN_ANALYSIS_NOT_COMPLETE');
  }

  const laneRunsPath = projectPath(
    projectRoot,
    '.vibe-science-environment/orchestrator/lane-runs.jsonl'
  );
  const laneRuns = await readJsonl(laneRunsPath);
  const phase9Runs = laneRuns.filter(
    (record) => record.schemaVersion === 'phase9.lane-run-record.v1'
  );
  if (phase9Runs.map((record) => record.status).join(',') !== 'running,complete') {
    fail('E_G0_RUN_ANALYSIS_LANE_RECORDS');
  }

  return payload;
}

function syntheticPaperMarkdown() {
  return [
    '# G0 Synthetic Paper',
    '',
    'This fixture describes a made-up marker pattern for the G0 corridor.',
    '',
    '```json paperAssertion',
    JSON.stringify({
      paperAssertionId: 'PAPER-G0-GAP-001',
      kind: 'claim',
      text:
        'Synthetic literature leaves a marker-pattern gap that needs a ' +
        'bounded targeted analysis.',
      cites: ['raw/papers/g0-synthetic-paper.md'],
      supports: [
        {
          claimId: CLAIM_ID,
          proposalOnly: true,
          reason: 'Synthetic gap motivates a claim-candidate only.'
        }
      ],
      syntheticFixture: true,
      notBiomedicalEvidence: true
    }, null, 2),
    '```',
    '',
    '```json paperAssertion',
    JSON.stringify({
      paperAssertionId: 'PAPER-G0-CONFOUNDER-001',
      kind: 'confounder',
      text:
        'Synthetic marker differences must be conditioned and matched before ' +
        'any quantitative claim-candidate.',
      cites: ['raw/papers/g0-synthetic-paper.md'],
      syntheticFixture: true,
      notBiomedicalEvidence: true
    }, null, 2),
    '```',
    ''
  ].join('\n');
}

async function buildLiteratureArtifacts(projectRoot) {
  const sourcePath = 'raw/papers/g0-synthetic-paper.md';
  const markdown = syntheticPaperMarkdown();
  await writeProjectFile(projectRoot, sourcePath, markdown);

  const sourceIndex = await walkLiteratureSources({ corpusRoot: projectRoot });
  const paperAssertions = extractPaperAssertions({ markdown, sourcePath });
  const edgeProposals = emitPhase12EdgeProposals({
    claims: [{ id: CLAIM_ID }],
    paperAssertions
  });

  await writeJsonFile(projectRoot, 'artifacts/g0/literature-gap.json', {
    schemaVersion: 'vre.g0.synthetic-literature-gap.v1',
    artifactId: 'literature-gap',
    step: 1,
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    sourceIndex,
    paperAssertions
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/edge-proposals.json', {
    schemaVersion: 'vre.g0.synthetic-edge-proposals.v1',
    artifactId: 'edge-proposals',
    step: 2,
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    proposals: edgeProposals
  });
}

async function buildHighStakesStopArtifact(projectRoot, objectiveRecord) {
  const highStakes = await evaluateHighStakesGate({
    projectRoot,
    objectiveRecord,
    iteration: 1,
    action: {
      id: 'g0-claim-promotion-stop-proof',
      type: 'claim-promotion',
      highStakes: true,
      summary: 'Synthetic claim promotion must stop in G0.'
    }
  }, {
    async writeOperatorGateRecord(record) {
      const relativePath = 'artifacts/g0/high-stakes-stop.json';
      await writeJsonFile(projectRoot, relativePath, record);
      return {
        gateRecord: record,
        gateRecordPath: projectPath(projectRoot, relativePath),
        gateRecordRelativePath: relativePath
      };
    }
  });

  if (
    highStakes.verdict !== 'stop'
    || highStakes.actionExecuted !== false
    || highStakes.runtimeOpened !== false
  ) {
    fail('E_G0_HIGH_STAKES_NOT_STOPPED');
  }
}

async function buildRemainingArtifacts(projectRoot) {
  const analysisOutput = await readJsonFile(projectRoot, 'artifacts/g0/analysis-output.json');
  await writeJsonFile(projectRoot, 'artifacts/g0/hypothesis.json', {
    schemaVersion: 'vre.g0.synthetic-hypothesis.v1',
    artifactId: 'hypothesis',
    step: 3,
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    hypothesisText:
      'If the synthetic marker gap is real in the fixture, matched cases ' +
      'will have a higher synthetic marker score than matched controls.',
    derivedFrom: ['literature-gap']
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/confounder-raw.json', {
    schemaVersion: 'vre.g0.synthetic-confounder.v1',
    artifactId: 'confounder-raw',
    step: 5,
    stage: 'raw',
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    rows: analysisOutput.inputRows,
    usableForClaim: false
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/confounder-conditioned.json', {
    schemaVersion: 'vre.g0.synthetic-confounder.v1',
    artifactId: 'confounder-conditioned',
    step: 6,
    stage: 'conditioned',
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    adjustedFor: ['synthetic-batch'],
    usableForClaim: false
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/confounder-matched.json', {
    schemaVersion: 'vre.g0.synthetic-confounder.v1',
    artifactId: 'confounder-matched',
    step: 7,
    stage: 'matched',
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    matchedPairs: 2,
    usableForClaim: true
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/validation.json', {
    schemaVersion: 'vre.g0.synthetic-validation.v1',
    artifactId: 'validation',
    step: 9,
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    validates: ['hypothesis', 'analysis-output', 'confounder-matched'],
    effectSize: analysisOutput.effectSize,
    thresholdMet: analysisOutput.effectSize > 0,
    biologicalFinding: false
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/r2-review.json', {
    schemaVersion: 'vre.g0.synthetic-r2-review.v1',
    artifactId: 'r2-review',
    step: 10,
    syntheticFixture: true,
    reviewIsProvenance: false,
    verdict: 'accept',
    reviewedArtifactId: 'validation',
    reviewer: 'g0-fixture-reviewer'
  });
  await writeJsonFile(projectRoot, 'artifacts/g0/claim-candidate.json', {
    schemaVersion: 'vre.g0.synthetic-claim-candidate.v1',
    artifactId: 'claim-candidate',
    claimId: CLAIM_ID,
    step: 11,
    syntheticFixture: true,
    notBiomedicalClaim: true,
    claimAuthority: 'none',
    biologicalFinding: false,
    claimText:
      'In this synthetic fixture only, matched synthetic cases have a higher ' +
      'marker score than matched synthetic controls.',
    r2ReviewRef: {
      artifactId: 'r2-review',
      role: 'review-gate-not-scientific-evidence'
    },
    confounderArtifactId: 'confounder-matched',
    evidenceRefs: [
      { artifactId: 'literature-gap', role: 'synthetic-literature-gap' },
      { artifactId: 'analysis-output', role: 'synthetic-analysis-output' },
      { artifactId: 'confounder-matched', role: 'matched-confounder' },
      { artifactId: 'validation', role: 'synthetic-validation' }
    ],
    hardGatedSurfaces: Object.fromEntries(
      CLOSED_SURFACE_FLAGS.map((flag) => [flag, false])
    )
  });
}

async function buildProgress(projectRoot) {
  const pathById = new Map([
    ['literature-gap', 'artifacts/g0/literature-gap.json'],
    ['edge-proposals', 'artifacts/g0/edge-proposals.json'],
    ['hypothesis', 'artifacts/g0/hypothesis.json'],
    ['analysis-manifest', 'analysis/manifests/g0-analysis.json'],
    ['analysis-output', 'artifacts/g0/analysis-output.json'],
    ['confounder-raw', 'artifacts/g0/confounder-raw.json'],
    ['confounder-conditioned', 'artifacts/g0/confounder-conditioned.json'],
    ['confounder-matched', 'artifacts/g0/confounder-matched.json'],
    ['high-stakes-stop', 'artifacts/g0/high-stakes-stop.json'],
    ['validation', 'artifacts/g0/validation.json'],
    ['r2-review', 'artifacts/g0/r2-review.json'],
    ['claim-candidate', 'artifacts/g0/claim-candidate.json']
  ]);

  const artifacts = [];
  for (const [artifactId, relativePath] of pathById.entries()) {
    artifacts.push({
      artifactId,
      path: relativePath,
      sha256: await sha256File(projectRoot, relativePath)
    });
  }

  await writeJsonFile(projectRoot, PROGRESS_PATH, {
    schemaVersion: 'vre.g0.synthetic-golden-path-progress.v1',
    syntheticFixture: true,
    notBiomedicalEvidence: true,
    terminalArtifactId: 'claim-candidate',
    artifacts
  });

  const stateLines = [
    '# G0 Synthetic Golden Path State',
    '',
    'terminalArtifactId: claim-candidate',
    `progress: ${PROGRESS_PATH}`,
    '',
    '## Artifact Paths',
    ...artifacts.map((entry) => `- ${entry.artifactId}: ${entry.path}`),
    ''
  ];
  await writeProjectFile(projectRoot, STATE_PATH, stateLines.join('\n'));
}

function artifactMap(progress) {
  return new Map(progress.artifacts.map((entry) => [entry.artifactId, entry]));
}

function parseStatePaths(stateText) {
  const paths = new Map();
  const pattern = /^-\s+([A-Za-z0-9._-]+):\s+(.+)$/gmu;
  for (const match of stateText.matchAll(pattern)) {
    paths.set(match[1], match[2].trim());
  }
  return paths;
}

function assertSyntheticArtifact(value, artifactId) {
  if (value.syntheticFixture !== true) {
    fail('E_G0_SYNTHETIC_FLAG_REQUIRED', artifactId);
  }
}

function assertNoRealDataPath(relativePath) {
  const normalized = toPosix(relativePath).toLowerCase();
  if (
    path.isAbsolute(relativePath)
    || normalized.includes('/data/real/')
    || normalized.startsWith('data/real/')
    || normalized.endsWith('.h5ad')
    || /(^|\/)gse\d+/iu.test(relativePath)
  ) {
    fail('E_G0_REAL_DATA_PATH_FORBIDDEN', relativePath);
  }
}

async function assertArtifactHashes(projectRoot, progress) {
  for (const artifact of progress.artifacts) {
    const target = projectPath(projectRoot, artifact.path);
    if (!await pathExists(target)) {
      fail('E_G0_ARTIFACT_FILE_MISSING', artifact.artifactId);
    }
    const actual = await sha256File(projectRoot, artifact.path);
    if (actual !== artifact.sha256) {
      fail('E_G0_ARTIFACT_HASH_MISMATCH', artifact.artifactId);
    }
  }
}

function assertHardGatedSurfacesClosed(claimCandidate) {
  for (const flag of CLOSED_SURFACE_FLAGS) {
    if (claimCandidate.hardGatedSurfaces?.[flag] !== false) {
      fail('E_G0_HARD_GATED_SURFACE_OPEN', flag);
    }
  }
}

async function assertClaimEdgesNotWritten(projectRoot) {
  const edgePath = path.join(projectRoot, ...CLAIM_EDGES_PATH);
  if (await pathExists(edgePath)) {
    fail('E_G0_CLAIM_EDGE_WRITE_FORBIDDEN');
  }
}

export async function validateG0GoldenPathBundle({
  projectRoot,
  progressPath = PROGRESS_PATH,
  statePath = STATE_PATH
} = {}) {
  if (!projectRoot) {
    fail('E_G0_PROJECT_ROOT_REQUIRED');
  }

  const progress = await readJsonFile(projectRoot, progressPath);
  assertSyntheticArtifact(progress, 'progress');
  if (progress.terminalArtifactId !== 'claim-candidate') {
    fail('E_G0_TERMINAL_ARTIFACT_INVALID');
  }

  const artifacts = artifactMap(progress);
  for (const id of REQUIRED_ARTIFACT_IDS) {
    if (!artifacts.has(id)) {
      fail('E_G0_REQUIRED_ARTIFACT_MISSING', id);
    }
  }
  await assertArtifactHashes(projectRoot, progress);

  const stateText = await readFile(projectPath(projectRoot, statePath), 'utf8');
  if (!stateText.includes(`progress: ${progressPath}`)) {
    fail('E_G0_STATE_PROGRESS_PATH_MISSING');
  }
  const statePaths = parseStatePaths(stateText);
  for (const artifact of progress.artifacts) {
    if (statePaths.get(artifact.artifactId) !== artifact.path) {
      fail('E_G0_STATE_ARTIFACT_PATH_MISSING', artifact.artifactId);
    }
  }

  const literatureGap = await readJsonFile(projectRoot, artifacts.get('literature-gap').path);
  assertSyntheticArtifact(literatureGap, 'literature-gap');
  if (literatureGap.notBiomedicalEvidence !== true) {
    fail('E_G0_LITERATURE_NOT_BIOMEDICAL_FLAG_REQUIRED');
  }
  for (const assertion of literatureGap.paperAssertions ?? []) {
    assertSyntheticArtifact(assertion, assertion.paperAssertionId);
    if (assertion.notBiomedicalEvidence !== true) {
      fail('E_G0_PAPER_ASSERTION_NOT_BIOMEDICAL_FLAG_REQUIRED');
    }
  }

  const edgeProposals = await readJsonFile(projectRoot, artifacts.get('edge-proposals').path);
  for (const proposal of edgeProposals.proposals ?? []) {
    if (
      proposal.proposalOnly !== true
      || proposal.claimLedgerWrite !== false
      || proposal.runtimeOpened !== false
      || proposal.scientificEvidence !== false
    ) {
      fail('E_G0_EDGE_PROPOSAL_NOT_PROPOSAL_ONLY');
    }
  }

  const manifest = await readJsonFile(projectRoot, artifacts.get('analysis-manifest').path);
  if (
    manifest.budget?.allowNetwork !== false
    || manifest.safety?.externalCall !== false
    || manifest.safety?.destructive !== false
    || manifest.safety?.treeWideWrite !== false
  ) {
    fail('E_G0_ANALYSIS_SAFETY_BOUNDARY');
  }
  for (const entry of [
    ...(manifest.inputs ?? []),
    ...(manifest.outputs ?? []),
    manifest.script ?? {}
  ]) {
    if (entry.path) {
      assertNoRealDataPath(entry.path);
    }
  }

  const analysisOutput = await readJsonFile(projectRoot, artifacts.get('analysis-output').path);
  assertSyntheticArtifact(analysisOutput, 'analysis-output');
  if (
    analysisOutput.notBiomedicalEvidence !== true
    || analysisOutput.subprocessGenerated !== true
    || analysisOutput.biologicalFinding !== false
  ) {
    fail('E_G0_ANALYSIS_OUTPUT_NOT_SUBPROCESS_SYNTHETIC');
  }

  const raw = await readJsonFile(projectRoot, artifacts.get('confounder-raw').path);
  const conditioned = await readJsonFile(projectRoot, artifacts.get('confounder-conditioned').path);
  const matched = await readJsonFile(projectRoot, artifacts.get('confounder-matched').path);
  if (
    raw.stage !== 'raw'
    || conditioned.stage !== 'conditioned'
    || matched.stage !== 'matched'
    || matched.usableForClaim !== true
  ) {
    fail('E_G0_CONFOUNDER_CHAIN_INVALID');
  }

  const highStakes = await readJsonFile(projectRoot, artifacts.get('high-stakes-stop').path);
  if (
    highStakes.actionExecuted !== false
    || highStakes.resumeRequiresOperatorGo !== true
    || highStakes.runtimeOpened !== false
  ) {
    fail('E_G0_HIGH_STAKES_ACTION_EXECUTED');
  }

  const validation = await readJsonFile(projectRoot, artifacts.get('validation').path);
  if (
    !validation.validates?.includes('analysis-output')
    || !validation.validates?.includes('confounder-matched')
    || validation.biologicalFinding !== false
  ) {
    fail('E_G0_VALIDATION_INCOMPLETE');
  }

  const r2Review = await readJsonFile(projectRoot, artifacts.get('r2-review').path);
  const claimCandidate = await readJsonFile(projectRoot, artifacts.get('claim-candidate').path);
  if (r2Review.verdict !== 'accept') {
    fail('E_G0_R2_ACCEPT_REQUIRED');
  }
  if (!(Number(r2Review.step) < Number(claimCandidate.step))) {
    fail('E_G0_R2_MUST_PRECEDE_CLAIM');
  }
  if (
    claimCandidate.notBiomedicalClaim !== true
    || claimCandidate.syntheticFixture !== true
    || claimCandidate.claimAuthority !== 'none'
    || claimCandidate.biologicalFinding !== false
  ) {
    fail('E_G0_CLAIM_CANDIDATE_NOT_SYNTHETIC');
  }
  if (claimCandidate.r2ReviewRef?.artifactId !== 'r2-review') {
    fail('E_G0_CLAIM_R2_REF_REQUIRED');
  }
  if (claimCandidate.confounderArtifactId !== 'confounder-matched') {
    fail('E_G0_CLAIM_MUST_CITE_MATCHED_CONFOUNDER');
  }
  if (
    !claimCandidate.evidenceRefs?.some(
      (ref) => ref.artifactId === 'confounder-matched'
    )
  ) {
    fail('E_G0_CLAIM_MATCHED_CONFOUNDER_EVIDENCE_REQUIRED');
  }
  assertHardGatedSurfacesClosed(claimCandidate);
  await assertClaimEdgesNotWritten(projectRoot);

  return {
    ok: true,
    projectRoot,
    progressPath,
    statePath,
    artifactCount: progress.artifacts.length
  };
}

export async function validateG0StateResume({
  projectRoot,
  statePath = STATE_PATH
} = {}) {
  const stateText = await readFile(projectPath(projectRoot, statePath), 'utf8');
  const progressLine = stateText
    .split(/\r?\n/u)
    .find((line) => line.startsWith('progress: '));
  if (!progressLine) {
    fail('E_G0_STATE_PROGRESS_PATH_MISSING');
  }
  const progressPath = progressLine.slice('progress: '.length).trim();
  return validateG0GoldenPathBundle({ projectRoot, progressPath, statePath });
}

export async function createG0GoldenPathWorkspace({ validate = true } = {}) {
  const projectRoot = await createCliFixtureProject('g0-golden-path-');
  try {
    const objectiveRecord = await seedObjective(projectRoot);
    await seedExperimentManifest(projectRoot);
    await buildLiteratureArtifacts(projectRoot);
    await seedRunAnalysis(projectRoot);
    await runTargetedAnalysis(projectRoot);
    await buildHighStakesStopArtifact(projectRoot, objectiveRecord);
    await buildRemainingArtifacts(projectRoot);
    await buildProgress(projectRoot);

    if (validate) {
      await validateG0StateResume({ projectRoot });
    }

    return {
      projectRoot,
      progressPath: PROGRESS_PATH,
      statePath: STATE_PATH,
      cleanup: () => cleanupCliFixtureProject(projectRoot)
    };
  } catch (error) {
    await cleanupCliFixtureProject(projectRoot);
    throw error;
  }
}

export async function copyG0EvidenceOnly(sourceProjectRoot) {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-g0-evidence-'));
  await cp(projectPath(sourceProjectRoot, 'artifacts'), projectPath(targetRoot, 'artifacts'), {
    recursive: true
  });
  await cp(projectPath(sourceProjectRoot, 'analysis'), projectPath(targetRoot, 'analysis'), {
    recursive: true
  });
  await cp(projectPath(sourceProjectRoot, STATE_PATH), projectPath(targetRoot, STATE_PATH));
  return {
    projectRoot: targetRoot,
    cleanup: () => rm(targetRoot, { recursive: true, force: true })
  };
}

export default async function validateG0GoldenPathE2E() {
  const workspace = await createG0GoldenPathWorkspace();
  try {
    const result = await validateG0StateResume({
      projectRoot: workspace.projectRoot,
      statePath: workspace.statePath
    });
    assert(result.ok === true, 'G0 golden path did not validate');
  } finally {
    await workspace.cleanup();
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('g0-golden-path-e2e', validateG0GoldenPathE2E);
}
