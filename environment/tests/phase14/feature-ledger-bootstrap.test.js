import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const ledgerPath = path.join(repoRoot, 'phase9-vre-feature-ledger.md');
const indexPath = path.join(repoRoot, 'phase9-vre-feature-ledger-index.md');

function tableRows(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| '))
    .filter((line) => !line.startsWith('|---'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
}

function parseLedgerRows() {
  return tableRows(fs.readFileSync(ledgerPath, 'utf8'))
    .filter((cells) => /^\d+$/.test(cells[0]))
    .map((cells) => ({
      seq: Number(cells[0]),
      date: cells[1],
      wave: cells[2],
      featureId: cells[3],
      surface: cells[4],
      paths: cells[5],
      flags: cells[6],
      tests: cells[7],
      status: cells[8],
      notes: cells[9],
    }));
}

function parseIndexRows() {
  return tableRows(fs.readFileSync(indexPath, 'utf8'))
    .filter((cells) => cells[0]?.startsWith('`phase'))
    .map((cells) => ({
      file: cells[0].replace(/^`|`$/g, ''),
      status: cells[1],
      seqRange: cells[2],
      opened: cells[3],
      closed: cells[4],
      notes: cells[5],
    }));
}

test('Phase 14 bootstrap row is present in the active VRE feature ledger', () => {
  const rows = parseLedgerRows();
  const bootstrapRows = rows.filter((row) => row.featureId === 'PH14-TRACKING-BOOTSTRAP');

  assert.equal(bootstrapRows.length, 1, 'expected exactly one Phase 14 bootstrap row');

  const row = bootstrapRows[0];
  const maxSeq = Math.max(...rows.map((candidate) => candidate.seq));
  assert.equal(row.seq, 195, 'bootstrap row keeps its original monotonic seq');
  assert.ok(maxSeq >= row.seq, 'later Phase 14 rows may append after bootstrap');
  assert.equal(row.wave, 'W14-TRACKING-BOOTSTRAP');
  assert.equal(row.surface, 'ledger');
  assert.equal(row.status, 'implemented');
  assert.notEqual(row.status, 'verified');

  for (const requiredPath of [
    'phase9-vre-feature-ledger.md',
    'phase9-vre-feature-ledger-index.md',
    'environment/tests/phase14/feature-ledger-bootstrap.test.js',
    'phase14-world-class-status-ledger.md',
  ]) {
    assert.match(row.paths, new RegExp(requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(row.tests, /feature-ledger-bootstrap\.test\.js/);
  assert.match(row.notes, /T14\.1\.1/);
  assert.match(row.notes, /named wave column/i);
  assert.match(row.notes, /anti-dup verified/i);
  assert.match(row.notes, /tier-C: noop/i);
  assert.match(row.notes, /CI-executed/i);
  assert.match(row.notes, /count enforcement is deferred to W14-GATE-REGISTRY/i);
});

test('Feature ledger index keeps exactly one active file and names Phase 14 lane', () => {
  const activeRows = parseIndexRows().filter((row) => row.status === 'active');

  assert.equal(activeRows.length, 1, 'expected exactly one active feature ledger file');
  assert.equal(activeRows[0].file, 'phase9-vre-feature-ledger.md');
  assert.match(activeRows[0].notes, /Phase 14/i);
  assert.match(activeRows[0].notes, /PH14-TRACKING-BOOTSTRAP/);
});
