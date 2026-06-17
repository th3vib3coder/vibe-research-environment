const REQUIRED_CARRY_FORWARD_IDS = Object.freeze([
  'FU-EOF-NOISE-CLEANUP',
  'W10.4-DEFERRED-EXPORT-PACKAGING-001',
  'W10.5-DEFERRED-PERSISTED-MULTI-DOMAIN-EXECUTION-001',
  'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'
]);

const REQUIRED_CLOSED_PHASE11_AUTHORITY_SOURCES = Object.freeze([
  'environment/closures/phase11-full-closeout-2026-06-17.md',
  'environment/closures/phase11-full-closeout-evidence-2026-06-17.json',
  'C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/'
    + 'claude-hat3-t11.3.4-phase-11-full-closeout-verdict-2026-06-17.md'
]);

const COUNT_ROWS = Object.freeze([
  ['bundleManifests', 'Install bundle manifests', 'Manifest bundle installazione'],
  ['schemas', 'Schemas', 'Schemi'],
  ['templates', 'Templates', 'Template'],
  ['evalTasks', 'Eval tasks', 'Task eval'],
  ['evalMetrics', 'Eval metrics', 'Metriche eval'],
  ['evalBenchmarks', 'Eval benchmarks', 'Benchmark eval'],
  ['auditTests', 'Audit tests', 'Test audit'],
  ['controlTests', 'Control/orchestrator tests', 'Test control/orchestrator'],
  ['compatibilityTests', 'Compatibility tests', 'Test compatibilita'],
  ['flowTests', 'Flow tests', 'Test flow'],
  ['libTests', 'Library tests', 'Test libreria'],
  ['evalTests', 'Eval tests', 'Test eval'],
  ['installTests', 'Install tests', 'Test installazione'],
  ['integrationTests', 'Integration tests', 'Test integrazione'],
  ['cliTests', 'CLI tests', 'Test CLI'],
  ['schemaTests', 'Schema tests', 'Test schema'],
  ['ciValidators', 'CI validators', 'Validator CI']
]);

export const CURRENT_STATUS_MARKERS = Object.freeze({
  surfaceCountsEnglish: 'VRE:CURRENT-SURFACE-COUNTS:EN',
  currentStatusEnglish: 'VRE:CURRENT-STATUS:EN',
  surfaceCountsItalian: 'VRE:CURRENT-SURFACE-COUNTS:IT',
  currentStatusItalian: 'VRE:CURRENT-STATUS:IT'
});

