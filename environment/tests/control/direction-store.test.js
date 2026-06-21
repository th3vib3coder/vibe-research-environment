import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readJsonl } from '../../control/_io.js';
import {
  DIRECTION_EVENTS_FILE,
  directionsEventsPath,
  projectDirectionEvents,
  readDirectionEvents,
  readDirectionProjection,
  recordDirection,
} from '../../directions/store.js';

function directionRecord(overrides = {}) {
  return {
    schemaVersion: 'vibe-env.direction-record.v1',
    directionId: 'DIR-HGSOC-CXCL13-CD8',
    summary: 'Test CXCL13-positive CD8 T cells in HGSOC',
    state: 'tried',
    reason: 'Initial reviewed direction entry.',
    evidenceRefs: ['claim:C-001'],
    createdAt: '2026-06-21T12:00:00.000Z',
    updatedAt: '2026-06-21T12:00:00.000Z',
    history: [
      {
        state: 'tried',
        reason: 'Initial reviewed direction entry.',
        at: '2026-06-21T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

async function fileTextOrEmpty(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

test('direction store appends a tried record inside the VRE directions namespace', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    const result = await recordDirection(projectRoot, directionRecord());
    const eventsPath = directionsEventsPath(projectRoot);
    const events = await readJsonl(eventsPath);

    assert.equal(result.eventsPath, eventsPath);
    assert.equal(path.basename(eventsPath), DIRECTION_EVENTS_FILE);
    assert.equal(
      path.relative(projectRoot, eventsPath).split(path.sep).join('/'),
      '.vibe-science-environment/directions/directions.jsonl',
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].state, 'tried');
    assert.equal(result.projection['DIR-HGSOC-CXCL13-CD8'].state, 'tried');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store projection is derived by replaying the JSONL event log', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    await recordDirection(projectRoot, directionRecord());
    await recordDirection(
      projectRoot,
      directionRecord({
        state: 'parked',
        reason: 'Park until an independent endometriosis cohort is reviewed.',
        evidenceRefs: ['claim:C-001', 'decision:D-park'],
        updatedAt: '2026-06-21T12:10:00.000Z',
        history: [
          directionRecord().history[0],
          {
            state: 'parked',
            reason: 'Park until an independent endometriosis cohort is reviewed.',
            at: '2026-06-21T12:10:00.000Z',
          },
        ],
      }),
    );

    const events = await readDirectionEvents(projectRoot);
    const projectedFromPureReplay = projectDirectionEvents(events);
    const projectedFromStore = await readDirectionProjection(projectRoot);

    assert.deepEqual(projectedFromStore, projectedFromPureReplay);
    assert.equal(projectedFromStore['DIR-HGSOC-CXCL13-CD8'].state, 'parked');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store rejects malformed schema records before touching JSONL', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    const invalid = directionRecord({
      state: 'killed',
      reason: 'Killed without a no-repeat guard.',
      history: [
        {
          state: 'killed',
          reason: 'Killed without a no-repeat guard.',
          at: '2026-06-21T12:00:00.000Z',
        },
      ],
    });

    await assert.rejects(
      recordDirection(projectRoot, invalid),
      /Invalid direction record/u,
    );
    assert.equal(await fileTextOrEmpty(directionsEventsPath(projectRoot)), '');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store enforces an explicit transition table', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    await recordDirection(projectRoot, directionRecord());
    await recordDirection(
      projectRoot,
      directionRecord({
        state: 'killed',
        reason: 'Reviewer-2 contradiction killed the direction.',
        doNotRepeatUnless: {
          kind: 'new-dataset',
          detail: 'Independent HGSOC cohort with CXCL13/CD8 annotation',
        },
        updatedAt: '2026-06-21T12:10:00.000Z',
        history: [
          directionRecord().history[0],
          {
            state: 'killed',
            reason: 'Reviewer-2 contradiction killed the direction.',
            at: '2026-06-21T12:10:00.000Z',
          },
        ],
      }),
    );

    await assert.rejects(
      recordDirection(
        projectRoot,
        directionRecord({
          reason: 'Illegal return to tried.',
          updatedAt: '2026-06-21T12:20:00.000Z',
        }),
      ),
      { code: 'E_DIRECTION_TRANSITION_INVALID' },
    );

    const secondRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
    try {
      await recordDirection(secondRoot, directionRecord());
      const parked = await recordDirection(
        secondRoot,
        directionRecord({
          state: 'parked',
          reason: 'Legal parked transition.',
          updatedAt: '2026-06-21T12:05:00.000Z',
          history: [
            directionRecord().history[0],
            {
              state: 'parked',
              reason: 'Legal parked transition.',
              at: '2026-06-21T12:05:00.000Z',
            },
          ],
        }),
      );
      assert.equal(parked.projection['DIR-HGSOC-CXCL13-CD8'].state, 'parked');
    } finally {
      await rm(secondRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store rejects unsafe direction identifiers', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    await assert.rejects(
      recordDirection(projectRoot, directionRecord({ directionId: '../escape' })),
      { code: 'E_DIRECTION_ID_UNSAFE' },
    );
    await assert.rejects(
      recordDirection(projectRoot, directionRecord({ directionId: 'DIR\\escape' })),
      { code: 'E_DIRECTION_ID_UNSAFE' },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store serializes concurrent appends without corrupting JSONL', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    await mkdir(path.join(projectRoot, '.vibe-science-environment'), { recursive: true });
    await Promise.all(
      Array.from({ length: 5 }, async (_unused, index) => recordDirection(
        projectRoot,
        directionRecord({
          directionId: `DIR-CONCURRENT-${index + 1}`,
          summary: `Concurrent direction ${index + 1}`,
          evidenceRefs: [`claim:C-${index + 1}`],
        }),
      )),
    );

    const rawLines = (await readFile(directionsEventsPath(projectRoot), 'utf8'))
      .split(/\r?\n/u)
      .filter(Boolean);
    const parsed = rawLines.map((line) => JSON.parse(line));

    assert.equal(rawLines.length, 5);
    assert.equal(parsed.length, 5);
    assert.deepEqual(
      new Set(parsed.map((entry) => entry.directionId)).size,
      5,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('direction store rejects a preseeded invalid transition during replay', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-store-'));
  try {
    const eventsPath = directionsEventsPath(projectRoot);
    await mkdir(path.dirname(eventsPath), { recursive: true });
    await writeFile(
      eventsPath,
      [
        JSON.stringify(directionRecord({
          state: 'killed',
          doNotRepeatUnless: {
            kind: 'new-method',
            detail: 'Validated contradiction-resolution method',
          },
          history: [
            {
              state: 'killed',
              reason: 'Preseeded invalid initial killed state.',
              at: '2026-06-21T12:00:00.000Z',
            },
          ],
        })),
        '',
      ].join('\n'),
      'utf8',
    );

    await assert.rejects(
      readDirectionProjection(projectRoot),
      { code: 'E_DIRECTION_TRANSITION_INVALID' },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
