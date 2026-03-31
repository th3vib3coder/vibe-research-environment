import { collectFiles, isDirectRun, readJson } from './_helpers.js';

export default async function validateTemplates() {
  const templates = await collectFiles('environment/templates', {
    include: (file) => file.endsWith('.json')
  });

  for (const templatePath of templates) {
    await readJson(templatePath);
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-templates', validateTemplates);
}
