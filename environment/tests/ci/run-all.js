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
import validatePhase10ClaimEdgeProjection from './phase10-claim-edge-projection.js';
import validatePhase10CuratorRole from './phase10-curator-role.js';
import validatePhase10Inbox from './phase10-inbox.js';
import validatePhase10KnowledgeBaseImport from './phase10-knowledge-base-import.js';
import validatePhase10Law13Bridge from './phase10-law13-bridge.js';
import validatePhase10Law13Lint from './phase10-law13-lint.js';
import validatePhase10RawZone from './phase10-raw-zone.js';
import validatePhase10ScientificSkillIntake from './phase10-scientific-skill-intake.js';
import validatePhase10SourceBundles from './phase10-source-bundles.js';
import validatePhase10WikiCompile from './phase10-wiki-compile.js';
import validatePhase10WikiR2Audit from './phase10-wiki-r2-audit.js';
import validatePhase10AssertionGraph from './phase10-assertion-graph.js';
import validatePhase10RiskScanner from './phase10-risk-scanner.js';
import validatePhase10CompilePolicy from './phase10-compile-policy.js';
import validatePhase10WikiQuery from './phase10-wiki-query.js';

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
  ['check-phase9-ledger', checkPhase9Ledger],
  ['phase10-claim-edge-projection', validatePhase10ClaimEdgeProjection],
  ['phase10-curator-role', validatePhase10CuratorRole],
  ['phase10-inbox', validatePhase10Inbox],
  ['phase10-knowledge-base-import', validatePhase10KnowledgeBaseImport],
  ['phase10-scientific-skill-intake', validatePhase10ScientificSkillIntake],
  ['phase10-law13-bridge', validatePhase10Law13Bridge],
  ['phase10-law13-lint', validatePhase10Law13Lint],
  ['phase10-raw-zone', validatePhase10RawZone],
  ['phase10-source-bundles', validatePhase10SourceBundles],
  ['phase10-wiki-compile', validatePhase10WikiCompile],
  ['phase10-wiki-r2-audit', validatePhase10WikiR2Audit],
  ['phase10-assertion-graph', validatePhase10AssertionGraph],
  ['phase10-risk-scanner', validatePhase10RiskScanner],
  ['phase10-compile-policy', validatePhase10CompilePolicy],
  ['phase10-wiki-query', validatePhase10WikiQuery]
];

for (const [name, validator] of validators) {
  await runValidator(name, validator);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
