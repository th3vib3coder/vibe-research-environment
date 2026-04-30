import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  readClaimEdges
} from '../claims/edges.js';
import {
  resolveProjectRoot
} from '../control/_io.js';

export const AUDIT_QUERY_TIMEOUT_MS = 5_000;
export const EVIDENCE_EDGE_RELATIONS = Object.freeze([
  'contradicts',
  'supports',
  'supersedes',
  'depends_on',
  'evolved_into',
  'related_to'
]);

export class AuditQueryError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'AuditQueryError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new AuditQueryError({ code, message, extra });
}

function defaultAuditQueryCliPath(projectRoot, env = process.env) {
  if (typeof env.VIBE_SCIENCE_AUDIT_QUERY_CLI === 'string' && env.VIBE_SCIENCE_AUDIT_QUERY_CLI.trim() !== '') {
    return path.resolve(env.VIBE_SCIENCE_AUDIT_QUERY_CLI);
  }
  if (typeof env.VIBE_SCIENCE_PLUGIN_ROOT === 'string' && env.VIBE_SCIENCE_PLUGIN_ROOT.trim() !== '') {
    return path.resolve(env.VIBE_SCIENCE_PLUGIN_ROOT, 'scripts', 'audit-query-cli.js');
  }
  return path.join(
    path.dirname(projectRoot),
    'vibe-science',
    'plugin',
    'scripts',
    'audit-query-cli.js'
  );
}

function parseAuditQueryStdout(stdout, cliPath) {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    fail(
      'E_AUDIT_QUERY_UNAVAILABLE',
      'audit query CLI emitted empty stdout.',
      { cliPath, stdout }
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    fail(
      'E_AUDIT_QUERY_UNAVAILABLE',
      `audit query CLI emitted non-JSON stdout: ${error.message}`,
      { cliPath, stdout }
    );
  }
}

function normalizeRows(rows, cliPath) {
  if (!Array.isArray(rows)) {
    fail(
      'E_AUDIT_QUERY_UNAVAILABLE',
      'audit query CLI output rows must be an array.',
      { cliPath }
    );
  }
  return rows.map((row) => {
    if (typeof row?.event_type !== 'string') {
      fail('E_AUDIT_QUERY_UNAVAILABLE', 'audit query row missing event_type.', { cliPath, row });
    }
    if (row.source_component != null && typeof row.source_component !== 'string') {
      fail('E_AUDIT_QUERY_UNAVAILABLE', 'audit query row source_component must be string or null.', { cliPath, row });
    }
    const count = Number(row.count);
    if (!Number.isInteger(count) || count < 0) {
      fail('E_AUDIT_QUERY_UNAVAILABLE', 'audit query row count must be a non-negative integer.', { cliPath, row });
    }
    return {
      event_type: row.event_type,
      source_component: row.source_component ?? null,
      count
    };
  });
}

export async function aggregateGovernanceEvents(projectRoot, { from, to } = {}) {
  const canonicalProjectRoot = resolveProjectRoot(projectRoot);
  const env = process.env;
  const cliPath = defaultAuditQueryCliPath(canonicalProjectRoot, env);
  const stdinPayload = JSON.stringify({
    from,
    to,
    pluginProjectRoot: null
  });

  try {
    await access(cliPath);
  } catch {
    fail(
      'E_AUDIT_QUERY_UNAVAILABLE',
      'Audit query CLI is missing.',
      { cliPath }
    );
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(process.execPath, [cliPath], {
        cwd: path.dirname(path.dirname(path.dirname(cliPath))),
        env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      reject(new AuditQueryError({
        code: 'E_AUDIT_QUERY_UNAVAILABLE',
        message: `Audit query spawn failed: ${error.message}`,
        extra: { cliPath }
      }));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnFailure = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Child may already be closed.
      }
    }, AUDIT_QUERY_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      spawnFailure = error;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(new AuditQueryError({
          code: 'E_AUDIT_QUERY_UNAVAILABLE',
          message: `Audit query CLI timed out after ${AUDIT_QUERY_TIMEOUT_MS} ms.`,
          extra: { cliPath, signal }
        }));
        return;
      }

      if (spawnFailure) {
        reject(new AuditQueryError({
          code: 'E_AUDIT_QUERY_UNAVAILABLE',
          message: `Audit query spawn failed: ${spawnFailure.message}`,
          extra: { cliPath }
        }));
        return;
      }

      let parsed;
      try {
        parsed = parseAuditQueryStdout(stdout, cliPath);
      } catch (error) {
        reject(error);
        return;
      }

      if (exitCode !== 0 || parsed?.ok !== true) {
        reject(new AuditQueryError({
          code: 'E_AUDIT_QUERY_UNAVAILABLE',
          message: parsed?.error ?? `Audit query CLI exited with code ${exitCode}.`,
          extra: { cliPath, exitCode, stderr }
        }));
        return;
      }

      try {
        resolve(normalizeRows(parsed.rows, cliPath));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(stdinPayload);
  });
}

export async function listEdgesByRelation(projectRoot, relation) {
  return readClaimEdges(projectRoot, { relation });
}

export async function buildEvidenceExcerpt(projectRoot, { from, to } = {}) {
  const governanceEventsAggregated = await aggregateGovernanceEvents(projectRoot, { from, to });
  const edgesByRelation = {};
  await Promise.all(EVIDENCE_EDGE_RELATIONS.map(async (relation) => {
    edgesByRelation[relation] = await listEdgesByRelation(projectRoot, relation);
  }));

  const totalEvents = governanceEventsAggregated
    .reduce((total, row) => total + row.count, 0);
  const totalEdges = Object.values(edgesByRelation)
    .reduce((total, edges) => total + edges.length, 0);

  return {
    governance_events_aggregated: governanceEventsAggregated,
    edges_by_relation: edgesByRelation,
    summary: {
      total_events: totalEvents,
      total_edges: totalEdges,
      time_range: { from, to }
    }
  };
}
