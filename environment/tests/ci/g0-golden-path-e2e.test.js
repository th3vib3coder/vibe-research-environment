import assert from 'node:assert/strict';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';

import {
  copyG0EvidenceOnly,
  createG0GoldenPathWorkspace,
  validateG0GoldenPathBundle,
  validateG0StateResume
} from './g0-golden-path-e2e.js';

let baseWorkspace;

async function readJson(projectRoot, relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, ...relativePath.split('/')), 'utf8'));
}

async function writeJson(projectRoot, relativePath, value) {
  const target = path.join(projectRoot, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function mutateJson(projectRoot, relativePath, mutator) {
  const value = await readJson(projectRoot, relativePath);
  await mutator(value);
  await writeJson(projectRoot, relativePath, value);
}

async function withEvidenceCopy(fn) {
  const copy = await copyG0EvidenceOnly(baseWorkspace.projectRoot);
  try {
    await fn(copy.projectRoot);
  } finally {
    await copy.cleanup();
  }
}

async function expectRejectsCode(projectRoot, code) {
  await assert.rejects(
    () => validateG0StateResume({ projectRoot }),
    (error) => error.message.includes(code)
  );
}

before(async () => {
  baseWorkspace = await createG0GoldenPathWorkspace();
});

after(async () => {
  if (baseWorkspace) {
    await baseWorkspace.cleanup();
  }
});

test('G0 golden path runs a real run-analysis subprocess and resumes from STATE.md', async () => {
  const result = await validateG0StateResume({
    projectRoot: baseWorkspace.projectRoot
  });

  assert.equal(result.ok, true);
  assert.equal(result.artifactCount, 12);
});

test('G0 rejects missing R2 review before claim-candidate', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await unlink(path.join(projectRoot, 'artifacts', 'g0', 'r2-review.json'));
    await expectRejectsCode(projectRoot, 'E_G0_ARTIFACT_FILE_MISSING');
  });
});

test('G0 rejects R2 review recorded after the claim-candidate', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateJson(projectRoot, 'artifacts/g0/r2-review.json', (r2Review) => {
      r2Review.step = 12;
    });
    await expectRejectsCode(projectRoot, 'E_G0_ARTIFACT_HASH_MISMATCH');

    const progress = await readJson(projectRoot, 'artifacts/g0/PROGRESS.json');
    const r2 = progress.artifacts.find((entry) => entry.artifactId === 'r2-review');
    r2.sha256 = await hashFile(projectRoot, r2.path);
    await writeJson(projectRoot, 'artifacts/g0/PROGRESS.json', progress);
    await expectRejectsCode(projectRoot, 'E_G0_R2_MUST_PRECEDE_CLAIM');
  });
});

test('G0 rejects claim-candidates that cite raw confounders', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateClaimAndRefresh(projectRoot, (claim) => {
      claim.confounderArtifactId = 'confounder-raw';
      claim.evidenceRefs = claim.evidenceRefs.map((ref) =>
        ref.artifactId === 'confounder-matched'
          ? { ...ref, artifactId: 'confounder-raw', role: 'raw-confounder' }
          : ref
      );
    });
    await expectRejectsCode(projectRoot, 'E_G0_CLAIM_MUST_CITE_MATCHED_CONFOUNDER');
  });
});

test('G0 rejects claim-candidates that cite conditioned confounders', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateClaimAndRefresh(projectRoot, (claim) => {
      claim.confounderArtifactId = 'confounder-conditioned';
    });
    await expectRejectsCode(projectRoot, 'E_G0_CLAIM_MUST_CITE_MATCHED_CONFOUNDER');
  });
});

test('G0 rejects missing matched confounder artifact', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await unlink(path.join(projectRoot, 'artifacts', 'g0', 'confounder-matched.json'));
    await expectRejectsCode(projectRoot, 'E_G0_ARTIFACT_FILE_MISSING');
  });
});

test('G0 rejects missing crystallized output files', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await unlink(path.join(projectRoot, 'artifacts', 'g0', 'analysis-output.json'));
    await expectRejectsCode(projectRoot, 'E_G0_ARTIFACT_FILE_MISSING');
  });
});

