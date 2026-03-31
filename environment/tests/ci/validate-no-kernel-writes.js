import { assert, collectFiles, isDirectRun, readText } from './_helpers.js';

const forbiddenPatterns = [
  /\.vibe-science(?!-environment)/u,
  /CLAIM-LEDGER\.md/u,
  /\bclaim_events\b/u,
  /\bcitation_checks\b/u,
  /\bgovernance_events\b/u
];

export default async function validateNoKernelWrites() {
  const runtimeFiles = await collectFiles('.', {
    include: (file) =>
      ((file.startsWith('environment/control/') ||
        file.startsWith('environment/flows/') ||
        file.startsWith('environment/lib/')) &&
        file.endsWith('.js')) ||
      (file.startsWith('commands/') && file.endsWith('.md'))
  });

  for (const file of runtimeFiles) {
    const content = await readText(file);
    for (const pattern of forbiddenPatterns) {
      assert(!pattern.test(content), `Kernel-write-adjacent reference found in ${file}: ${pattern}`);
    }
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-no-kernel-writes', validateNoKernelWrites);
}
