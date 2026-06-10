import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  activeDomainRecordPath
} from '../../phase10/domain-lifecycle.js';
import {
  listInboxEntries,
  listInboxForCurator,
  submitInboxCandidate
} from '../../phase10/inbox.js';
import {
  listSourceBundles
} from '../../phase10/source-bundles.js';
import {
  ingestScientificSkillDiscoveries,
  listScientificSkillCache
} from '../../phase10/scientific-skill-intake.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject
} from '../cli/_fixture.js';

const execFileAsync = promisify(execFile);
const TIMESTAMP = '2026-06-10T00:00:00.000Z';

const ACTIVE_DOMAIN = Object.freeze({
  schemaVersion: 'phase10.knowledge-domain.v1',
  domainId: 'KDOM-skill-intake',
  name: 'Scientific Skill Intake Domain',
  lifecycleStatus: 'active',
  objectiveLinks: ['OBJ-skill-intake'],
  active: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

async function withProject(testName, fn) {
  const projectRoot = await createCliFixtureProject(testName);
  try {
    return await fn(projectRoot);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
}

async function installDomain(projectRoot, overrides = {}) {
  await writeJson(activeDomainRecordPath(projectRoot), {
    ...ACTIVE_DOMAIN,
    ...overrides
  });
}

async function expectCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

function discovery(overrides = {}) {
  return {
    provider: 'pubmed',
    discoveredBySkill: 'pubmed-literature-scout',
    discoveredByTask: {
      objectiveId: 'OBJ-skill-intake',
      taskId: 'TASK-skill-intake'
    },
    title: 'PARP resistance mechanism paper',
    pmid: '12345678',
    doi: '10.1000/parp-resistance',
    url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
    selectionRationale: 'Matches the active evidence gap for PARP resistance.',
    relevanceScore: 0.91,
    whyThisMatters: 'It may explain resistance in the current oncology domain.',
    abstract: 'Discovery abstract stays preliminary until operator review.',
    ...overrides
  };
}

async function assertGitIgnored(projectRoot, repoRelativePath) {
  const { stdout } = await execFileAsync(
    'git',
    ['check-ignore', '-v', '--', repoRelativePath],
    { cwd: projectRoot }
  );
  assert.match(stdout, /\.vre-local\/skill-cache/u);
}

test('scientific-skill intake rejects missing or archived domains before writes', async () => {
  await withProject('phase10-skill-intake-domain-', async (projectRoot) => {
    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery()],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_INTAKE_DOMAIN_REQUIRED'
    );
    assert.equal(await pathExists(path.join(projectRoot, '.vre-local')), false);

    await installDomain(projectRoot, { lifecycleStatus: 'archived' });
    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery()],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_INTAKE_DOMAIN_ARCHIVED'
    );
    assert.equal(await pathExists(path.join(projectRoot, '.vre-local')), false);
  });
});

test('scientific-skill intake rejects unsupported or ungrounded discoveries', async () => {
  await withProject('phase10-skill-intake-rejects-', async (projectRoot) => {
    await installDomain(projectRoot);

    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery({ provider: 'crossref' })],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_PROVIDER_UNSUPPORTED'
    );
    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery({ discoveredBySkill: '' })],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_DISCOVERED_BY_SKILL_REQUIRED'
    );
    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery({ discoveredByTask: { objectiveId: 'OBJ-skill-intake' } })],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_DISCOVERED_BY_TASK_REQUIRED'
    );
    await expectCode(
      () => ingestScientificSkillDiscoveries(projectRoot, {
        discoveries: [discovery({ pmid: '', doi: '', url: '' })],
        timestamp: TIMESTAMP
      }),
      'E_PHASE10_SKILL_STABLE_ID_REQUIRED'
    );

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.equal(entries.length, 0);
  });
});

