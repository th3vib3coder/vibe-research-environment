import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  ClaudeCliExecutorError,
  INPUT_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  buildClaudeCliExecutor,
  invokeClaudeCli,
} from '../../orchestrator/executors/claude-cli.js';

const NODE = process.execPath;
const IS_WINDOWS = process.platform === 'win32';

// WP-161 CLI shape is `claude -p <envelopeJson> --output-format json`.
// The wrapper spawns that command directly; we mock Claude by writing a
// small executable that parses those exact argv positions and emits the
// documented `{type:'result', result:'<jsonString>'}` meta-envelope.
//
// Cross-platform executable generation:
//   - Unix: shebang Node script with `chmod +x`.
//   - Windows: `.cmd` wrapper that calls the Node shim script next to it.

let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'vre-claude-cli-test-'));
});

after(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
  }
});

async function writeFakeClaude(name, body) {
  const jsPath = path.join(workDir, `${name}.js`);
  const nodeScript = `#!${NODE}\n${body}`;
  await writeFile(jsPath, nodeScript, 'utf8');
  if (IS_WINDOWS) {
    // On Windows, shebangs are not honored. Emit a .cmd shim that forwards
    // all args to Node + the .js script.
    const cmdPath = path.join(workDir, `${name}.cmd`);
    // %* forwards all args including quoted JSON.
    const cmd = `@echo off\r\n"${NODE}" "${jsPath}" %*\r\n`;
    await writeFile(cmdPath, cmd, 'utf8');
    return cmdPath;
  }
  await chmod(jsPath, 0o755);
  return jsPath;
}

