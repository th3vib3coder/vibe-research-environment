import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createFixtureProject, cleanupFixtureProject } from './_fixture.js';
import { runWithMiddleware } from '../../control/middleware.js';
import { listAttempts } from '../../control/attempts.js';
import { registerPaper, linkPaperToClaim } from '../../flows/literature.js';

test('literature flow can register a paper and persist explicit claim links through middleware', async () => {
  const projectRoot = await createFixtureProject('vre-int-lit-');

  try {
    const registerRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-literature',
      scope: 'flow-literature',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => {
        const registered = await registerPaper(projectRoot, {
          title: 'Integration test paper',
          doi: '10.5000/integration',
          authors: ['Author A'],
          year: 2026,
          relevance: 'supports claim C-010',
          linkedClaims: [],
          methodologyConflicts: []
        });
        return {
          summary: 'paper registered',
          payload: { paperId: registered.paper.id }
        };
      }
    });

    const linkRun = await runWithMiddleware({
      projectPath: projectRoot,
      commandName: '/flow-literature',
      scope: 'flow-literature',
      reader: { dbAvailable: false, error: 'bridge unavailable' },
      commandFn: async () => {
        const linked = await linkPaperToClaim(projectRoot, '10.5000/integration', 'C-010');
        return {
          summary: 'paper linked',
          payload: { linkedClaims: linked.paper.linkedClaims }
        };
      }
    });

    assert.equal(registerRun.attempt.status, 'succeeded');
    assert.equal(linkRun.attempt.status, 'succeeded');

    const attempts = await listAttempts(projectRoot, { flow: 'flow-literature' });
    assert.equal(attempts.length, 2);

    const literatureStatePath = path.join(projectRoot, '.vibe-science-environment', 'flows', 'literature.json');
    const literatureState = JSON.parse(await readFile(literatureStatePath, 'utf8'));
    assert.deepEqual(literatureState.papers[0].linkedClaims, ['C-010']);
  } finally {
    await cleanupFixtureProject(projectRoot);
  }
});
