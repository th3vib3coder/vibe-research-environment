import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { DISPATCH_TABLE, IMPLEMENTED_PHASE9_COMMANDS } from '../../../bin/vre';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from './_fixture.js';

const HANDSHAKE_ARTIFACT_PATH = '.vibe-science-environment/control/capability-handshake.json';
const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling'
  )
};

const STUB_CASES = [
  { argv: ['capabilities', 'doctor'], command: 'capabilities doctor' }
];

async function createExternalProject(runtimeRoot, {
  vreHome = runtimeRoot,
  kernelPath = path.join(runtimeRoot, 'environment', 'tests', 'fixtures', 'fake-kernel-sibling')
} = {}) {
  const externalRoot = `${runtimeRoot}-external`;
  await mkdir(externalRoot, { recursive: true });
  await writeFile(
    path.join(externalRoot, 'package.json'),
    `${JSON.stringify({
      name: 'epigenetic-test-cli-fixture',
      private: true,
      type: 'module'
    }, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(externalRoot, '.vre-project.json'),
    `${JSON.stringify({
      schemaVersion: 'vre.external-project.v1',
      vreHome,
      kernelPath,
      objectiveId: 'OBJ-CLI-EXTERNAL'
    }, null, 2)}\n`,
    'utf8'
  );
  await mkdir(path.join(externalRoot, 'bin'), { recursive: true });
  await writeFile(
    path.join(externalRoot, 'bin', 'vre'),
    'throw new Error("PROJECT_BIN_SHOULD_NOT_LOAD");\n',
    'utf8'
  );
  return externalRoot;
}

async function createVreShapedFakeRuntime(root) {
  await mkdir(path.join(root, 'environment', 'schemas'), { recursive: true });
  await mkdir(path.join(root, 'bin'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({
      name: 'vibe-research-environment',
      private: true,
      type: 'module'
    }, null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    path.join(root, 'environment', 'schemas', 'phase9-capability-handshake.schema.json'),
    '{}\n',
    'utf8'
  );
  await writeFile(
    path.join(root, 'bin', 'vre'),
    'throw new Error("FAKE_RUNTIME_SHOULD_NOT_LOAD");\n',
    'utf8'
  );
}

test('Phase 9 CLI stubs are invokable and emit structured JSON instead of unknown-command failures', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-stubs-');
  try {
    for (const stubCase of STUB_CASES) {
      const result = await runVre(projectRoot, stubCase.argv);
      assert.equal(result.code, 0, `${stubCase.command} stderr=${result.stderr}`);
      assert.equal(result.stderr, '', `${stubCase.command} should keep stderr quiet while still stubbed`);

      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.code, 'PHASE9_NOT_IMPLEMENTED');
      assert.equal(payload.command, stubCase.command);
      assert.equal(payload.phase9, true);
      assert.equal(payload.status, 'stub');

      for (const [key, expected] of Object.entries(stubCase.optionChecks ?? {})) {
        assert.deepEqual(payload.argv.options[key], expected, `${stubCase.command} should parse option ${key}`);
      }
    }
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json emits JSON only and atomically rewrites the handshake artifact with the same bytes', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-json-');
  const artifactPath = path.join(projectRoot, HANDSHAKE_ARTIFACT_PATH);
  try {
    const result = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schemaVersion, 'phase9.capability-handshake.v1');
    assert.equal(payload.vrePresent, true);

    const artifactBytes = await readFile(artifactPath, 'utf8');
    assert.equal(artifactBytes, result.stdout);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json runs from a marked external project and persists state there', async () => {
  const runtimeRoot = await createCliFixtureProject('vre-phase9-external-runtime-');
  const externalRoot = await createExternalProject(runtimeRoot);
  const artifactPath = path.join(externalRoot, HANDSHAKE_ARTIFACT_PATH);
  try {
    const result = await runVre(runtimeRoot, ['capabilities', '--json'], {
      cwd: externalRoot
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.vrePresent, true);
    assert.equal(payload.vreMode, 'external-project');
    assert.equal(payload.projectRoot, externalRoot);
    assert.equal(payload.runtimeRoot, runtimeRoot);
    assert.equal(payload.vrePath, runtimeRoot);
    assert.equal(payload.vre.executableCommands.includes('capabilities --json'), true);
    assert.equal(
      payload.degradedReasons.some((reason) => reason.includes('PROJECT_BIN_SHOULD_NOT_LOAD')),
      false
    );

    const artifactBytes = await readFile(artifactPath, 'utf8');
    assert.equal(artifactBytes, result.stdout);
  } finally {
    await cleanupCliFixtureProject(runtimeRoot);
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test('capabilities --json reports an invalid external-project marker without opening runtime', async () => {
  const runtimeRoot = await createCliFixtureProject('vre-phase9-external-invalid-runtime-');
  const externalRoot = await createExternalProject(runtimeRoot, {
    vreHome: './not-a-vre-runtime'
  });
  try {
    const result = await runVre(runtimeRoot, ['capabilities', '--json'], {
      cwd: externalRoot
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.vrePresent, false);
    assert.equal(payload.vreMode, 'missing');
    assert.equal(payload.runtimeRoot, null);
    assert.equal(
      payload.degradedReasons.some((reason) =>
        reason.startsWith('VRE_EXTERNAL_PROJECT_INVALID: vreHome does not validate as a VRE repo')
      ),
      true
    );
  } finally {
    await cleanupCliFixtureProject(runtimeRoot);
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test('capabilities --json rejects an external-project marker that points at a fake VRE-shaped runtime', async () => {
  const runtimeRoot = await createCliFixtureProject('vre-phase9-external-fake-runtime-');
  const externalRoot = await createExternalProject(runtimeRoot, {
    vreHome: './fake-vre-home'
  });
  try {
    await createVreShapedFakeRuntime(path.join(externalRoot, 'fake-vre-home'));

    const result = await runVre(runtimeRoot, ['capabilities', '--json'], {
      cwd: externalRoot
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr.includes('FAKE_RUNTIME_SHOULD_NOT_LOAD'), false);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.vrePresent, false);
    assert.equal(payload.vreMode, 'missing');
    assert.equal(payload.runtimeRoot, null);
    assert.equal(
      payload.degradedReasons.some((reason) =>
        reason.startsWith('VRE_EXTERNAL_PROJECT_INVALID: vreHome does not match the trusted VRE runtime root')
      ),
      true
    );
  } finally {
    await cleanupCliFixtureProject(runtimeRoot);
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test('capabilities --json rewrites stale artifact content instead of leaving old bytes behind', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-rewrite-');
  const artifactPath = path.join(projectRoot, HANDSHAKE_ARTIFACT_PATH);
  try {
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, 'STALE-HANDSHAKE-CONTENT\n', 'utf8');

    const first = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(first.code, 0, `stderr=${first.stderr}`);
    assert.equal(await readFile(artifactPath, 'utf8'), first.stdout);

    await writeFile(artifactPath, 'STALE-CONTENT-SHOULD-DISAPPEAR\n', 'utf8');

    const second = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(second.code, 0, `stderr=${second.stderr}`);

    const artifactBytes = await readFile(artifactPath, 'utf8');
    assert.equal(artifactBytes, second.stdout);
    assert.doesNotMatch(artifactBytes, /STALE-CONTENT-SHOULD-DISAPPEAR/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities --json reports only commands that are actually wired in bin/vre', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-truth-');
  try {
    const result = await runVre(projectRoot, ['capabilities', '--json'], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.deepEqual(
      payload.vre.executableCommands,
      [...new Set([...Object.keys(DISPATCH_TABLE), ...IMPLEMENTED_PHASE9_COMMANDS])].sort()
    );
    assert.equal(payload.vre.executableCommands.includes('capabilities --json'), true);
    assert.equal(payload.vre.executableCommands.includes('objective start'), true);
    assert.equal(payload.vre.executableCommands.includes('objective doctor'), true);
    assert.equal(payload.vre.executableCommands.includes('objective pause'), true);
    assert.equal(payload.vre.executableCommands.includes('objective resume'), true);
    assert.equal(payload.vre.executableCommands.includes('objective status'), true);
    assert.equal(payload.vre.executableCommands.includes('objective stop'), true);
    assert.equal(payload.vre.executableCommands.includes('research-loop'), true);
    assert.equal(payload.vre.executableCommands.includes('run-analysis'), true);
    assert.equal(payload.vre.executableCommands.includes('scheduler install'), true);
    assert.equal(payload.vre.executableCommands.includes('scheduler status'), true);
    assert.equal(payload.vre.executableCommands.includes('scheduler doctor'), true);
    assert.equal(payload.vre.executableCommands.includes('scheduler remove'), true);
    assert.equal(payload.vre.executableCommands.includes('weekly-digest'), false);
    assert.equal(payload.vre.markdownOnlyContracts.includes('weekly-digest'), true);
    assert.equal(payload.vre.missingSurfaces.includes('capabilities --json'), false);
    assert.equal(payload.vre.missingSurfaces.includes('research-loop'), false);
    assert.equal(payload.vre.missingSurfaces.includes('scheduler runtime'), false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 parser still carries long options through to the remaining doctor stub', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-args-');
  try {
    const result = await runVre(projectRoot, [
      'capabilities',
      'doctor',
      '--fresh-window-seconds=600',
      '--allow-degraded=true'
    ]);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.doesNotMatch(result.stderr, /unexpected arguments/u);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, 'capabilities doctor');
    assert.equal(payload.argv.options['fresh-window-seconds'], '600');
    assert.equal(payload.argv.options['allow-degraded'], 'true');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 capability root fails closed when --json or doctor is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-cap-usage-');
  try {
    const result = await runVre(projectRoot, ['capabilities']);
    assert.equal(result.code, 3);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.expected, /--json/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('Phase 9 objective start rejects reviewed-api reasoning mode in v1', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase9-reasoning-mode-');
  try {
    const result = await runVre(projectRoot, [
      'objective',
      'start',
      '--title',
      'demo',
      '--question',
      'why-now',
      '--reasoning-mode',
      'reviewed-api'
    ]);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_REASONING_MODE_UNSUPPORTED');
    assert.equal(payload.command, 'objective start');
    assert.equal(payload.phase9, true);
    assert.equal(payload.requested, 'reviewed-api');
    assert.deepEqual(payload.supported, ['rule-only']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
