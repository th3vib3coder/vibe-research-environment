import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  loadValidator,
  readJsonl,
  resolveInside,
} from '../../control/_io.js';
import {
  objectiveEventsPath,
  objectiveHandoffsPath,
  readObjectiveHandoffs,
  readObjectiveRecord,
} from '../../objectives/store.js';
import { objectiveDigestLatestPath } from '../../objectives/digest-writer.js';
import {
  objectiveQueuePath,
  readObjectiveQueueRecords,
} from '../../orchestrator/queue-adapter.js';
import { readResumeSnapshot } from '../../objectives/resume-snapshot.js';

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) {
      fail('E_USAGE', `Unexpected positional argument: ${key}`);
    }
    const name = key.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      fail('E_USAGE', `Missing value for --${name}`);
    }
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

function fail(code, message, extra = {}) {
  const details = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  console.error(`${code}: ${message}${details}`);
  process.exitCode = 1;
  throw new Error(`${code}: ${message}`);
}

function requireArg(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    fail('E_USAGE', `Missing required --${name}`);
  }
  return value;
}

function readEnvelopePaths(rawValue) {
  try {
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string')) {
      fail('E_USAGE', '--envelopes must be a non-empty JSON string array');
    }
    return value;
  } catch (error) {
    if (error.message.startsWith('E_USAGE')) {
      throw error;
    }
    fail('E_USAGE', '--envelopes must be valid JSON');
  }
}

function assertSameObjectiveId(records, objectiveId, label) {
  for (const record of records) {
    if (record.objectiveId !== objectiveId) {
      fail('E_OBJECTIVE_ID_DRIFT', `${label} record objectiveId drifted`, {
        label,
        expected: objectiveId,
        actual: record.objectiveId,
      });
    }
  }
}

async function assertPathExists(targetPath, code, label) {
  try {
    await access(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      fail(code, `${label} is required for artifact-only resume`, { path: targetPath });
    }
    throw error;
  }
}

async function validateEnvelopes({ schemaRoot, objectiveId, envelopePaths }) {
  const validate = await loadValidator(schemaRoot, 'phase9-role-envelope.schema.json');
  const envelopes = [];
  for (const envelopePath of envelopePaths) {
    const envelope = JSON.parse(await readFile(envelopePath, 'utf8'));
    try {
      assertValid(validate, envelope, 'phase9.role-envelope.v1');
    } catch (error) {
      fail('E_ROLE_ENVELOPE_INVALID', error.message, { envelopePath });
    }
    if (envelope.objectiveId !== objectiveId) {
      fail('E_OBJECTIVE_ID_DRIFT', 'role envelope objectiveId drifted', {
        expected: objectiveId,
        actual: envelope.objectiveId,
        envelopePath,
      });
    }
    if (envelope.sessionIsolation?.inheritChatHistory !== false) {
      fail('E_CHAT_HISTORY_INHERITED', 'role envelope must not inherit lead chat history', {
        envelopePath,
      });
    }
    envelopes.push(envelope);
  }
  return envelopes;
}

async function reconstructArtifacts(projectRoot, handoffs) {
  const reconstructed = [];
  for (const handoff of handoffs) {
    for (const artifactPath of handoff.artifactPaths) {
      const absolutePath = path.isAbsolute(artifactPath)
        ? artifactPath
        : resolveInside(projectRoot, artifactPath);
      await assertPathExists(absolutePath, 'E_ARTIFACTS_REQUIRED', `handoff artifact ${artifactPath}`);
      reconstructed.push({
        handoffId: handoff.handoffId,
        artifactPath,
        byteLength: (await readFile(absolutePath, 'utf8')).length,
      });
    }
  }
  return reconstructed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const schemaRoot = requireArg(args, 'schema-root');
  const projectRoot = requireArg(args, 'project-root');
  const objectiveId = requireArg(args, 'objective');
  const envelopePaths = readEnvelopePaths(requireArg(args, 'envelopes'));
  const leadTranscriptPath = args['lead-transcript'] ?? null;

  if (leadTranscriptPath) {
    await assertPathExists(leadTranscriptPath, 'E_LEAD_TRANSCRIPT_FIXTURE_MISSING', 'lead transcript fixture');
  }

  const envelopes = await validateEnvelopes({ schemaRoot, objectiveId, envelopePaths });
  const objectiveRecord = await readObjectiveRecord(projectRoot, objectiveId);
  if (objectiveRecord.objectiveId !== objectiveId) {
    fail('E_OBJECTIVE_ID_DRIFT', 'objective record objectiveId drifted', {
      expected: objectiveId,
      actual: objectiveRecord.objectiveId,
    });
  }

  const [handoffs, queueRecords, events, snapshotRead, digestText] = await Promise.all([
    readObjectiveHandoffs(projectRoot, objectiveId),
    readObjectiveQueueRecords(projectRoot, objectiveId),
    readJsonl(objectiveEventsPath(projectRoot, objectiveId)),
    readResumeSnapshot(projectRoot, objectiveId),
    readFile(objectiveDigestLatestPath(projectRoot, objectiveId), 'utf8'),
  ]);

  assertSameObjectiveId(handoffs, objectiveId, 'handoff');
  assertSameObjectiveId(queueRecords, objectiveId, 'queue');
  assertSameObjectiveId(events, objectiveId, 'event');
  if (!snapshotRead.exists || snapshotRead.validationError) {
    fail('E_RESUME_SNAPSHOT_REQUIRED', 'fresh lead resume requires a schema-valid resume snapshot', {
      validationError: snapshotRead.validationError,
    });
  }
  if (snapshotRead.snapshot.objectiveId !== objectiveId) {
    fail('E_OBJECTIVE_ID_DRIFT', 'resume snapshot objectiveId drifted', {
      expected: objectiveId,
      actual: snapshotRead.snapshot.objectiveId,
    });
  }
  if (!digestText.includes(`- Objective: ${objectiveId}`)) {
    fail('E_OBJECTIVE_ID_DRIFT', 'digest does not name the owning objectiveId', {
      expected: objectiveId,
    });
  }

  const reconstructedArtifacts = await reconstructArtifacts(projectRoot, handoffs);
  await assertPathExists(objectiveHandoffsPath(projectRoot, objectiveId), 'E_HANDOFF_LEDGER_REQUIRED', 'handoff ledger');
  await assertPathExists(objectiveQueuePath(projectRoot, objectiveId), 'E_QUEUE_REQUIRED', 'queue ledger');

  process.stdout.write(JSON.stringify({
    resumeRole: 'lead-researcher',
    objectiveId,
    validatedEnvelopeCount: envelopes.length,
    roleIds: envelopes.map((envelope) => envelope.roleId),
    artifactOnlyReconstruction: reconstructedArtifacts.length >= envelopes.length,
    reconstructedArtifactCount: reconstructedArtifacts.length,
    handoffCount: handoffs.length,
    queueRecordCount: queueRecords.length,
    eventCount: events.length,
    openHandoffs: snapshotRead.snapshot.openHandoffs,
    openBlockerCodes: snapshotRead.snapshot.openBlockers.map((blocker) => blocker.code),
    usedLeadChatHistory: false,
  }));
}

main().catch((error) => {
  if (process.exitCode == null || process.exitCode === 0) {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  }
});
