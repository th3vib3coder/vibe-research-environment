import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CodexCliExecutorError,
  INPUT_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  buildCodexCliExecutor,
  invokeRealCodexCli,
  invokeCodexCli,
} from '../../orchestrator/executors/codex-cli.js';

const NODE = process.execPath;

async function createFakeRealCodexCli() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vre-fake-real-codex-'));
  const jsPath = path.join(dir, 'fake-codex.js');
  const js = [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    "const outIndex = process.argv.indexOf('--output-last-message');",
    "const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;",
    "let prompt = '';",
    "process.stdin.on('data', (chunk) => { prompt += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  if (!outPath) { process.stderr.write('missing --output-last-message'); process.exit(3); return; }",
    "  writeFileSync(outPath, JSON.stringify({",
    `    schemaVersion: '${OUTPUT_SCHEMA_VERSION}',`,
    "    verdict: 'affirmed',",
    "    materialMismatch: false,",
    "    summary: `cwd=${process.cwd()}` ,",
    "    followUpAction: 'none',",
    "    evidenceRefs: ['artifact.json'],",
    "    promptIncludedProjectRoot: prompt.includes('Project root (absolute):')",
    "  }));",
    "});",
    "",
  ].join('\n');
  await writeFile(jsPath, js, 'utf8');
  await chmod(jsPath, 0o755);

  if (process.platform !== 'win32') {
    return { dir, command: jsPath };
  }

  const cmdPath = path.join(dir, 'fake-codex.cmd');
  await writeFile(
    cmdPath,
    ['@echo off', `node "%~dp0fake-codex.js" %*`, ''].join('\r\n'),
    'utf8',
  );
  return { dir, command: cmdPath };
}

// Fake Codex CLI implemented via `node -e` scripts. Stdin is the WP-151
// input envelope; stdout must be the WP-151 output envelope.

