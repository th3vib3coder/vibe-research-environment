import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { loadValidator } from '../../control/_io.js';
import {
  appendObjectiveHandoff,
  createObjectiveStore,
  OBJECTIVE_SCHEMA_FILE,
  readObjectiveHandoffs
} from '../../objectives/store.js';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'objective'
);
const HANDOFF_FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'handoff'
);
const STORE_MODULE_URL = pathToFileURL(
  path.resolve(process.cwd(), 'environment', 'objectives', 'store.js')
).href;
const execFileAsync = promisify(execFile);

async function readFixture(fileName) {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, fileName), 'utf8'));
}

async function readHandoffFixture(fileName) {
  return JSON.parse(await readFile(path.join(HANDOFF_FIXTURES_DIR, fileName), 'utf8'));
}

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

async function buildObjectiveRecord(objectiveId) {
  const objectiveRecord = await readFixture('valid-active.json');
  return {
    ...objectiveRecord,
    objectiveId
  };
}

async function buildHandoff(objectiveId, overrides = {}) {
  const handoff = await readHandoffFixture('valid-basic.json');
  return {
    ...handoff,
    objectiveId,
    ...overrides
  };
}

describe('objective-store', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-objective-store-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('creates the canonical objective root and first durable artifacts from a valid objective fixture', async () => {
    const objectiveRecord = await readFixture('valid-active.json');
    const result = await createObjectiveStore(projectRoot, objectiveRecord);
    const validate = await loadValidator(process.cwd(), OBJECTIVE_SCHEMA_FILE);

    const persistedObjective = JSON.parse(
      await readFile(result.objectiveRecordPath, 'utf8')
    );

    assert.equal(validate(persistedObjective), true);
    assert.deepEqual(persistedObjective, objectiveRecord);
    assert.equal(await readFile(result.objectiveEventsPath, 'utf8'), '');
    assert.equal(await readFile(result.objectiveHandoffsPath, 'utf8'), '');
    assert.equal((await stat(result.objectiveDigestsDir)).isDirectory(), true);

    const objectiveEntries = await readdir(result.objectiveDir);
    assert.deepEqual(
      objectiveEntries.sort((left, right) => left.localeCompare(right)),
      ['digests', 'events.jsonl', 'handoffs.jsonl', 'objective.json']
    );
    assert.equal(
      objectiveEntries.some((entry) => entry.includes('.tmp')),
      false
    );
    assert.equal(
      await pathExists(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'objectives',
          'active-objective.json'
        )
      ),
      false
    );
  });

  it('fails closed when stopConditions is missing', async () => {
    const objectiveRecord = await readFixture('invalid-missing-stop-conditions.json');

    await assert.rejects(
      createObjectiveStore(projectRoot, objectiveRecord),
      /Invalid phase9 objective:/u
    );
    assert.equal(
      await pathExists(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'objectives',
          objectiveRecord.objectiveId
        )
      ),
      false
    );
  });

  it('fails closed when runtimeMode is outside the pinned enum', async () => {
    const objectiveRecord = await readFixture('invalid-runtime-mode.json');

    await assert.rejects(
      createObjectiveStore(projectRoot, objectiveRecord),
      /Invalid phase9 objective:/u
    );
    assert.equal(
      await pathExists(
        path.join(
          projectRoot,
          '.vibe-science-environment',
          'objectives',
          objectiveRecord.objectiveId
        )
      ),
      false
    );
  });

  it('appends durable handoffs that a fresh process can reconstruct from handoffs.jsonl', async () => {
    const objectiveId = `OBJ-T452-STORE-${Date.now()}`;
    const objectiveRecord = await buildObjectiveRecord(objectiveId);
    const claimArtifact = path.join(
      projectRoot,
      '.vibe-science-environment',
      'objectives',
      objectiveId,
      'review',
      'claim-001.md'
    );
    const packageArtifact = path.join(
      projectRoot,
      '.vibe-science-environment',
      'objectives',
      objectiveId,
      'results',
      'bundle-001.json'
    );
    await createObjectiveStore(projectRoot, objectiveRecord);
    await mkdir(path.dirname(claimArtifact), { recursive: true });
    await mkdir(path.dirname(packageArtifact), { recursive: true });
    await writeFile(claimArtifact, '# claim bundle\n', 'utf8');
    await writeFile(packageArtifact, '{"ok":true}\n', 'utf8');

    const first = await appendObjectiveHandoff(
      projectRoot,
      objectiveId,
      await buildHandoff(objectiveId, {
        handoffId: 'H-STORE-001',
        fromAgentRole: 'results-agent',
        toAgentRole: 'lead-researcher',
        artifactPaths: [packageArtifact],
        summary: 'Results bundle ready for the lead.',
        writerSession: 'sess-results'
      }),
      {
        workspaceRoot: projectRoot
      }
    );
    const second = await appendObjectiveHandoff(
      projectRoot,
      objectiveId,
      await buildHandoff(objectiveId, {
        handoffId: 'H-STORE-002',
        fromAgentRole: 'reviewer-2',
        toAgentRole: 'lead-researcher',
        artifactPaths: [claimArtifact],
        summary: 'Reviewer-2 digest ready for the lead.',
        writerSession: 'sess-reviewer'
      }),
      {
        workspaceRoot: projectRoot
      }
    );

    assert.equal(first.handoff.recordSeq, 1);
    assert.equal(second.handoff.recordSeq, 2);
    assert.equal(
      first.handoff.artifactPaths[0],
      `.vibe-science-environment/objectives/${objectiveId}/results/bundle-001.json`
    );
    assert.equal(
      second.handoff.artifactPaths[0],
      `.vibe-science-environment/objectives/${objectiveId}/review/claim-001.md`
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'const { readObjectiveHandoffs } = await import(process.env.STORE_MODULE_URL);'
          + 'const records = await readObjectiveHandoffs(process.env.PROJECT_ROOT, process.env.OBJECTIVE_ID);'
          + 'process.stdout.write(JSON.stringify(records));'
      ],
      {
        env: {
          ...process.env,
          STORE_MODULE_URL,
          PROJECT_ROOT: projectRoot,
          OBJECTIVE_ID: objectiveId
        }
      }
    );

    const freshProcessHandoffs = JSON.parse(stdout);
    assert.deepEqual(
      freshProcessHandoffs.map((entry) => [
        entry.recordSeq,
        entry.fromAgentRole,
        entry.toAgentRole,
        entry.summary
      ]),
      [
        [1, 'results-agent', 'lead-researcher', 'Results bundle ready for the lead.'],
        [2, 'reviewer-2', 'lead-researcher', 'Reviewer-2 digest ready for the lead.']
      ]
    );
  });

  it('serializes concurrent handoff appends without corrupting handoffs.jsonl', async () => {
    const objectiveId = `OBJ-T452-CONCURRENT-${Date.now()}`;
    const objectiveRecord = await buildObjectiveRecord(objectiveId);
    const artifactPath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'objectives',
      objectiveId,
      'results',
      'concurrent.json'
    );
    await createObjectiveStore(projectRoot, objectiveRecord);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, '{"concurrent":true}\n', 'utf8');

    const writes = await Promise.all(
      Array.from({ length: 5 }, async (_unused, index) => appendObjectiveHandoff(
        projectRoot,
        objectiveId,
        await buildHandoff(objectiveId, {
          handoffId: `H-CONCURRENT-${index + 1}`,
          fromAgentRole: index % 2 === 0 ? 'results-agent' : 'continuity-agent',
          toAgentRole: 'lead-researcher',
          artifactPaths: [artifactPath],
          summary: `Concurrent handoff ${index + 1}`,
          writerSession: `sess-concurrent-${index + 1}`
        }),
        {
          workspaceRoot: projectRoot
        }
      ))
    );

    const rawJsonl = await readFile(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveId,
        'handoffs.jsonl'
      ),
      'utf8'
    );
    const rawLines = rawJsonl.split(/\r?\n/u).filter(Boolean);
    const parsedLines = rawLines.map((line) => JSON.parse(line));
    const persistedHandoffs = await readObjectiveHandoffs(projectRoot, objectiveId);

    assert.equal(writes.length, 5);
    assert.equal(rawLines.length, 5);
    assert.equal(parsedLines.length, 5);
    assert.deepEqual(
      [...persistedHandoffs.map((entry) => entry.recordSeq)].sort((left, right) => left - right),
      [1, 2, 3, 4, 5]
    );
    assert.deepEqual(
      persistedHandoffs.map((entry) => entry.summary).sort((left, right) => left.localeCompare(right)),
      [
        'Concurrent handoff 1',
        'Concurrent handoff 2',
        'Concurrent handoff 3',
        'Concurrent handoff 4',
        'Concurrent handoff 5'
      ]
    );
  });

  it('fails closed with E_WORKSPACE_WRITE_ESCAPE when a handoff artifact escapes the reviewed write closure', async () => {
    const objectiveId = `OBJ-T452-ESCAPE-${Date.now()}`;
    const objectiveRecord = await buildObjectiveRecord(objectiveId);
    const workspaceRoot = path.join(projectRoot, 'workspace');
    const scratchRoot = path.join(projectRoot, '.vibe-science-environment', 'runtime', 'scratch');
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'vre-objective-store-outside-'));
    const outsideArtifact = path.join(outsideRoot, 'outside.md');

    await createObjectiveStore(projectRoot, objectiveRecord);
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(scratchRoot, { recursive: true });
    await writeFile(outsideArtifact, 'outside closure\n', 'utf8');

    try {
      await assert.rejects(
        appendObjectiveHandoff(
          projectRoot,
          objectiveId,
          await buildHandoff(objectiveId, {
            handoffId: 'H-ESCAPE-001',
            fromAgentRole: 'results-agent',
            toAgentRole: 'lead-researcher',
            artifactPaths: [outsideArtifact],
            summary: 'This should fail because the artifact escapes the closure.',
            writerSession: 'sess-escape'
          }),
          {
            workspaceRoot,
            scratchRoot
          }
        ),
        (error) => error?.code === 'E_WORKSPACE_WRITE_ESCAPE'
      );
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});
