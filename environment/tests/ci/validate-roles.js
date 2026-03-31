import { assert, isDirectRun, readText } from './_helpers.js';

const knownRoles = new Set([
  'RESEARCHER',
  'REVIEWER 2',
  'SERENDIPITY SCANNER',
  'EXPERIMENTER',
  'TEAM LEAD',
  'JUDGE AGENT (R3)'
]);

export default async function validateRoles() {
  const content = await readText('.claude/rules/roles.md');
  const matches = [...content.matchAll(/^## If you are(?: the)? (.+?):$/gmu)].map((match) => match[1].trim());

  assert(matches.length > 0, 'roles.md does not declare any role headings');

  for (const role of matches) {
    assert(knownRoles.has(role), `Unknown permission-engine role in roles.md: ${role}`);
  }
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('validate-roles', validateRoles);
}