describe('WP-160 codex-cli executor', () => {
  it('serializes the input envelope and round-trips an output envelope', async () => {
    const script = [
      "let data='';",
      "process.stdin.on('data',c=>{data+=c;});",
      "process.stdin.on('end',()=>{",
      "  const parsed=JSON.parse(data);",
      "  process.stdout.write(JSON.stringify({",
      `    schemaVersion:'${OUTPUT_SCHEMA_VERSION}',`,
      "    verdict:'affirmed',",
      "    materialMismatch:false,",
      "    summary:'ok',",
      "    followUpAction:'none',",
      "    evidenceRefs:['x'],",
      "    receivedSchema:parsed.schemaVersion,",
      "    receivedTask:parsed.task,",
      "  }));",
      "});",
    ].join('');

    const result = await invokeCodexCli({
      stdinPayload: {
        task: { taskKind: 'session-digest-review', taskId: 'ORCH-TASK-TEST' },
        comparedArtifactRefs: ['a.json'],
      },
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CODEX_CLI: NODE,
      },
      args: ['-e', script],
    });

    assert.equal(result.schemaVersion, OUTPUT_SCHEMA_VERSION);
    assert.equal(result.verdict, 'affirmed');
    assert.equal(result.receivedSchema, INPUT_SCHEMA_VERSION);
    assert.equal(result.receivedTask.taskKind, 'session-digest-review');
  });

  it('fails closed with dependency-unavailable when VRE_CODEX_CLI is unset', async () => {
    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 5_000,
        overrideEnv: { PATH: process.env.PATH ?? '' }, // VRE_CODEX_CLI absent
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'dependency-unavailable');
        assert.equal(error.providerRef, 'openai/codex');
        assert.equal(error.integrationKind, 'provider-cli');
        return true;
      },
    );
  });

  it('fails closed with contract-mismatch when VRE_CODEX_CLI is a shell command string', async () => {
    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 5_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: 'codex exec --json -',
        },
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('maps nonzero exit code to tool-failure with exitCode captured', async () => {
    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: NODE,
        },
        args: ['-e', 'process.exit(7)'],
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'tool-failure');
        assert.equal(error.exitCode, 7);
        return true;
      },
    );
  });

  it('maps non-JSON stdout to contract-mismatch', async () => {
    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: NODE,
        },
        args: ['-e', "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{process.stdout.write('not json')});"],
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('maps schemaVersion mismatch to contract-mismatch', async () => {
    const script = [
      "let d='';process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      "  process.stdout.write(JSON.stringify({schemaVersion:'wrong-version',verdict:'affirmed'}));",
      "});",
    ].join('');

    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: NODE,
        },
        args: ['-e', script],
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('only forwards whitelisted env vars; unknown secrets are excluded', async () => {
    const script = [
      "let d='';process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      "  process.stdout.write(JSON.stringify({",
      `    schemaVersion:'${OUTPUT_SCHEMA_VERSION}',`,
      "    verdict:'affirmed',",
      "    materialMismatch:false,",
      "    summary:'ok',",
      "    followUpAction:'none',",
      "    evidenceRefs:[],",
      "    sawOpenAi: process.env.OPENAI_API_KEY ?? null,",
      "    sawAnthropic: process.env.ANTHROPIC_API_KEY ?? null,",
      "    sawRandom: process.env.VRE_PRIVATE_TOKEN ?? null,",
      "    sawPath: process.env.PATH != null",
      "  }));",
      "});",
    ].join('');

    const result = await invokeCodexCli({
      stdinPayload: {},
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CODEX_CLI: NODE,
        OPENAI_API_KEY: 'openai-test',
        ANTHROPIC_API_KEY: 'anthropic-test',
        VRE_PRIVATE_TOKEN: 'should-not-pass',
      },
      args: ['-e', script],
    });

    // Codex whitelist includes OPENAI_API_KEY + ANTHROPIC_API_KEY (WP-160).
    assert.equal(result.sawOpenAi, 'openai-test');
    assert.equal(result.sawAnthropic, 'anthropic-test');
    // Anything outside the whitelist must be stripped.
    assert.equal(result.sawRandom, null);
    assert.equal(result.sawPath, true);
  });

  it('times out with SIGTERM (then SIGKILL) when the CLI hangs', async () => {
    await assert.rejects(
      () => invokeCodexCli({
        stdinPayload: {},
        timeoutMs: 200,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: NODE,
        },
        args: ['-e', 'setInterval(()=>{},1000)'],
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'tool-failure');
        assert.ok(['sigterm', 'sigkill'].includes(error.timeoutPhase));
        return true;
      },
    );
  });

  it('buildCodexCliExecutor returns an executor compatible with invokeLaneBinding', async () => {
    const script = [
      "let d='';process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      "  process.stdout.write(JSON.stringify({",
      `    schemaVersion:'${OUTPUT_SCHEMA_VERSION}',`,
      "    verdict:'affirmed',",
      "    materialMismatch:false,",
      "    summary:'factory ok',",
      "    followUpAction:'none',",
      "    evidenceRefs:[]",
      "  }));",
      "});",
    ].join('');

    const executor = buildCodexCliExecutor({
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CODEX_CLI: NODE,
      },
      args: ['-e', script],
    });

    const result = await executor({ task: {}, comparedArtifactRefs: [] }, {
      integrationKind: 'provider-cli',
      providerRef: 'openai/codex',
    });
    assert.equal(result.verdict, 'affirmed');
    assert.equal(result.summary, 'factory ok');
  });

  it('real Codex adapter rejects calls without stdinPayload.projectPath', async () => {
    await assert.rejects(
      () => invokeRealCodexCli({
        stdinPayload: { task: { taskKind: 'session-digest-review' } },
        timeoutMs: 5_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: NODE,
        },
      }),
      (error) => {
        assert.ok(error instanceof CodexCliExecutorError);
        assert.equal(error.code, 'contract-mismatch');
        assert.match(error.message, /projectPath/u);
        return true;
      },
    );
  });

  it('real Codex adapter spawns from stdinPayload.projectPath even when caller cwd differs', async () => {
    const fake = await createFakeRealCodexCli();
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'vre-codex-project-root-'));
    try {
      const result = await invokeRealCodexCli({
        stdinPayload: {
          projectPath: projectRoot,
          task: { taskKind: 'session-digest-review', taskId: 'ORCH-TASK-ROOT' },
          comparedArtifactRefs: ['artifact.json'],
        },
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CODEX_CLI: fake.command,
        },
      });

      assert.equal(result.schemaVersion, OUTPUT_SCHEMA_VERSION);
      assert.equal(path.resolve(result.summary.replace(/^cwd=/u, '')), path.resolve(projectRoot));
      assert.equal(result.promptIncludedProjectRoot, true);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(fake.dir, { recursive: true, force: true });
    }
  });
});