export const CURRENT_STATUS_REASON_CODES = Object.freeze({
  invalidAuthoritySchema: 'E_PHASE11_CURRENT_STATUS_AUTHORITY_SCHEMA',
  privateWikiCiDependency: 'E_PHASE11_CURRENT_STATUS_PRIVATE_WIKI_CI_DEPENDENCY',
  snapshotDrift: 'E_PHASE11_CURRENT_STATUS_SNAPSHOT_DRIFT',
  phase11Closed: 'E_PHASE11_CURRENT_STATUS_PHASE11_CLOSED',
  phase11ClosedAuthorityMissing:
    'E_PHASE11_CURRENT_STATUS_PHASE11_CLOSED_AUTHORITY_MISSING',
  missingLatestClosedEvidence: 'E_PHASE11_CURRENT_STATUS_LATEST_CLOSED_MISSING',
  missingCarryForward: 'E_PHASE11_CURRENT_STATUS_CARRY_FORWARD_MISSING',
  readmeMarkerMissing: 'E_PHASE11_CURRENT_STATUS_README_MARKER_MISSING',
  readmeSurfaceCountsEnglishMismatch:
    'E_PHASE11_CURRENT_STATUS_README_COUNTS_EN_MISMATCH',
  readmeCurrentStatusEnglishMismatch:
    'E_PHASE11_CURRENT_STATUS_README_STATUS_EN_MISMATCH',
  readmeSurfaceCountsItalianMismatch:
    'E_PHASE11_CURRENT_STATUS_README_COUNTS_IT_MISMATCH',
  readmeCurrentStatusItalianMismatch:
    'E_PHASE11_CURRENT_STATUS_README_STATUS_IT_MISMATCH',
  wikiProjectionMismatch: 'E_PHASE11_CURRENT_STATUS_WIKI_MISMATCH'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function markerStart(marker) {
  return `<!-- ${marker}:BEGIN -->`;
}

function markerEnd(marker) {
  return `<!-- ${marker}:END -->`;
}

function getMarkerContent(markdown, marker) {
  const start = markerStart(marker);
  const end = markerEnd(marker);
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return markdown
    .slice(startIndex + start.length, endIndex)
    .replace(/^\r?\n/u, '')
    .replace(/\r?\n$/u, '');
}

function normalizeBlock(value) {
  return String(value).trim().replace(/\r\n/gu, '\n');
}

function renderCarryForwardRows(items) {
  return [
    '| ID | Status | Summary |',
    '|---|---|---|',
    ...items.map((item) =>
      `| \`${item.id}\` | ${item.status} | ${item.summary} |`
    )
  ].join('\n');
}

function renderCountRows(model, language) {
  const labelIndex = language === 'it' ? 2 : 1;
  const rows = COUNT_ROWS
    .filter(([key]) => Object.prototype.hasOwnProperty.call(model.counts, key))
    .map(([key, english, italian]) => {
      const label = labelIndex === 2 ? italian : english;
      return `| ${label} | ${model.counts[key]} |`;
    });

  return [
    language === 'it'
      ? '| Superficie | Conteggio |'
      : '| Surface | Count |',
    '|---|---:|',
    ...rows
  ].join('\n');
}

function validateAuthority(authority) {
  const issues = [];

  if (authority?.schemaVersion !== 'phase11.current-status-authority.v1') {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.invalidAuthoritySchema));
  }

  if (authority?.sourceStrategy !== 'tracked-vre-snapshot') {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.privateWikiCiDependency, {
      sourceStrategy: authority?.sourceStrategy
    }));
  }

  if (authority?.snapshotMatchesCanonicalPrivateWiki !== true) {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.snapshotDrift));
  }

  const latest = authority?.latestClosedTask;
  if (
    !hasText(latest?.taskId)
    || !hasText(latest?.commit)
    || !hasText(latest?.ciRun)
    || latest?.ciConclusion !== 'success'
  ) {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.missingLatestClosedEvidence));
  }

  if (authority?.phaseStatus === 'closed') {
    const current = authority?.currentTask;
    if (
      latest?.taskId !== 'T11.3.4' ||
      latest?.status !== 'closed-pushed-ci-green' ||
      latest?.ciConclusion !== 'success' ||
      !hasText(latest?.commit) ||
      !hasText(latest?.ciRun) ||
      current?.status !== 'phase-closed'
    ) {
      issues.push(issue(CURRENT_STATUS_REASON_CODES.phase11Closed));
    }

    const authoritySources = new Set(authority?.authoritySources ?? []);
    for (const source of REQUIRED_CLOSED_PHASE11_AUTHORITY_SOURCES) {
      if (!authoritySources.has(source)) {
        issues.push(issue(
          CURRENT_STATUS_REASON_CODES.phase11ClosedAuthorityMissing,
          { source }
        ));
      }
    }
  }

  const carriedIds = new Set((authority?.carryForward ?? []).map((item) => item.id));
  for (const id of REQUIRED_CARRY_FORWARD_IDS) {
    if (!carriedIds.has(id)) {
      issues.push(issue(CURRENT_STATUS_REASON_CODES.missingCarryForward, {
        itemId: id
      }));
    }
  }

  return issues;
}

export function buildCurrentStatusModel(authority, counts) {
  return {
    generatedAt: authority?.generatedAt ?? null,
    phase: authority?.phase ?? 11,
    phaseStatus: authority?.phaseStatus ?? 'open',
    activeWave: authority?.activeWave ?? null,
    latestClosedWave: authority?.latestClosedWave ?? null,
    latestClosedTask: authority?.latestClosedTask ?? {},
    currentTask: authority?.currentTask ?? {},
    carryForward: authority?.carryForward ?? [],
    authoritySources: authority?.authoritySources ?? [],
    sourceStrategy: authority?.sourceStrategy ?? null,
    counts: { ...(counts ?? {}) }
  };
}