describe('WP-161 claude-cli executor', () => {
  it('unwraps the Claude meta-envelope and re-validates against the WP-151 output schema', async () => {
    // Skip the full argv round-trip on Windows: the `.cmd` shim goes
    // through cmd.exe which mangles JSON quoting. Error-path tests below
    // still cover the wrapper on Windows; the integration test covers
    // the real invocation shape via `providerExecutors` stubs.
    if (IS_WINDOWS) {
      return;
    }
    const body = [
      "const argv = process.argv.slice(2);",
      "const flagIndex = argv.indexOf('-p');",
      "const envelope = JSON.parse(argv[flagIndex + 1]);",
      "const inner = {",
      `  schemaVersion: '${OUTPUT_SCHEMA_VERSION}',`,
      "  verdict: 'affirmed',",
      "  materialMismatch: false,",
      "  summary: 'claude ok',",
      "  followUpAction: 'none',",
      "  evidenceRefs: ['e1'],",
      "  receivedInputSchema: envelope.schemaVersion,",
      "};",
      "process.stdout.write(JSON.stringify({type:'result', result: JSON.stringify(inner)}));",
    ].join('\n');
    const binaryPath = await writeFakeClaude('happy', body);

    const result = await invokeClaudeCli({
      stdinPayload: {
        task: { taskKind: 'session-digest-review' },
        comparedArtifactRefs: ['a.json'],
      },
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CLAUDE_CLI: binaryPath,
      },
    });

    assert.equal(result.schemaVersion, OUTPUT_SCHEMA_VERSION);
    assert.equal(result.verdict, 'affirmed');
    assert.equal(result.summary, 'claude ok');
    assert.equal(result.receivedInputSchema, INPUT_SCHEMA_VERSION);
  });

  it('fails closed with dependency-unavailable when VRE_CLAUDE_CLI is unset', async () => {
    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 5_000,
        overrideEnv: { PATH: process.env.PATH ?? '' },
      }),
      (error) => {
        assert.ok(error instanceof ClaudeCliExecutorError);
        assert.equal(error.code, 'dependency-unavailable');
        assert.equal(error.providerRef, 'anthropic/claude');
        return true;
      },
    );
  });

  it('rejects shell command strings in VRE_CLAUDE_CLI', async () => {
    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 5_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: 'claude --profile foo',
        },
      }),
      (error) => {
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('maps non-result type to contract-mismatch', async () => {
    const body = "process.stdout.write(JSON.stringify({type:'assistant', message:'hi'}));";
    const binaryPath = await writeFakeClaude('wrong-type', body);

    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: binaryPath,
        },
      }),
      (error) => {
        assert.ok(error instanceof ClaudeCliExecutorError);
        assert.equal(error.code, 'contract-mismatch');
        assert.match(error.message, /type "assistant"/u);
        return true;
      },
    );
  });

  it('maps non-JSON result string to contract-mismatch (prose drift)', async () => {
    const body = "process.stdout.write(JSON.stringify({type:'result', result:'I refuse to emit JSON'}));";
    const binaryPath = await writeFakeClaude('prose-result', body);

    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: binaryPath,
        },
      }),
      (error) => {
        assert.equal(error.code, 'contract-mismatch');
        assert.match(error.message, /not parseable JSON/u);
        return true;
      },
    );
  });

  it('maps inner schemaVersion drift to contract-mismatch', async () => {
    const body = [
      "const inner = { schemaVersion: 'bad', verdict: 'affirmed' };",
      "process.stdout.write(JSON.stringify({type:'result', result: JSON.stringify(inner)}));",
    ].join('\n');
    const binaryPath = await writeFakeClaude('inner-drift', body);

    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: binaryPath,
        },
      }),
      (error) => {
        assert.equal(error.code, 'contract-mismatch');
        assert.match(error.message, /schemaVersion "bad"/u);
        return true;
      },
    );
  });

  it('maps nonzero exit to tool-failure', async () => {
    const body = 'process.exit(2)';
    const binaryPath = await writeFakeClaude('nonzero', body);

    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 10_000,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: binaryPath,
        },
      }),
      (error) => {
        assert.equal(error.code, 'tool-failure');
        assert.equal(error.exitCode, 2);
        return true;
      },
    );
  });

  it('forwards Claude-whitelist env vars only; Codex vars are excluded', async () => {
    const body = [
      "const inner = {",
      `  schemaVersion: '${OUTPUT_SCHEMA_VERSION}',`,
      "  verdict: 'affirmed',",
      "  materialMismatch: false,",
      "  summary: 'env',",
      "  followUpAction: 'none',",
      "  evidenceRefs: [],",
      "  sawAnthropic: process.env.ANTHROPIC_API_KEY ?? null,",
      "  sawClaudeConfig: process.env.CLAUDE_CONFIG_DIR ?? null,",
      "  sawOpenAi: process.env.OPENAI_API_KEY ?? null,",
      "  sawForeign: process.env.VRE_FOREIGN_SECRET ?? null,",
      "};",
      "process.stdout.write(JSON.stringify({type:'result', result: JSON.stringify(inner)}));",
    ].join('\n');
    const binaryPath = await writeFakeClaude('env-probe', body);

    const result = await invokeClaudeCli({
      stdinPayload: {},
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CLAUDE_CLI: binaryPath,
        ANTHROPIC_API_KEY: 'anthropic-test',
        CLAUDE_CONFIG_DIR: '/tmp/claude-config',
        OPENAI_API_KEY: 'openai-should-not-leak',
        VRE_FOREIGN_SECRET: 'nope',
      },
    });

    assert.equal(result.sawAnthropic, 'anthropic-test');
    assert.equal(result.sawClaudeConfig, '/tmp/claude-config');
    assert.equal(result.sawOpenAi, null);
    assert.equal(result.sawForeign, null);
  });

  it('times out with SIGTERM/SIGKILL when the CLI hangs', async () => {
    // Only run this test on Unix-like systems. On Windows, the `.cmd` shim
    // forks an extra process, which makes timeout assertion racy.
    if (IS_WINDOWS) {
      return;
    }
    const body = 'setInterval(() => {}, 1000);';
    const binaryPath = await writeFakeClaude('hang', body);

    await assert.rejects(
      () => invokeClaudeCli({
        stdinPayload: {},
        timeoutMs: 200,
        overrideEnv: {
          PATH: process.env.PATH ?? '',
          VRE_CLAUDE_CLI: binaryPath,
        },
      }),
      (error) => {
        assert.equal(error.code, 'tool-failure');
        assert.ok(['sigterm', 'sigkill'].includes(error.timeoutPhase));
        return true;
      },
    );
  });

  it('buildClaudeCliExecutor returns an executor compatible with invokeLaneBinding', async () => {
    const body = [
      "const inner = {",
      `  schemaVersion: '${OUTPUT_SCHEMA_VERSION}',`,
      "  verdict: 'affirmed',",
      "  materialMismatch: false,",
      "  summary: 'factory',",
      "  followUpAction: 'none',",
      "  evidenceRefs: [],",
      "};",
      "process.stdout.write(JSON.stringify({type:'result', result: JSON.stringify(inner)}));",
    ].join('\n');
    const binaryPath = await writeFakeClaude('factory', body);

    const executor = buildClaudeCliExecutor({
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CLAUDE_CLI: binaryPath,
      },
    });

    const result = await executor({ task: {}, comparedArtifactRefs: [] }, {
      integrationKind: 'provider-cli',
      providerRef: 'anthropic/claude',
    });
    assert.equal(result.verdict, 'affirmed');
    assert.equal(result.summary, 'factory');
  });
});
