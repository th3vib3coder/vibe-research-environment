import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { countTokens } from '../lib/token-counter.js';
import { getRepoRoot } from './_workspace.js';

const repoRoot = getRepoRoot();
const kernelRoot = path.resolve(repoRoot, '..', 'vibe-science');
const claudePath = path.join(kernelRoot, 'CLAUDE.md');
const skillPath = path.join(kernelRoot, 'SKILL.md');
const sessionStartPath = path.join(kernelRoot, 'plugin', 'scripts', 'session-start.js');
const flowCommandPath = path.join(repoRoot, 'commands', 'flow-status.md');
const artifactPath = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
  'artifacts',
  'phase1-context-baseline.json'
);
const INCREMENTAL_BUDGET_MAX = 1500;

function toRepoRelative(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/gu, '/');
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function measureSurface(label, filePath) {
  const text = await readText(filePath);
  const tokenResult = await countTokens(text);

  return {
    label,
    path: toRepoRelative(filePath),
    chars: text.length,
    tokens: tokenResult.count,
    mode: tokenResult.mode
  };
}

async function invokeSessionStart(projectPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [sessionStartPath], {
      cwd: kernelRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `SessionStart exited with code ${code}: ${stderr.trim() || 'no stderr'}`
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const additionalContext = parsed?.hookSpecificOutput?.additionalContext;

        if (typeof additionalContext !== 'string' || additionalContext.length === 0) {
          reject(new Error('SessionStart did not return hookSpecificOutput.additionalContext.'));
          return;
        }

        resolve({
          output: parsed,
          additionalContext
        });
      } catch (error) {
        reject(
          new Error(
            `Failed to parse SessionStart output: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });

    child.stdin.end(JSON.stringify({ cwd: projectPath }));
  });
}

async function measureSessionStart(projectPath) {
  const { output, additionalContext } = await invokeSessionStart(projectPath);
  const tokenResult = await countTokens(additionalContext);
  const warnings = Array.isArray(output.warnings) ? output.warnings : [];

  return {
    label: 'session-start-injection',
    scriptPath: toRepoRelative(sessionStartPath),
    hookEventName: output?.hookSpecificOutput?.hookEventName ?? null,
    integrityStatus: output?.integrityStatus ?? null,
    warningCount: warnings.length,
    systemMessagePresent:
      typeof output?.systemMessage === 'string' && output.systemMessage.length > 0,
    additionalContextChars: additionalContext.length,
    additionalContextTokens: tokenResult.count,
    mode: tokenResult.mode,
    additionalContextSha256: sha256(additionalContext)
  };
}

async function main() {
  const [claudeSurface, skillSurface, flowSurface, sessionStartSurface] = await Promise.all([
    measureSurface('kernel-claude', claudePath),
    measureSurface('kernel-skill', skillPath),
    measureSurface('flow-status-command', flowCommandPath),
    measureSessionStart(repoRoot)
  ]);

  const kernelOwnedBaseTokens =
    claudeSurface.tokens +
    skillSurface.tokens +
    sessionStartSurface.additionalContextTokens;
  const incrementalFlowTokens = flowSurface.tokens;
  const baselineInvocationTokens = kernelOwnedBaseTokens + incrementalFlowTokens;
  const withinBudget = incrementalFlowTokens <= INCREMENTAL_BUDGET_MAX;

  const artifact = {
    artifactId: 'phase1-context-baseline',
    phase: 1,
    createdAt: new Date().toISOString(),
    passed: withinBudget,
    measurementMethod: {
      kernelOwnedFiles: 'Measured from raw file contents.',
      sessionStart: 'Measured from live SessionStart hook output (additionalContext).',
      flowCommand: 'Measured from the command markdown entrypoint for /flow-status.',
      tokenCounter:
        'Measured with the repo token-counter helper; provider-native if configured, otherwise char_fallback.'
    },
    validationClaim:
      'Baseline operator invocation stays within the Phase 1 incremental context budget.',
    scenario: {
      commandName: '/flow-status',
      commandDocPath: flowSurface.path,
      excludedSurfaces: [
        {
          surface: 'cliBridgeResponses',
          reason:
            'Variable and invocation-dependent; excluded from the pre-invocation baseline measurement.'
        }
      ]
    },
    sources: {
      kernelOwned: {
        claude: claudeSurface,
        skill: skillSurface,
        sessionStart: sessionStartSurface
      },
      operatorIncremental: {
        flowCommand: flowSurface
      }
    },
    totals: {
      kernelOwnedBaseTokens,
      incrementalFlowTokens,
      baselineInvocationTokens,
      incrementalBudgetMax: INCREMENTAL_BUDGET_MAX,
      withinBudget
    },
    notes: [
      'The incremental budget gate applies only to the flow-specific context added beyond the kernel-owned base.',
      'CLI bridge responses are intentionally excluded because they are invocation-dependent and not part of the pre-invocation baseline.'
    ],
    referenceBudgets: {
      kernelOwnedBaseEstimate: '~800-1000 tokens combined (spec estimate, kernel-owned)',
      perFlowCommandEstimate: '~200-400 tokens',
      incrementalFlowBudgetMax: INCREMENTAL_BUDGET_MAX
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
    console.log(
      `baseline ${artifact.totals.baselineInvocationTokens} tokens (${artifact.totals.incrementalFlowTokens} incremental)`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { main as measureContextBaseline };
