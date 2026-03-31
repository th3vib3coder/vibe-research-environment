import { assert, collectFiles, isDirectRun, pathExists, readJson } from './_helpers.js';

export default async function validateInstallBundles() {
  const bundleFiles = await collectFiles('environment/install/bundles', {
    include: (file) => file.endsWith('.bundle.json')
  });

  const bundleIds = new Set();

  for (const file of bundleFiles) {
    const bundle = await readJson(file);
    assert(typeof bundle.bundleId === 'string' && bundle.bundleId !== '', `Bundle ${file} is missing bundleId`);
    assert(!bundleIds.has(bundle.bundleId), `Duplicate bundle id: ${bundle.bundleId}`);
    bundleIds.add(bundle.bundleId);

    assert(Number.isInteger(bundle.phase), `Bundle ${bundle.bundleId} must declare integer phase`);
    assert(Array.isArray(bundle.dependsOn), `Bundle ${bundle.bundleId} must declare dependsOn`);
    assert(Array.isArray(bundle.capabilitiesProvided), `Bundle ${bundle.bundleId} must declare capabilitiesProvided`);
    assert(Array.isArray(bundle.ownedPaths), `Bundle ${bundle.bundleId} must declare ownedPaths`);
    assert(Array.isArray(bundle.bootstrapPaths), `Bundle ${bundle.bundleId} must declare bootstrapPaths`);

    for (const ownedPath of bundle.ownedPaths) {
      assert(typeof ownedPath === 'string' && ownedPath !== '', `Bundle ${bundle.bundleId} has invalid ownedPath`);
      assert(!ownedPath.startsWith('.vibe-science-environment/'), `ownedPath must be repo-owned, not workspace state: ${ownedPath}`);
      assert(await pathExists(ownedPath), `Bundle ${bundle.bundleId} references missing ownedPath ${ownedPath}`);
    }

    for (const bootstrapPath of bundle.bootstrapPaths) {
      assert(typeof bootstrapPath === 'string' && bootstrapPath !== '', `Bundle ${bundle.bundleId} has invalid bootstrapPath`);
      assert(!bootstrapPath.includes('..'), `bootstrapPath escapes workspace root: ${bootstrapPath}`);
      assert(!bootstrapPath.startsWith('/') && !bootstrapPath.includes(':\\'), `bootstrapPath must be relative: ${bootstrapPath}`);
    }
  }

  for (const file of bundleFiles) {
    const bundle = await readJson(file);
    for (const dep of bundle.dependsOn) {
      assert(bundleIds.has(dep), `Bundle ${bundle.bundleId} depends on unknown bundle ${dep}`);
    }
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-install-bundles', validateInstallBundles);
}
