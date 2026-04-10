import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { now } from '../control/_io.js';
import { applyContinuityProfileUpdate } from '../orchestrator/continuity-profile.js';
import {
  bootstrapOrchestratorState,
  buildDefaultLanePolicies,
} from '../orchestrator/state.js';
import { resolveWorkspacePath } from './_workspace.js';

export const PHASE5_BUNDLES = Object.freeze([
  'governance-core',
  'control-plane',
  'flow-results',
  'flow-writing',
  'orchestrator-core',
]);

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function buildPhase5LanePolicies(overrides = {}) {
  return buildDefaultLanePolicies({
    lanes: {
      execution: {
        enabled: true,
        providerRef: null,
        integrationKind: 'local-logic',
        authMode: 'local-only',
        billingMode: 'none',
        apiFallbackAllowed: false,
        supervisionCapability: 'programmatic',
        interactive: false,
        backgroundSafe: true,
        parallelAllowed: false,
        reviewOnly: false,
        model: null,
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: null,
          maxOutputTokens: null,
          maxUsd: null,
        },
        escalationThreshold: 'medium',
        notes: null,
      },
      review: {
        enabled: true,
        providerRef: 'openai/codex',
        integrationKind: 'local-cli',
        authMode: 'subscription',
        billingMode: 'plan-included',
        apiFallbackAllowed: false,
        supervisionCapability: 'output-only',
        interactive: true,
        backgroundSafe: false,
        parallelAllowed: false,
        reviewOnly: true,
        model: 'gpt-5.4',
        thinkingDepth: 'medium',
        autonomyLevel: 'supervised',
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'manual',
          cooldownMinutes: null,
        },
        costCeiling: {
          maxPromptTokens: 4000,
          maxOutputTokens: 2000,
          maxUsd: 3,
        },
        escalationThreshold: 'immediate',
        notes: null,
      },
    },
    ...cloneValue(overrides),
  });
}

export async function writeInstallState(projectPath, bundles = PHASE5_BUNDLES) {
  const installStatePath = resolveWorkspacePath(
    projectPath,
    '.vibe-science-environment/.install-state.json',
  );
  await mkdir(path.dirname(installStatePath), { recursive: true });
  const payload = {
    schemaVersion: 'vibe-env.install.v1',
    installedAt: now(),
    bundles,
    bundleManifestVersion: '1.0.0',
    operations: [],
    source: {
      version: '0.1.0',
      commit: 'phase5-eval-fixture',
    },
  };
  await writeFile(installStatePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  for (const bundleId of bundles) {
    const manifestPath = resolveWorkspacePath(
      projectPath,
      `environment/install/bundles/${bundleId}.bundle.json`,
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const bootstrapPath of manifest.bootstrapPaths ?? []) {
      await mkdir(resolveWorkspacePath(projectPath, bootstrapPath), { recursive: true });
    }
  }

  return payload;
}

export async function preparePhase5Workspace(projectPath, options = {}) {
  await writeInstallState(projectPath, options.bundles ?? PHASE5_BUNDLES);
  const state = await bootstrapOrchestratorState(projectPath, {
    lanePolicies: options.lanePolicies ?? buildPhase5LanePolicies(),
  });

  for (const update of options.continuityUpdates ?? []) {
    await applyContinuityProfileUpdate(projectPath, {
      path: update.path,
      newValue: update.newValue,
      reason: update.reason,
      actor: update.actor ?? 'operator',
      recordedAt: update.recordedAt ?? now(),
    });
  }

  return state;
}
