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
import validateCloseoutHonesty from './validate-closeout-honesty.js';
import validateCiWorkflow from './validate-ci-workflow.js';
import checkPhase9Ledger from './check-phase9-ledger.js';

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
  ['validate-no-personal-paths', validateNoPersonalPaths],
  ['validate-closeout-honesty', validateCloseoutHonesty],
  ['validate-ci-workflow', validateCiWorkflow],
  ['check-phase9-ledger', checkPhase9Ledger]
];

for (const [name, validator] of validators) {
  await runValidator(name, validator);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
