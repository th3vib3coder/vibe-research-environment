import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import {
  assert,
  isDirectRun,
  repoRoot,
} from './_helpers.js';

const WORKFLOWS_DIR = path.join(repoRoot, '.github', 'workflows');

async function listWorkflowFiles() {
  let entries;
  try {
    entries = await readdir(WORKFLOWS_DIR);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(WORKFLOWS_DIR, name));
}

function hasPullRequestTrigger(content) {
  // Accept any `pull_request:` line (unrestricted OR filtered to main-compatible branches)
  return /\bpull_request\s*:/u.test(content);
}

function hasPushToMainTrigger(content) {
  if (!/\bpush\s*:/u.test(content)) {
    return false;
  }
  // Reject push workflows that exclude main explicitly
  return !/branches-ignore\s*:\s*(?:\n\s+-\s+)?['"]?main['"]?/u.test(content);
}

function hasUbuntuRunner(content) {
  return /runs-on\s*:\s*ubuntu-latest\b/u.test(content);
}

function hasNpmCi(content) {
  return /\bnpm\s+ci\b/u.test(content);
}

function hasNpmRunCheck(content) {
  return /\bnpm\s+run\s+check\b/u.test(content);
}

function hasNpmRunTestPhase9(content) {
  return /\bnpm\s+run\s+test:phase9\b/u.test(content);
}

function hasCheckoutAction(content) {
  return /actions\/checkout@/u.test(content);
}

function hasSetupNodeAction(content) {
  return /actions\/setup-node@/u.test(content);
}

async function evaluateWorkflow(filePath) {
  const content = await readFile(filePath, 'utf8');
  return {
    filePath,
    pullRequestTrigger: hasPullRequestTrigger(content),
    pushToMainTrigger: hasPushToMainTrigger(content),
    ubuntuRunner: hasUbuntuRunner(content),
    npmCi: hasNpmCi(content),
    npmRunCheck: hasNpmRunCheck(content),
    npmRunTestPhase9: hasNpmRunTestPhase9(content),
    checkoutAction: hasCheckoutAction(content),
    setupNodeAction: hasSetupNodeAction(content),
  };
}

function workflowIsCompliant(evaluation) {
  return (
    evaluation.pullRequestTrigger
    && evaluation.ubuntuRunner
    && evaluation.npmCi
    && evaluation.npmRunCheck
    && evaluation.npmRunTestPhase9
    && evaluation.checkoutAction
    && evaluation.setupNodeAction
  );
}

function describeFailure(evaluation) {
  const missing = [];
  if (!evaluation.pullRequestTrigger) missing.push('pull_request trigger');
  if (!evaluation.ubuntuRunner) missing.push('runs-on ubuntu-latest');
  if (!evaluation.npmCi) missing.push('npm ci step');
  if (!evaluation.npmRunCheck) missing.push('npm run check step');
  if (!evaluation.npmRunTestPhase9) missing.push('npm run test:phase9 step');
  if (!evaluation.checkoutAction) missing.push('actions/checkout');
  if (!evaluation.setupNodeAction) missing.push('actions/setup-node');
  return missing.join(', ');
}

export default async function validateCiWorkflow() {
  const files = await listWorkflowFiles();
  assert(files.length > 0, 'No .github/workflows/*.yml file found — CI workflow contract not satisfied');

  const evaluations = [];
  for (const file of files) {
    evaluations.push(await evaluateWorkflow(file));
  }

  const compliant = evaluations.filter(workflowIsCompliant);
  if (compliant.length === 0) {
    const details = evaluations
      .map((ev) => `  ${path.relative(repoRoot, ev.filePath)}: missing ${describeFailure(ev)}`)
      .join('\n');
    assert(
      false,
      `No CI workflow satisfies the Phase 6 WP-154 + Phase 9 T0.5 contract (needs pull_request trigger + ubuntu-latest + npm ci + npm run check + npm run test:phase9 + checkout + setup-node):\n${details}`
    );
  }

  // At least one workflow also triggers on push to main (recommended but not required; log-only warning surface
  // is via the presence check below — we do not fail, but the closeout should cite the canonical workflow).
  return { compliantCount: compliant.length };
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-ci-workflow', validateCiWorkflow);
}
