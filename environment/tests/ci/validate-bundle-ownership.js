import { assert, collectFiles, isDirectRun, readJson } from './_helpers.js';

export default async function validateBundleOwnership() {
  const bundleFiles = await collectFiles('environment/install/bundles', {
    include: (file) => file.endsWith('.bundle.json')
  });

  const owners = new Map();

  for (const file of bundleFiles) {
    const bundle = await readJson(file);
    for (const ownedPath of bundle.ownedPaths) {
      if (owners.has(ownedPath)) {
        throw new Error(
          `Duplicate ownedPath ${ownedPath}: ${owners.get(ownedPath)} and ${bundle.bundleId}`
        );
      }
      owners.set(ownedPath, bundle.bundleId);
    }
  }

  assert(owners.size > 0, 'No ownedPaths found across bundle manifests');
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-bundle-ownership', validateBundleOwnership);
}