export function renderReadmeSurfaceCountsEnglish(model) {
  return [
    '### Current Surface Counts',
    '',
    'These counts are generated from the repository CI count validator. They are',
    'not copied from a private WIKI checkout.',
    '',
    renderCountRows(model, 'en'),
    '',
    'Update these counts only in the same patch that changes the counted surface.'
  ].join('\n');
}

export function renderReadmeSurfaceCountsItalian(model) {
  return [
    '### Conteggi Di Superficie Correnti',
    '',
    'Questi conteggi sono generati dal validator CI del repository. Non sono',
    'copiati da una WIKI privata affiancata.',
    '',
    renderCountRows(model, 'it'),
    '',
    'Aggiorna questi conteggi solo nella stessa patch che cambia la superficie.'
  ].join('\n');
}

export function renderReadmeCurrentStatusEnglish(model) {
  const latest = model.latestClosedTask;
  const current = model.currentTask;
  if (model.phaseStatus === 'closed') {
    return [
      '## Current Status',
      '',
      'Phase 11 is closed as a VRE research-environment foundation at',
      `\`${latest.commit}\` with GitHub Actions run`,
      `\`${latest.ciRun}\` (${latest.ciConclusion}).`,
      '',
      'No active Phase 11 implementation task is open. Phase 12 remains gated',
      'by the reviewed phase-entry guard and requires a future explicit HAT',
      'cycle with real research evidence or a scoped operator override.',
      '',
      'Carry-forward and deferred items remain visible:',
      '',
      renderCarryForwardRows(model.carryForward),
      '',
      'For live CI state, check GitHub Actions. This README is a generated',
      'repository projection, not a biomedical result or claim-ready report.'
    ].join('\n');
  }

  return [
    '## Current Status',
    '',
    `Phase 11 is open; Wave ${model.latestClosedWave} is closed at`,
    `\`${latest.commit}\` with GitHub Actions run`,
    `\`${latest.ciRun}\` (${latest.ciConclusion}).`,
    '',
    `Active task: \`${current.taskId}\` - ${current.name}`,
    `(${current.status}). This task keeps README and WIKI status generated`,
    'from a tracked VRE snapshot; CI must not read a sibling private WIKI checkout.',
    '',
    'Carry-forward and deferred items remain visible:',
    '',
    renderCarryForwardRows(model.carryForward),
    '',
    'For live CI state, check GitHub Actions. This README is a generated repository',
    'projection, not a Phase 11 full closeout.'
  ].join('\n');
}

export function renderReadmeCurrentStatusItalian(model) {
  const latest = model.latestClosedTask;
  const current = model.currentTask;
  if (model.phaseStatus === 'closed') {
    return [
      '## Stato Corrente',
      '',
      'Phase 11 e chiusa come fondazione VRE per ambiente di ricerca al commit',
      `\`${latest.commit}\` con GitHub Actions run`,
      `\`${latest.ciRun}\` (${latest.ciConclusion}).`,
      '',
      'Nessun task implementativo Phase 11 e aperto. Phase 12 resta bloccata',
      'dal phase-entry guard revisionato e richiede un futuro ciclo HAT',
      'esplicito con evidenza di ricerca reale o override operatore scoped.',
      '',
      'Carry-forward e deferral restano visibili:',
      '',
      renderCarryForwardRows(model.carryForward),
      '',
      'Per lo stato CI live, controlla GitHub Actions. Questo README e una',
      'proiezione generata del repository, non un risultato biomedico o report',
      'claim-ready.'
    ].join('\n');
  }

  return [
    '## Stato Corrente',
    '',
    `Phase 11 e aperta; Wave ${model.latestClosedWave} e chiusa al commit`,
    `\`${latest.commit}\` con GitHub Actions run`,
    `\`${latest.ciRun}\` (${latest.ciConclusion}).`,
    '',
    `Task attivo: \`${current.taskId}\` - ${current.name}`,
    `(${current.status}). Questo task mantiene README e WIKI generati da una`,
    'snapshot VRE tracciata; la CI non deve leggere una WIKI privata affiancata.',
    '',
    'Carry-forward e deferral restano visibili:',
    '',
    renderCarryForwardRows(model.carryForward),
    '',
    'Per lo stato CI live, controlla GitHub Actions. Questo README e una proiezione',
    'generata del repository, non un full closeout di Phase 11.'
  ].join('\n');
}

