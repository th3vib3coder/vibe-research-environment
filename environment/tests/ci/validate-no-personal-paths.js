import { assert, collectFiles, isDirectRun, readText } from './_helpers.js';

const forbiddenPatterns = [
  /C:\\Users\\/u,
  /\/Users\//u,
  /\/home\//u,
  /\/mnt\/c\/Users\//u,
  /~\//u,
  /~\\/u
];

export default async function validateNoPersonalPaths() {
  const files = await collectFiles('.', {
    include: (file) =>
      file === 'README.md' ||
      file === '.claude/rules/roles.md' ||
      (file.startsWith('commands/') && file.endsWith('.md')) ||
      (file.startsWith('blueprints/definitive-spec/') && file.endsWith('.md')) ||
      (file.startsWith('environment/control/') && file.endsWith('.js')) ||
      (file.startsWith('environment/evals/') && (file.endsWith('.js') || file.endsWith('.json'))) ||
      (file.startsWith('environment/flows/') && file.endsWith('.js')) ||
      (file.startsWith('environment/lib/') && file.endsWith('.js')) ||
      (file.startsWith('environment/schemas/') && file.endsWith('.json')) ||
      (file.startsWith('environment/templates/') && file.endsWith('.json')) ||
      (file.startsWith('environment/install/') && file.endsWith('.json'))
  });

  for (const file of files) {
    const content = await readText(file);
    for (const pattern of forbiddenPatterns) {
      assert(!pattern.test(content), `Personal path found in ${file}: ${pattern}`);
    }
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-no-personal-paths', validateNoPersonalPaths);
}