test('G0 rejects hash mismatches on crystallized outputs', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await writeFile(
      path.join(projectRoot, 'artifacts', 'g0', 'analysis-output.json'),
      '{"tampered":true}\n',
      'utf8'
    );
    await expectRejectsCode(projectRoot, 'E_G0_ARTIFACT_HASH_MISMATCH');
  });
});

test('G0 rejects STATE.md files that cannot resume terminal artifacts', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    const statePath = path.join(projectRoot, 'STATE.md');
    const state = await readFile(statePath, 'utf8');
    await writeFile(
      statePath,
      state.replace(/- claim-candidate: .+\r?\n/u, ''),
      'utf8'
    );
    await expectRejectsCode(projectRoot, 'E_G0_STATE_ARTIFACT_PATH_MISSING');
  });
});

test('G0 rejects non-synthetic or biomedical claim authority', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateClaimAndRefresh(projectRoot, (claim) => {
      claim.notBiomedicalClaim = false;
    });
    await expectRejectsCode(projectRoot, 'E_G0_CLAIM_CANDIDATE_NOT_SYNTHETIC');
  });
});

test('G0 rejects real-data-like input paths', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateJson(projectRoot, 'analysis/manifests/g0-analysis.json', (manifest) => {
      manifest.inputs[0].path = 'data/real/GSE184880_full.h5ad';
    });
    await refreshArtifactHash(projectRoot, 'analysis-manifest');
    await expectRejectsCode(projectRoot, 'E_G0_REAL_DATA_PATH_FORBIDDEN');
  });
});

test('G0 rejects accepted claim-edge writer side effects', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    const edgePath = path.join(
      projectRoot,
      '.vibe-science-environment',
      'claims',
      'edges.jsonl'
    );
    await mkdir(path.dirname(edgePath), { recursive: true });
    await writeFile(edgePath, '{"forbidden":true}\n', 'utf8');
    await expectRejectsCode(projectRoot, 'E_G0_CLAIM_EDGE_WRITE_FORBIDDEN');
  });
});

test('G0 rejects hard-gated surface openings', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateClaimAndRefresh(projectRoot, (claim) => {
      claim.hardGatedSurfaces.graphifyOpened = true;
    });
    await expectRejectsCode(projectRoot, 'E_G0_HARD_GATED_SURFACE_OPEN');
  });
});

test('G0 rejects high-stakes artifacts where the action executed', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    await mutateJson(projectRoot, 'artifacts/g0/high-stakes-stop.json', (stop) => {
      stop.actionExecuted = true;
    });
    await refreshArtifactHash(projectRoot, 'high-stakes-stop');
    await expectRejectsCode(projectRoot, 'E_G0_HIGH_STAKES_ACTION_EXECUTED');
  });
});

test('G0 bundle validation can run directly from PROGRESS.json', async () => {
  await withEvidenceCopy(async (projectRoot) => {
    const result = await validateG0GoldenPathBundle({ projectRoot });
    assert.equal(result.ok, true);
  });
});

async function hashFile(projectRoot, relativePath) {
  const { createHash } = await import('node:crypto');
  const bytes = await readFile(path.join(projectRoot, ...relativePath.split('/')));
  return createHash('sha256').update(bytes).digest('hex');
}

async function refreshArtifactHash(projectRoot, artifactId) {
  const progress = await readJson(projectRoot, 'artifacts/g0/PROGRESS.json');
  const artifact = progress.artifacts.find((entry) => entry.artifactId === artifactId);
  artifact.sha256 = await hashFile(projectRoot, artifact.path);
  await writeJson(projectRoot, 'artifacts/g0/PROGRESS.json', progress);
}

async function mutateClaimAndRefresh(projectRoot, mutator) {
  await mutateJson(projectRoot, 'artifacts/g0/claim-candidate.json', mutator);
  await refreshArtifactHash(projectRoot, 'claim-candidate');
}
