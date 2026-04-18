import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CodexCliExecutorError,
  INPUT_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  buildCodexCliExecutor,
  invokeCodexCli,
} from '../../orchestrator/executors/codex-cli.js';

const NODE = process.execPath;

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
});