export function renderWikiCurrentStatus(model) {
  const latest = model.latestClosedTask;
  return [
    '# VRE Current Status Projection',
    '',
    `Generated At: ${model.generatedAt}`,
    `Phase: ${model.phase}`,
    `Phase Status: ${model.phaseStatus}`,
    `Active Wave: ${model.activeWave}`,
    `Latest Closed Wave: ${model.latestClosedWave}`,
    `Latest Closed Task: ${latest.taskId} - ${latest.name}`,
    `Latest Closed Commit: ${latest.commit}`,
    `Latest Closed CI: ${latest.ciRun} ${latest.ciConclusion}`,
    `Current Task: ${model.currentTask.taskId} - ${model.currentTask.name}`,
    `Current Task Status: ${model.currentTask.status}`,
    `Source Strategy: ${model.sourceStrategy}`,
    '',
    '## Surface Counts',
    '',
    renderCountRows(model, 'en'),
    '',
    '## Carry-Forward And Deferred Items',
    '',
    renderCarryForwardRows(model.carryForward),
    '',
    '## Authority Sources',
    '',
    ...model.authoritySources.map((source) => `- ${source}`),
    '',
    '## Boundary',
    '',
    'This page is a generated status projection for readers and HAT review. VRE',
    'repository CI validates the tracked snapshot under',
    '`environment/tests/fixtures/phase11/`; it must not depend on this private',
    'WIKI checkout being present.'
  ].join('\n');
}

export function replaceGeneratedBlock(markdown, marker, replacement) {
  const start = markerStart(marker);
  const end = markerEnd(marker);
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}[\\s\\S]*?`
      + `${end.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`,
    'u'
  );
  const block = `${start}\n${replacement.trimEnd()}\n${end}`;

  if (!pattern.test(markdown)) {
    return `${markdown.trimEnd()}\n\n${block}\n`;
  }

  return markdown.replace(pattern, block);
}

function compareReadmeBlock(markdown, marker, expected, code, issues) {
  const actual = getMarkerContent(markdown, marker);
  if (actual == null) {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.readmeMarkerMissing, { marker }));
    return;
  }

  if (normalizeBlock(actual) !== normalizeBlock(expected)) {
    issues.push(issue(code, { marker }));
  }
}

export function validateCurrentStatusProjection(input) {
  const authority = input?.authority;
  const model = buildCurrentStatusModel(authority, input?.counts);
  const issues = validateAuthority(authority);
  const readmeMarkdown = input?.readmeMarkdown ?? '';

  compareReadmeBlock(
    readmeMarkdown,
    CURRENT_STATUS_MARKERS.surfaceCountsEnglish,
    renderReadmeSurfaceCountsEnglish(model),
    CURRENT_STATUS_REASON_CODES.readmeSurfaceCountsEnglishMismatch,
    issues
  );
  compareReadmeBlock(
    readmeMarkdown,
    CURRENT_STATUS_MARKERS.currentStatusEnglish,
    renderReadmeCurrentStatusEnglish(model),
    CURRENT_STATUS_REASON_CODES.readmeCurrentStatusEnglishMismatch,
    issues
  );
  compareReadmeBlock(
    readmeMarkdown,
    CURRENT_STATUS_MARKERS.surfaceCountsItalian,
    renderReadmeSurfaceCountsItalian(model),
    CURRENT_STATUS_REASON_CODES.readmeSurfaceCountsItalianMismatch,
    issues
  );
  compareReadmeBlock(
    readmeMarkdown,
    CURRENT_STATUS_MARKERS.currentStatusItalian,
    renderReadmeCurrentStatusItalian(model),
    CURRENT_STATUS_REASON_CODES.readmeCurrentStatusItalianMismatch,
    issues
  );

  if (
    input?.wikiMarkdown != null
    && normalizeBlock(input.wikiMarkdown) !== normalizeBlock(renderWikiCurrentStatus(model))
  ) {
    issues.push(issue(CURRENT_STATUS_REASON_CODES.wikiProjectionMismatch));
  }

  return {
    ok: issues.length === 0,
    issues,
    model
  };
}
