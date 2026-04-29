import { access, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertValid,
  loadValidator,
  readJsonl,
  resolveInside,
  resolveProjectRoot,
  withLock
} from '../control/_io.js';

export const CLAIM_EDGE_SCHEMA_FILE = 'phase9-claim-edge.schema.json';
export const CLAIM_EDGE_SCHEMA_VERSION = 'phase9.claim-edge.v1';
export const CLAIM_EDGES_RELATIVE_PATH = '.vibe-science-environment/claims/edges.jsonl';
export const CLAIM_EDGES_LOCK_NAME = 'claims-edges.jsonl';
export const CLAIM_EDGE_RELATIONS = Object.freeze([
  'supports',
  'contradicts',
  'supersedes',
  'depends_on',
  'evolved_into',
  'related_to'
]);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PROJECT_ROOT = resolveProjectRoot(path.join(MODULE_DIR, '..', '..'));
const CLAIM_EDGE_RELATION_SET = new Set(CLAIM_EDGE_RELATIONS);
const DUPLICATE_COMPARISON_IGNORED_FIELDS = new Set(['createdAt']);

export class ClaimEdgeStoreError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'ClaimEdgeStoreError';
    this.code = code;
    this.extra = extra;
  }
}

function failClaimEdge(code, message, extra = {}) {
  throw new ClaimEdgeStoreError({ code, message, extra });
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

async function resolveSchemaHostRoot(projectRoot) {
  const candidatePath = path.join(
    projectRoot,
    'environment',
    'schemas',
    CLAIM_EDGE_SCHEMA_FILE
  );
  if (await pathExists(candidatePath)) {
    return projectRoot;
  }
  return MODULE_PROJECT_ROOT;
}

function claimEdgesPath(projectRoot) {
  return resolveInside(resolveProjectRoot(projectRoot), CLAIM_EDGES_RELATIVE_PATH);
}

function normalizeForDuplicateComparison(edgeRecord) {
  return Object.fromEntries(
    Object.entries(edgeRecord)
      .filter(([key]) => !DUPLICATE_COMPARISON_IGNORED_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function duplicateTupleMatches(left, right) {
  return left.fromId === right.fromId
    && left.toId === right.toId
    && left.relation === right.relation;
}

function duplicatePayloadMatches(left, right) {
  return JSON.stringify(normalizeForDuplicateComparison(left))
    === JSON.stringify(normalizeForDuplicateComparison(right));
}

async function validateClaimEdge(projectRoot, edgeRecord) {
  if (!CLAIM_EDGE_RELATION_SET.has(edgeRecord?.relation)) {
    failClaimEdge(
      'E_CLAIM_EDGE_RELATION_UNKNOWN',
      `Claim-edge relation is not in the reviewed enum: ${edgeRecord?.relation ?? '(missing)'}`,
      { relation: edgeRecord?.relation }
    );
  }

  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot);
  const validate = await loadValidator(schemaHostRoot, CLAIM_EDGE_SCHEMA_FILE);
  try {
    assertValid(validate, edgeRecord, 'phase9 claim edge');
  } catch (error) {
    failClaimEdge('E_CLAIM_EDGE_INVALID', error.message, {
      errors: validate.errors ?? []
    });
  }

  if (edgeRecord.fromId === edgeRecord.toId) {
    failClaimEdge(
      'E_CLAIM_EDGE_SELF_LOOP',
      'Claim-edge self loops are rejected by the store consumer.',
      { claimId: edgeRecord.fromId }
    );
  }
}

async function resolveClaimEndpoint({ projectRoot, edgeRecord, claimResolver, endpoint }) {
  const claimId = edgeRecord[endpoint];
  try {
    return await claimResolver(claimId, {
      projectRoot,
      edgeRecord,
      endpoint
    });
  } catch (error) {
    failClaimEdge(
      'E_CLAIM_EDGE_RESOLVER_UNAVAILABLE',
      `Claim-edge resolver failed while checking ${endpoint}.`,
      {
        endpoint,
        claimId,
        cause: error?.message ?? String(error)
      }
    );
  }
}

async function validateEndpoints(projectRoot, edgeRecord, options) {
  if (options.claimResolver == null) {
    if (options.allowUnverifiedEndpoints === true) {
      return;
    }
    failClaimEdge(
      'E_CLAIM_EDGE_RESOLVER_UNAVAILABLE',
      'Claim-edge writes require a claimResolver unless allowUnverifiedEndpoints is true.'
    );
  }

  if (typeof options.claimResolver !== 'function') {
    failClaimEdge(
      'E_CLAIM_EDGE_RESOLVER_UNAVAILABLE',
      'claimResolver must be a function.'
    );
  }

  const [fromExists, toExists] = await Promise.all([
    resolveClaimEndpoint({
      projectRoot,
      edgeRecord,
      claimResolver: options.claimResolver,
      endpoint: 'fromId'
    }),
    resolveClaimEndpoint({
      projectRoot,
      edgeRecord,
      claimResolver: options.claimResolver,
      endpoint: 'toId'
    })
  ]);

  if (!fromExists) {
    failClaimEdge(
      'E_CLAIM_EDGE_FROM_ID_UNKNOWN',
      `Claim-edge fromId does not resolve to a known claim: ${edgeRecord.fromId}`,
      { fromId: edgeRecord.fromId }
    );
  }

  if (!toExists) {
    failClaimEdge(
      'E_CLAIM_EDGE_TO_ID_UNKNOWN',
      `Claim-edge toId does not resolve to a known claim: ${edgeRecord.toId}`,
      { toId: edgeRecord.toId }
    );
  }
}

export async function createClaimEdge(projectRoot, edgeRecord, options = {}) {
  const canonicalProjectRoot = resolveProjectRoot(projectRoot);
  await validateClaimEdge(canonicalProjectRoot, edgeRecord);
  await validateEndpoints(canonicalProjectRoot, edgeRecord, options);

  return withLock(
    canonicalProjectRoot,
    CLAIM_EDGES_LOCK_NAME,
    async () => {
      const targetPath = claimEdgesPath(canonicalProjectRoot);
      await mkdir(path.dirname(targetPath), { recursive: true });
      const existingEdges = await readJsonl(targetPath);
      const duplicate = existingEdges.find((candidate) =>
        duplicateTupleMatches(candidate, edgeRecord)
      );

      if (duplicate != null) {
        if (duplicatePayloadMatches(duplicate, edgeRecord)) {
          return { ok: true, status: 'duplicate-no-op' };
        }

        failClaimEdge(
          'E_CLAIM_EDGE_DUPLICATE_CONFLICT',
          'Claim-edge duplicate tuple carries conflicting payload.',
          {
            fromId: edgeRecord.fromId,
            toId: edgeRecord.toId,
            relation: edgeRecord.relation
          }
        );
      }

      await appendFile(targetPath, `${JSON.stringify(edgeRecord)}\n`, 'utf8');
      return { ok: true, status: 'written' };
    },
    options.lockOptions
  );
}

export async function readClaimEdges(projectRoot, options = {}) {
  const records = await readJsonl(claimEdgesPath(projectRoot));
  if (options.relation == null) {
    return records;
  }
  return records.filter((record) => record.relation === options.relation);
}