test('incomplete discoveries are cached under gitignored skill-cache only', async () => {
  await withProject('phase10-skill-intake-cache-', async (projectRoot) => {
    await installDomain(projectRoot);

    const result = await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [discovery({ selectionRationale: '' })],
      timestamp: TIMESTAMP
    });
    assert.equal(result.cacheRecordCount, 1);
    assert.equal(result.inboxCandidateCount, 0);
    assert.match(result.cacheRecords[0].cachePath, /^\.vre-local\/skill-cache\//u);

    await assertGitIgnored(projectRoot, result.cacheRecords[0].cachePath);
    const cacheRecord = await readJson(path.join(projectRoot, result.cacheRecords[0].cachePath));
    assert.equal(cacheRecord.schemaVersion, 'phase10.skill-cache-record.v1');
    assert.equal(cacheRecord.ttlExpiresAt, '2026-06-17T00:00:00.000Z');
    assert.equal(cacheRecord.notProvenance, true);

    const cached = await listScientificSkillCache(projectRoot);
    assert.equal(cached.length, 1);
    assert.equal(cached[0].provider, 'pubmed');

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.equal(entries.length, 0);

    for (const forbidden of ['raw', 'source-bundles', 'wiki', 'provenance-links']) {
      assert.equal(
        await pathExists(path.join(projectRoot, '.vibe-science-environment', 'phase10', forbidden)),
        false,
        `${forbidden} must not be created from skill-cache records`
      );
    }
  });
});

test('valid PubMed and DOI discoveries stage pending inbox candidates only', async () => {
  await withProject('phase10-skill-intake-pubmed-', async (projectRoot) => {
    await installDomain(projectRoot);

    const result = await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [
        discovery({ doi: '', url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/' }),
        discovery({
          pmid: '',
          doi: '10.1000/doi-preferred',
          url: 'https://example.test/doi-preferred',
          title: 'DOI preferred discovery'
        })
      ],
      timestamp: TIMESTAMP
    });
    assert.equal(result.inboxCandidateCount, 2);
    assert.equal(result.cacheRecordCount, 0);

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.equal(entries.length, 2);
    assert.equal(entries.every((entry) => entry.candidateStatus === 'pending'), true);
    const pmidEntry = entries.find((entry) => entry.sourceRef.type === 'pmid');
    const doiEntry = entries.find((entry) => entry.sourceRef.id === '10.1000/doi-preferred');
    assert.equal(pmidEntry.sourceRef.id, '12345678');
    assert(pmidEntry.dedupeKeys.includes('pmid:12345678'));
    assert.equal(doiEntry.sourceRef.type, 'doi');
    assert.equal(doiEntry.preliminaryMetadata.notProvenance, true);

    const bundles = await listSourceBundles(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.equal(bundles.length, 0);
  });
});

test('native GEO AlphaFold and OpenAlex identifiers use typed other refs', async () => {
  await withProject('phase10-skill-intake-native-ids-', async (projectRoot) => {
    await installDomain(projectRoot);

    await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [
        discovery({ provider: 'geo', accession: 'GSE157153', pmid: '', doi: '', url: '' }),
        discovery({ provider: 'alphafold', modelId: 'AF-P04637-F1', pmid: '', doi: '', url: '' }),
        discovery({ provider: 'openalex', openAlexId: 'W2741809807', pmid: '', doi: '', url: '' })
      ],
      timestamp: TIMESTAMP
    });

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.deepEqual(
      entries.map((entry) => entry.sourceRef),
      [
        { type: 'other', id: 'alphafold:AF-P04637-F1' },
        { type: 'other', id: 'geo:GSE157153' },
        { type: 'other', id: 'openalex:W2741809807' }
      ]
    );
    assert(entries[0].dedupeKeys.includes('alphafold:AF-P04637-F1'.toLowerCase()));
    assert(entries[1].dedupeKeys.includes('geo:gse157153'));
    assert(entries[2].dedupeKeys.includes('openalex:w2741809807'.toLowerCase()));
  });
});

