import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadValidator } from '../../control/_io.js';
import {
  createObjectiveStore,
  OBJECTIVE_SCHEMA_FILE
} from '../../objectives/store.js';

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'environment',
  'tests',
  'fixtures',
  'phase9',
  'objective'
);

async function readFixture(fileName) {
  return JSON.parse(await readFile(path.join(FIXTURES_DIR, fileName), 'utf8'));
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
});
