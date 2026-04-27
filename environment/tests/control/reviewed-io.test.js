import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ReviewedIOError, createReviewedIO } from '../../orchestrator/reviewed-io.js';

async function expectIoError(thunk, code) {
  try {
    await thunk();
    assert.fail(`expected ReviewedIOError ${code} but call returned`);
  } catch (error) {
    if (!(error instanceof ReviewedIOError)) {
      throw error;
    }
    assert.equal(error.code, code, `expected error.code ${code}, got ${error.code}`);
    return error;
  }
}

test('createReviewedIO requires at least one allowed root', async () => {
  await expectIoError(
    () => createReviewedIO({}),
    'E_REVIEWED_IO_USAGE',
  );
});

test('createReviewedIO canonicalizes the workspace root via realpath', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-ws-')));
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    assert.equal(io.canonicalRoots.length, 1);
    assert.equal(io.canonicalRoots[0], tempWorkspace);
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('writeFile accepts a target inside the workspace closure', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-write-ok-')));
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    const targetPath = path.join(tempWorkspace, 'inside.txt');
    await io.writeFile(targetPath, 'inside-closure', 'utf8');
    const content = await readFile(targetPath, 'utf8');
    assert.equal(content, 'inside-closure');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('writeFile rejects a target outside the workspace closure with E_WORKSPACE_WRITE_ESCAPE', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-write-out-')));
  const otherDir = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-other-')));
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    await expectIoError(
      () => io.writeFile(path.join(otherDir, 'outside.txt'), 'leak', 'utf8'),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(otherDir, { recursive: true, force: true });
  }
});

test('writeFile rejects a path that lexically looks inside but canonicalizes outside via symlink', async () => {
  const tempReal = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-real-')));
  const tempLinkParent = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-link-parent-')));
  const linkPath = path.join(tempLinkParent, 'workspace-symlink');
  try {
    await symlink(tempReal, linkPath, 'junction');
    // workspaceRoot is the symlink path: real workspace = tempReal
    // outside-target is tempLinkParent/escape.txt — inside tempLinkParent
    // (lexically a sibling of workspace-symlink), but tempLinkParent is
    // OUTSIDE tempReal.
    const io = await createReviewedIO({ workspaceRoot: linkPath });
    await expectIoError(
      () => io.writeFile(path.join(tempLinkParent, 'escape.txt'), 'leak', 'utf8'),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
  } finally {
    await rm(tempReal, { recursive: true, force: true });
    await rm(tempLinkParent, { recursive: true, force: true });
  }
});

test('writeFile honors scratchRoot as an additional allowed root', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-ws2-')));
  const tempScratch = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-scratch-')));
  try {
    const io = await createReviewedIO({
      workspaceRoot: tempWorkspace,
      scratchRoot: tempScratch,
    });
    assert.equal(io.canonicalRoots.length, 2);
    await io.writeFile(path.join(tempScratch, 'scratch.txt'), 'scratch-data', 'utf8');
    const content = await readFile(path.join(tempScratch, 'scratch.txt'), 'utf8');
    assert.equal(content, 'scratch-data');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(tempScratch, { recursive: true, force: true });
  }
});

test('writeFile honors objectiveArtifactsRoot as an additional allowed root', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-ws3-')));
  const tempObjective = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-obj-')));
  try {
    const io = await createReviewedIO({
      workspaceRoot: tempWorkspace,
      objectiveArtifactsRoot: tempObjective,
    });
    assert.equal(io.canonicalRoots.length, 2);
    await io.writeFile(path.join(tempObjective, 'artifact.json'), '{"k":1}', 'utf8');
    const content = await readFile(path.join(tempObjective, 'artifact.json'), 'utf8');
    assert.equal(content, '{"k":1}');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(tempObjective, { recursive: true, force: true });
  }
});

test('appendFile, mkdir, and rm are all gated by the closure', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-all-')));
  const otherDir = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-out-')));
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    // Inside passes for all three
    await io.mkdir(path.join(tempWorkspace, 'subdir'), { recursive: true });
    await io.writeFile(path.join(tempWorkspace, 'subdir', 'a.txt'), 'one\n', 'utf8');
    await io.appendFile(path.join(tempWorkspace, 'subdir', 'a.txt'), 'two\n', 'utf8');
    const content = await readFile(path.join(tempWorkspace, 'subdir', 'a.txt'), 'utf8');
    assert.equal(content, 'one\ntwo\n');
    await io.rm(path.join(tempWorkspace, 'subdir'), { recursive: true, force: true });

    // Outside fails for all three
    await expectIoError(
      () => io.appendFile(path.join(otherDir, 'leak.txt'), 'leak', 'utf8'),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
    await expectIoError(
      () => io.mkdir(path.join(otherDir, 'leak-dir'), { recursive: true }),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
    await expectIoError(
      () => io.rm(path.join(otherDir, 'something'), { force: true }),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
    await rm(otherDir, { recursive: true, force: true });
  }
});

test('assertInsideClosure rejects empty or non-string targets', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-empty-')));
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    await expectIoError(() => io.assertInsideClosure(''), 'E_WORKSPACE_WRITE_ESCAPE');
    await expectIoError(() => io.assertInsideClosure(null), 'E_WORKSPACE_WRITE_ESCAPE');
    await expectIoError(() => io.assertInsideClosure(123), 'E_WORKSPACE_WRITE_ESCAPE');
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});

test('createReviewedIO fails closed when an allowed root cannot be canonicalized', async () => {
  await expectIoError(
    () => createReviewedIO({ workspaceRoot: '/path/that/definitely/does/not/exist/EVER-T455' }),
    'E_REVIEWED_IO_ROOT_INVALID',
  );
});

test('writeFile against a path whose parent does not exist fails-closed via the closure check or the underlying writeFile', async () => {
  const tempWorkspace = await realpath(await mkdtemp(path.join(tmpdir(), 'reviewed-io-noparent-')));
  const otherParent = path.join(tempWorkspace, '..', 'no-such-parent-T455');
  try {
    const io = await createReviewedIO({ workspaceRoot: tempWorkspace });
    // Path canonicalizes outside the workspace root → closure escape
    await expectIoError(
      () => io.writeFile(path.join(otherParent, 'x.txt'), 'data', 'utf8'),
      'E_WORKSPACE_WRITE_ESCAPE',
    );
  } finally {
    await rm(tempWorkspace, { recursive: true, force: true });
  }
});
