import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseExitGateRows,
  validateCloseoutText
} from './validate-closeout-honesty.js';

async function withFixtureRepo(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-closeout-honesty-'));
  try {
    await mkdir(path.join(root, 'evidence'), { recursive: true });
    await writeFile(path.join(root, 'evidence', 'real.json'), '{"latencySeconds":1.2}\n', 'utf8');
    await writeFile(path.join(root, 'evidence', 'null-metrics.json'), '{"resumeLatencySeconds":null}\n', 'utf8');
    await writeFile(path.join(root, 'evidence', 'pass-stamp.json'), '{"attemptLifecycleCompleteness":true,"snapshotPublishSuccess":true}\n', 'utf8');
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function closeoutWithRows(rows, tail = '') {
  return `# Synthetic Closeout

| # | Gate | Result | Evidence |
|---|------|--------|----------|
${rows.join('\n')}

${tail}
`;
}

test('closeout-honesty parser extracts exit gate rows', () => {
  const rows = parseExitGateRows(closeoutWithRows([
    '| 1 | Real evidence | PASS | [real](evidence/real.json) |'
  ]));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].gate, 'Real evidence');
  assert.equal(rows[0].result, 'PASS');
});

test('closeout-honesty accepts PASS with real linked evidence', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(['| 1 | Real evidence | PASS | [real](evidence/real.json) |']),
      { repoRoot: root }
    );

    assert.deepEqual(violations, []);
  });
});

test('closeout-honesty rejects documentation-only verification', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase1-closeout.md',
      closeoutWithRows(['| 17 | verified against documentation | PASS | [real](evidence/real.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /documentation-only/u);
  });
});

test('closeout-honesty rejects null metrics behind implementation-complete claims', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase3-closeout.md',
      closeoutWithRows(['| 3 | implementation-complete with saved evidence | PASS | [metrics](evidence/null-metrics.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /null metrics/u);
  });
});

test('closeout-honesty rejects all-saved claims backed only by pass-stamp booleans', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase3-closeout.md',
      closeoutWithRows(['| 4 | all saved evidence is present | PASS | [stamp](evidence/pass-stamp.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /pass-stamp/u);
  });
});

test('closeout-honesty rejects duplicate evidence links', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(['| 1 | Real evidence | PASS | [a](evidence/real.json), [b](evidence/real.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /duplicate links/u);
  });
});

test('closeout-honesty requires follow-up ids for partial and deferred rows', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(['| 1 | Some work remains | PARTIAL | [real](evidence/real.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /FU-\*/u);
  });
});

test('closeout-honesty accepts partial rows with declared follow-up ids', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(
        ['| 1 | Some work remains | PARTIAL | [FU-001](evidence/real.json) |'],
        '## Declared Follow-Up\n\n- FU-001: Finish the remaining check.\n'
      ),
      { repoRoot: root }
    );

    assert.deepEqual(violations, []);
  });
});

test('closeout-honesty requires false-positive retraction prose with evidence', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(['| 1 | Gate claim was wrong | FALSE-POSITIVE | [real](evidence/real.json) |']),
      { repoRoot: root }
    );

    assert.match(violations.join('\n'), /retraction/u);
  });
});

test('closeout-honesty accepts false-positive rows with nearby retraction prose', async () => {
  await withFixtureRepo(async (root) => {
    const violations = await validateCloseoutText(
      'phase55-closeout.md',
      closeoutWithRows(
        ['| 1 | Gate claim was wrong | FALSE-POSITIVE | [real](evidence/real.json) |'],
        'Retraction: this false-positive is disproved by [real](evidence/real.json).\n'
      ),
      { repoRoot: root }
    );

    assert.deepEqual(violations, []);
  });
});
