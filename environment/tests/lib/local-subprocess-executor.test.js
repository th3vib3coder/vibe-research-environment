import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  invokeLocalSubprocess,
  LocalSubprocessError,
} from '../../orchestrator/executors/local-subprocess.js';

const NODE = process.execPath;

describe('WP-130 local-subprocess executor', () => {
  it('round-trips a JSON envelope through node -e', async () => {
    const script = [
      "let data='';",
      "process.stdin.on('data',c=>{data+=c;});",
      "process.stdin.on('end',()=>{",
      "  const parsed=JSON.parse(data);",
      "  process.stdout.write(JSON.stringify({schemaVersion:'vibe-orch.local-subprocess.output.v1',echo:parsed}));",
      "});",
    ].join('');

    const result = await invokeLocalSubprocess({
      command: NODE,
      args: ['-e', script],
      stdinPayload: { verdict: 'affirmed', refs: ['a', 'b'] },
      timeoutMs: 10_000,
    });

    assert.equal(result.schemaVersion, 'vibe-orch.local-subprocess.output.v1');
    assert.deepEqual(result.echo.refs, ['a', 'b']);
    assert.equal(result.echo.schemaVersion, 'vibe-orch.local-subprocess.input.v1');
  });

  it('maps ENOENT on missing binary to dependency-unavailable', async () => {
    await assert.rejects(
      () => invokeLocalSubprocess({
        command: '__no_such_binary_xyz__',
        args: [],
        timeoutMs: 5_000,
      }),
      (error) => {
        assert.ok(error instanceof LocalSubprocessError);
        assert.equal(error.code, 'dependency-unavailable');
        return true;
      },
    );
  });

  it('maps nonzero exit code to tool-failure with exitCode captured', async () => {
    await assert.rejects(
      () => invokeLocalSubprocess({
        command: NODE,
        args: ['-e', 'process.exit(3)'],
        timeoutMs: 10_000,
      }),
      (error) => {
        assert.ok(error instanceof LocalSubprocessError);
        assert.equal(error.code, 'tool-failure');
        assert.equal(error.exitCode, 3);
        return true;
      },
    );
  });

  it('maps malformed stdout to contract-mismatch', async () => {
    await assert.rejects(
      () => invokeLocalSubprocess({
        command: NODE,
        args: ['-e', "process.stdout.write('not json')"],
        timeoutMs: 10_000,
      }),
      (error) => {
        assert.ok(error instanceof LocalSubprocessError);
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('enforces output schemaVersion check (contract-mismatch when mismatched)', async () => {
    const script = [
      "let data='';",
      "process.stdin.on('data',c=>{data+=c;});",
      "process.stdin.on('end',()=>{",
      "  process.stdout.write(JSON.stringify({schemaVersion:'wrong-version',verdict:'x'}));",
      "});",
    ].join('');

    await assert.rejects(
      () => invokeLocalSubprocess({
        command: NODE,
        args: ['-e', script],
        timeoutMs: 10_000,
      }),
      (error) => {
        assert.equal(error.code, 'contract-mismatch');
        return true;
      },
    );
  });

  it('rejects output without schemaVersion (contract-mismatch when missing)', async () => {
    const script = "process.stdout.write(JSON.stringify({verdict:'ok'}));";

    await assert.rejects(
      () => invokeLocalSubprocess({
        command: NODE,
        args: ['-e', script],
        timeoutMs: 10_000,
      }),
      (error) => {
        assert.equal(error.code, 'contract-mismatch');
        assert.match(error.message, /missing/u);
        return true;
      },
    );
  });

  it('only forwards whitelisted env vars; credentials are excluded by default', async () => {
    const script = [
      "const out={schemaVersion:'vibe-orch.local-subprocess.output.v1',",
      "  seenSecret: process.env.OPENAI_API_KEY ?? null,",
      "  seenPath: process.env.PATH != null };",
      "process.stdout.write(JSON.stringify(out));",
    ].join('');

    const result = await invokeLocalSubprocess({
      command: NODE,
      args: ['-e', script],
      stdinPayload: {},
      timeoutMs: 10_000,
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        OPENAI_API_KEY: 'sekret-test-key',
      },
    });

    assert.equal(result.seenSecret, null);
    assert.equal(result.seenPath, true);
  });

  it('allows explicit envPassthrough to forward a named var', async () => {
    const script = [
      "const out={schemaVersion:'vibe-orch.local-subprocess.output.v1',",
      "  forwarded: process.env.VRE_CODEX_CLI ?? null};",
      "process.stdout.write(JSON.stringify(out));",
    ].join('');

    const result = await invokeLocalSubprocess({
      command: NODE,
      args: ['-e', script],
      envPassthrough: ['VRE_CODEX_CLI'],
      overrideEnv: {
        PATH: process.env.PATH ?? '',
        VRE_CODEX_CLI: '/opt/bin/codex',
      },
      timeoutMs: 10_000,
    });

    assert.equal(result.forwarded, '/opt/bin/codex');
  });

  it('enforces a timeout and kills with SIGTERM then SIGKILL', async () => {
    const script = "setInterval(()=>{},1000)"; // hangs forever
    await assert.rejects(
      () => invokeLocalSubprocess({
        command: NODE,
        args: ['-e', script],
        timeoutMs: 200,
      }),
      (error) => {
        assert.ok(error instanceof LocalSubprocessError);
        assert.equal(error.code, 'tool-failure');
        assert.ok(['sigterm', 'sigkill'].includes(error.timeoutPhase));
        return true;
      },
    );
  });
});
