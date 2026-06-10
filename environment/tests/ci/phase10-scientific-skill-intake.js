import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listInboxEntries
} from '../../phase10/inbox.js';
import {
  ingestScientificSkillDiscoveries
} from '../../phase10/scientific-skill-intake.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';

const execFileAsync = promisify(execFile);
const TIMESTAMP = '2026-06-10T00:00:00.000Z';

const DOMAIN = {
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-ci-skill-intake',
  name: 'CI Scientific Skill Intake Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-ci-skill-intake'],
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
};

async function fsCp(source, target, options) {
  const { cp } = await import('node:fs/promises');
  return cp(source, target, options);
}

async function copySchemaFixture(targetRoot) {
  const schemaRoot = path.join(targetRoot, 'environment', 'schemas');
  await fsCp(path.join(repoRoot, 'environment', 'schemas'), schemaRoot, { recursive: true });
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function discovery(index, overrides = {}) {
  return {
    provider: 'pubmed',
    discoveredBySkill: 'pubmed-literature-scout',
    discoveredByTask: {
      objectiveId: 'OBJ-ci-skill-intake',
      taskId: 'TASK-ci-skill-intake'
    },
    title: `CI discovery ${index}`,
    pmid: String(30000000 + index),
    selectionRationale: 'CI-selected discovery for the active evidence gap.',
    relevanceScore: 0.8,
    whyThisMatters: 'CI discovery may be useful after operator review.',
    ...overrides
  };
}

async function assertGitIgnored(projectRoot, repoRelativePath) {
  const { stdout } = await execFileAsync(
    'git',
    ['check-ignore', '-v', '--', repoRelativePath],
    { cwd: projectRoot }
  );
  assert(
    stdout.includes('.vre-local/skill-cache'),
    'scientific-skill cache path must be ignored by git'
  );
}

export default async function validatePhase10ScientificSkillIntake() {
  const projectRoot = await mkdtemp(path.join(repoRoot, '.tmp-phase10-skill-intake-ci-'));
  try {
    await copySchemaFixture(projectRoot);
    await writeJson(activeDomainRecordPath(projectRoot), DOMAIN);

    const result = await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [
        ...Array.from({ length: 12 }, (_, index) => discovery(index + 1)),
        discovery(99, { selectionRationale: '' })
      ],
      timestamp: TIMESTAMP
    });
    assert(result.ok === true, 'scientific-skill intake must return ok:true');
    assert(result.inboxCandidateCount === 12, 'intake must stage complete records');
    assert(result.cacheRecordCount === 1, 'intake must cache incomplete records');
    await assertGitIgnored(projectRoot, result.cacheRecords[0].cachePath);

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-ci-skill-intake' });
    assert(entries.length === 12, 'intake must create 12 inbox candidates');
    const countsByTask = new Map();
    for (const entry of entries) {
      const taskId = entry.discoveredByTask.taskId;
      countsByTask.set(taskId, (countsByTask.get(taskId) ?? 0) + 1);
    }
    assert(
      [...countsByTask.values()].every((count) => count <= 10),
      'intake must preserve the default inbox task cap via batching'
    );

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-ci-skill-intake' });
    assert(bundles.length === 0, 'scientific-skill intake must not create source bundles');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-scientific-skill-intake', validatePhase10ScientificSkillIntake);
}
