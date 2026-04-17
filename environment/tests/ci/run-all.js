import { runValidator } from './_helpers.js';
import validateTemplates from './validate-templates.js';
import validateRuntimeContracts from './validate-runtime-contracts.js';
import validateReferences from './validate-references.js';
import validateInstallBundles from './validate-install-bundles.js';
import validateBundleOwnership from './validate-bundle-ownership.js';
import validateCounts from './validate-counts.js';
import validateCommandsToJs from './validate-commands-to-js.js';
import validateNoKernelWrites from './validate-no-kernel-writes.js';
import validateRoles from './validate-roles.js';
import validateNoPersonalPaths from './validate-no-personal-paths.js';

const validators = [
  ['validate-templates', validateTemplates],
  ['validate-runtime-contracts', validateRuntimeContracts],
  ['validate-references', validateReferences],
  ['validate-install-bundles', validateInstallBundles],
  ['validate-bundle-ownership', validateBundleOwnership],
  ['validate-counts', validateCounts],
  ['validate-commands-to-js', validateCommandsToJs],
  ['validate-no-kernel-writes', validateNoKernelWrites],
  ['validate-roles', validateRoles],
  ['validate-no-personal-paths', validateNoPersonalPaths]
];

for (const [name, validator] of validators) {
  await runValidator(name, validator);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
