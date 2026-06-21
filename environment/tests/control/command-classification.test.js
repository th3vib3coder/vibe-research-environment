import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  DISPATCH_TABLE,
  IMPLEMENTED_PHASE9_COMMANDS
} from '../../../bin/vre';
import {
  buildCommandClassificationManifest,
  buildLiveCommandClassificationManifest,
  CommandClassificationError,
  COMMAND_CLASSIFICATION_SCHEMA_FILE,
  DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS,
  getLiveExecutableCommands
} from '../../control/command-classification.js';
import { assertValid, loadValidator } from '../../control/_io.js';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function commandSet(manifest) {
  return manifest.records.map((record) => record.command).sort();
}

test('live command classification emits exactly one record for every executable command', async () => {
  const manifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT
  });
  const expectedExecutableCommands = sortedUnique([
    ...Object.keys(DISPATCH_TABLE),
    ...IMPLEMENTED_PHASE9_COMMANDS
  ]);

  assert.equal(manifest.schemaVersion, 'phase14.command-classification.v1');
  assert.equal(manifest.runtimeOpened, false);
  assert.equal(manifest.source.executableCommandCount, 23);
  assert.equal(manifest.source.markdownContractCount, 32);
  assert.equal(manifest.source.reviewedExecutableContractCount, 23);
  assert.equal(manifest.source.markdownOnlyContractCount, 9);
  assert.equal(manifest.records.length, expectedExecutableCommands.length);
  assert.deepEqual(commandSet(manifest), expectedExecutableCommands);
  assert.equal(new Set(commandSet(manifest)).size, 23);

  const reviewed = manifest.records.filter(
    (record) => record.classification === 'reviewed'
  );
  const internal = manifest.records.filter(
    (record) => record.classification === 'internal'
  );
  assert.deepEqual(
    reviewed.map((record) => record.command).sort(),
    expectedExecutableCommands
  );
  assert.equal(internal.length, 0);
  assert.equal(manifest.records.some((record) => record.command === 'weekly-digest'), false);
  for (const record of manifest.records) {
    assert.equal(record.runtimeOpened, false);
    assert.equal(record.reason, null);
  }
});

test('live command classification validates against its schema', async () => {
  const manifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT
  });
  const validate = await loadValidator(
    PROJECT_ROOT,
    COMMAND_CLASSIFICATION_SCHEMA_FILE
  );

  assert.doesNotThrow(() =>
    assertValid(validate, manifest, 'phase14 command classification manifest')
  );
});

test('classifier fails closed for undocumented executable command without explicit classification', () => {
  assert.throws(
    () =>
      buildCommandClassificationManifest({
        executableCommands: ['alpha', 'beta'],
        reviewedContracts: ['alpha'],
        explicitClassifications: {}
      }),
    (error) => {
      assert.ok(error instanceof CommandClassificationError);
      assert.equal(error.code, 'E_UNCLASSIFIED_OPERATOR_COMMAND');
      assert.equal(error.details.commandName, 'beta');
      return true;
    }
  );
});

test('classifier rejects internal and deprecated classifications without a reason', () => {
  assert.throws(
    () =>
      buildCommandClassificationManifest({
        executableCommands: ['alpha'],
        reviewedContracts: [],
        explicitClassifications: {
          alpha: { classification: 'internal', reason: '' }
        }
      }),
    (error) => {
      assert.ok(error instanceof CommandClassificationError);
      assert.equal(error.code, 'E_COMMAND_CLASSIFICATION_REASON_REQUIRED');
      return true;
    }
  );
});

test('classifier rejects reviewed classification without a markdown contract', () => {
  assert.throws(
    () =>
      buildCommandClassificationManifest({
        executableCommands: ['alpha'],
        reviewedContracts: [],
        explicitClassifications: {
          alpha: { classification: 'reviewed', reason: null }
        }
      }),
    (error) => {
      assert.ok(error instanceof CommandClassificationError);
      assert.equal(error.code, 'E_REVIEWED_COMMAND_CONTRACT_MISSING');
      return true;
    }
  );
});

test('classifier rejects contract-bearing commands classified as internal', () => {
  assert.throws(
    () =>
      buildCommandClassificationManifest({
        executableCommands: ['alpha'],
        reviewedContracts: ['alpha'],
        explicitClassifications: {
          alpha: { classification: 'internal', reason: 'wrong surface' }
        }
      }),
    (error) => {
      assert.ok(error instanceof CommandClassificationError);
      assert.equal(error.code, 'E_REVIEWED_COMMAND_CONFLICT');
      return true;
    }
  );
});

test('classifier rejects duplicate executable commands before cardinality can false-green', () => {
  assert.throws(
    () =>
      buildCommandClassificationManifest({
        executableCommands: ['alpha', 'alpha'],
        reviewedContracts: ['alpha'],
        explicitClassifications: {}
      }),
    (error) => {
      assert.ok(error instanceof CommandClassificationError);
      assert.equal(error.code, 'E_DUPLICATE_EXECUTABLE_COMMAND');
      return true;
    }
  );
});

test('classifier allows deprecated commands only with an explicit reason', () => {
  const manifest = buildCommandClassificationManifest({
    executableCommands: ['legacy'],
    reviewedContracts: [],
    explicitClassifications: {
      legacy: {
        classification: 'deprecated',
        reason: 'kept only for old operator transcripts'
      }
    }
  });

  assert.deepEqual(manifest.records, [
    {
      command: 'legacy',
      classification: 'deprecated',
      contractPath: null,
      reason: 'kept only for old operator transcripts',
      runtimeOpened: false
    }
  ]);
});

test('importing command-classification has no CLI execution side effect', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      '-e',
      "import('./environment/control/command-classification.js').then(() => process.stdout.write('import-ok\\n'))"
    ],
    { cwd: PROJECT_ROOT }
  );

  assert.equal(stdout, 'import-ok\n');
  assert.equal(stderr, '');
});

test('default explicit classifications are empty after all live executable commands are reviewed', async () => {
  const manifest = await buildLiveCommandClassificationManifest({
    rootDir: PROJECT_ROOT,
    explicitClassifications: DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS
  });
  const undocumented = manifest.records.filter(
    (record) => record.classification === 'internal'
  );

  assert.equal(Object.keys(DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS).length, 0);
  assert.equal(undocumented.length, 0);
  assert.equal(
    manifest.records.every((record) => record.classification === 'reviewed'),
    true
  );
});

test('getLiveExecutableCommands is derived from bin/vre metadata without hardcoded count', () => {
  assert.deepEqual(
    getLiveExecutableCommands(),
    sortedUnique([...Object.keys(DISPATCH_TABLE), ...IMPLEMENTED_PHASE9_COMMANDS])
  );
});
