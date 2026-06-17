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
import validatePhase10QueryDecisionUse from './phase10-query-decision-use.js';
import validatePhase10QueryLints from './phase10-query-lints.js';
import validatePhase10ExportGuard from './phase10-export-guard.js';
import validatePhase10MarpExport from './phase10-marp-export.js';
import validatePhase10PresentationStaleness from './phase10-presentation-staleness.js';
import validatePhase10MultiDomainGate from './phase10-multi-domain-gate.js';
import validatePhase10CrossDomainMerge from './phase10-cross-domain-merge.js';
import validatePhase10CrossDomainQuery from './phase10-cross-domain-query.js';
import checkPhase11Ledger from './check-phase11-ledger.js';
import validatePhase11FirstResearchPacket from './phase11-first-research-packet.js';
import validatePhase11HgsocCd8Script from './phase11-hgsoc-cd8-script.js';
import validatePhase11InterpreterExecutor from './phase11-interpreter-executor.js';
import validatePhase11InterpreterManifest from './phase11-interpreter-manifest.js';
import validatePhase11ResearchPacket from './phase11-research-packet.js';
import validatePhase11ScientificDerivationHarness from './phase11-scientific-derivation-harness.js';
import validatePhase11ScientificInvariantBlockers from './phase11-scientific-invariant-blockers.js';
import validatePhase11CoverageRegressionHarness from './phase11-coverage-regression-harness.js';

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
  ['phase10-wiki-query', validatePhase10WikiQuery],
  ['phase10-query-decision-use', validatePhase10QueryDecisionUse],
  ['phase10-query-lints', validatePhase10QueryLints],
  ['phase10-export-guard', validatePhase10ExportGuard],
  ['phase10-marp-export', validatePhase10MarpExport],
  ['phase10-presentation-staleness', validatePhase10PresentationStaleness],
  ['phase10-multi-domain-gate', validatePhase10MultiDomainGate],
  ['phase10-cross-domain-merge', validatePhase10CrossDomainMerge],
  ['phase10-cross-domain-query', validatePhase10CrossDomainQuery],
  ['check-phase11-ledger', checkPhase11Ledger],
  ['phase11-first-research-packet', validatePhase11FirstResearchPacket],
  ['phase11-hgsoc-cd8-script', validatePhase11HgsocCd8Script],
  ['phase11-interpreter-executor', validatePhase11InterpreterExecutor],
  ['phase11-interpreter-manifest', validatePhase11InterpreterManifest],
  ['phase11-research-packet', validatePhase11ResearchPacket],
  ['phase11-scientific-derivation-harness', validatePhase11ScientificDerivationHarness],
  ['phase11-scientific-invariant-blockers', validatePhase11ScientificInvariantBlockers],
  ['phase11-coverage-regression-harness', validatePhase11CoverageRegressionHarness]
];

for (const [name, validator] of validators) {
  await runValidator(name, validator);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