test('duplicates are cached without weakening inbox dedupe protection', async () => {
  await withProject('phase10-skill-intake-duplicates-', async (projectRoot) => {
    await installDomain(projectRoot);

    await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [discovery()],
      timestamp: TIMESTAMP
    });
    const duplicate = await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [discovery({ title: 'Duplicate DOI discovery' })],
      timestamp: TIMESTAMP
    });
    assert.equal(duplicate.cacheRecordCount, 1);
    assert.equal(duplicate.cacheRecords[0].reason, 'duplicate-dedupe-key');

    await expectCode(
      () => submitInboxCandidate(projectRoot, {
        inboxEntry: {
          schemaVersion: 'phase10.inbox-entry.v1',
          inboxEntryId: 'INBOX-duplicate-direct',
          domainId: 'KDOM-skill-intake',
          entryType: 'raw-document',
          sourceRef: { type: 'doi', id: '10.1000/parp-resistance' },
          dedupeKeys: ['doi:10.1000/parp-resistance'],
          discoveredBySkill: 'direct-test',
          discoveredByTask: { objectiveId: 'OBJ-skill-intake', taskId: 'TASK-direct' },
          discoveredAt: TIMESTAMP,
          selectionRationale: 'Direct duplicate proof.',
          relevanceScore: 0.5,
          whyThisMatters: 'The inbox dedupe guard must still reject this.',
          candidateStatus: 'pending',
          priority: 'normal',
          payloadStatus: 'metadata-only',
          createdAt: TIMESTAMP
        }
      }),
      'E_PHASE10_INBOX_DUPLICATE_DEDUPE_KEY'
    );
  });
});

test('more than ten eligible discoveries are batched without raising the cap', async () => {
  await withProject('phase10-skill-intake-batching-', async (projectRoot) => {
    await installDomain(projectRoot);

    await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: Array.from({ length: 12 }, (_, index) => discovery({
        pmid: String(10000000 + index),
        doi: '',
        url: '',
        title: `PubMed discovery ${index + 1}`
      })),
      timestamp: TIMESTAMP
    });

    const entries = await listInboxEntries(projectRoot, { domainId: 'KDOM-skill-intake' });
    assert.equal(entries.length, 12);
    const countsByTask = new Map();
    for (const entry of entries) {
      const taskId = entry.discoveredByTask.taskId;
      countsByTask.set(taskId, (countsByTask.get(taskId) ?? 0) + 1);
    }
    assert.deepEqual([...countsByTask.values()].sort((a, b) => a - b), [2, 10]);

    await expectCode(
      () => submitInboxCandidate(projectRoot, {
        inboxEntry: {
          ...entries[0],
          inboxEntryId: 'INBOX-cap-direct',
          sourceRef: { type: 'url', id: 'https://example.test/cap-direct' },
          dedupeKeys: ['url:https://example.test/cap-direct']
        }
      }),
      'E_PHASE10_INBOX_TASK_CAP_EXCEEDED'
    );
  });
});

test('curator view never exposes skill-cache payloads', async () => {
  await withProject('phase10-skill-intake-curator-', async (projectRoot) => {
    await installDomain(projectRoot);

    await ingestScientificSkillDiscoveries(projectRoot, {
      discoveries: [
        discovery({ selectionRationale: '', abstract: 'CACHE PAYLOAD MUST NOT REACH CURATOR' }),
        discovery({ pmid: '22222222', title: 'Visible inbox title' })
      ],
      timestamp: TIMESTAMP
    });

    const curatorEntries = await listInboxForCurator(projectRoot, {
      domainId: 'KDOM-skill-intake'
    });
    const serialized = JSON.stringify(curatorEntries);
    assert.equal(serialized.includes('CACHE PAYLOAD MUST NOT REACH CURATOR'), false);
    assert.equal(curatorEntries.length, 1);
    assert.equal(curatorEntries[0].sourceRef.redacted, true);
  });
});
