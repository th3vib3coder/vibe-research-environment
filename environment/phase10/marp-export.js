import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');
const defaultTemplateRoot = path.join(repoRoot, 'environment', 'templates', 'marp');

export const REQUIRED_R2_VERDICT_SECTIONS = Object.freeze([
  'verdictSummary',
  'rejectedStatements',
  'uncertaintyAcknowledgment',
  'missingEvidence',
  'contradictionEdgesChecked',
  'recommendedNextAction'
]);

export const MARP_TEMPLATE_CATALOG = Object.freeze({
  'morning-digest': Object.freeze({
    fileName: 'morning-digest.marp.template.md',
    presentationUses: Object.freeze(['morning-digest'])
  }),
  'r2-verdict': Object.freeze({
    fileName: 'r2-verdict.marp.template.md',
    presentationUses: Object.freeze(['r2-verdict'])
  }),
  'synthesis-conference': Object.freeze({
    fileName: 'synthesis-conference.marp.template.md',
    presentationUses: Object.freeze(['synthesis-conference'])
  }),
  'synthesis-preprint': Object.freeze({
    fileName: 'synthesis-preprint.marp.template.md',
    presentationUses: Object.freeze(['synthesis-preprint'])
  }),
  'decision-support-query': Object.freeze({
    fileName: 'decision-support-query.marp.template.md',
    presentationUses: Object.freeze(['query-decision'])
  }),
  'contradiction-audit-query': Object.freeze({
    fileName: 'contradiction-audit-query.marp.template.md',
    presentationUses: Object.freeze(['query-audit'])
  }),
  'hypothesis-discussion': Object.freeze({
    fileName: 'hypothesis-discussion.marp.template.md',
    presentationUses: Object.freeze(['hypothesis-discussion'])
  })
});

const SIDE_EFFECT_FIELDS = Object.freeze([
  'outputPath',
  'outputDir',
  'renderCommand',
  'rendererCommand',
  'writeToDisk',
  'sharingProfile',
  'publicExport',
  'exportPackage',
  'exportManifest',
  'publishedUrl',
  'remote'
]);

function issue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceDecisionUse(source) {
  if (typeof source?.decisionUse === 'string') return source.decisionUse;
  return source?.decisionUse?.classification;
}

function sourceBadge(request) {
  return request?.epistemicBadge ?? request?.source?.epistemicBadge;
}

function sourcePageId(request) {
  return request?.sourcePageId ?? request?.source?.pageId ?? request?.source?.id;
}

function sha256Hex(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isInformationalBadge(badge) {
  const normalized = badge.toLowerCase();
  return normalized.includes('informational')
    || normalized.includes('non-decision')
    || normalized.includes('hypothesis');
}

function hasPresentationProvenanceRef(request) {
  return (Array.isArray(request?.provenanceRefs) ? request.provenanceRefs : [])
    .some((ref) => {
      const value = typeof ref === 'string'
        ? ref
        : ref?.path ?? ref?.uri ?? ref?.pageId ?? ref?.artifactPath;
      return typeof value === 'string'
        && value.replaceAll('\\', '/').startsWith('wiki/presentations/');
    });
}

function renderR2Sections(sections = {}) {
  return REQUIRED_R2_VERDICT_SECTIONS
    .map((section) => `## ${section}\n\n${sections[section]}`)
    .join('\n\n---\n\n');
}

function renderTemplate(template, replacements) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value ?? '');
  }
  return output;
}

async function loadTemplate(templateId, options = {}) {
  const template = MARP_TEMPLATE_CATALOG[templateId];
  if (!template) return null;
  const templateRoot = options.templateRoot ?? defaultTemplateRoot;
  const templatePath = path.join(templateRoot, template.fileName);
  const content = await readFile(templatePath, 'utf8');
  return {
    ...template,
    id: templateId,
    path: templatePath,
    content,
    sha256: sha256Hex(content)
  };
}

export async function validatePhase10MarpPresentationRequest(request = {}, options = {}) {
  const issues = [];
  const source = request.source ?? {};
  const classification = sourceDecisionUse(source);
  const badge = sourceBadge(request);
  const presentationUse = request.presentationUse;
  let template = null;

  try {
    template = await loadTemplate(request.templateId, options);
  } catch (error) {
    issue(
      issues,
      'E_PHASE10_MARP_TEMPLATE_UNREADABLE',
      'MARP template file could not be read.',
      { templateId: request.templateId, cause: error?.message }
    );
  }

  if (!template) {
    issue(
      issues,
      'E_PHASE10_MARP_TEMPLATE_UNKNOWN',
      'MARP template id is not in the reviewed catalog.',
      { templateId: request.templateId }
    );
  } else if (!template.presentationUses.includes(presentationUse)) {
    issue(
      issues,
      'E_PHASE10_MARP_TEMPLATE_USE_MISMATCH',
      'MARP template is not approved for the requested presentation use.',
      { templateId: request.templateId, presentationUse }
    );
  } else if (nonEmptyString(request.templateVersion) && request.templateVersion !== template.sha256) {
    issue(
      issues,
      'E_PHASE10_MARP_TEMPLATE_VERSION_MISMATCH',
      'Template version must equal the SHA256 of the actual template file.',
      { templateId: request.templateId }
    );
  }

  if (request.exportRequested === true) {
    issue(
      issues,
      'E_PHASE10_MARP_EXPORT_FORBIDDEN',
      'T10.4.1 does not open export packages or public/private export semantics.'
    );
  }

  for (const field of SIDE_EFFECT_FIELDS) {
    if (request[field] != null) {
      issue(
        issues,
        'E_PHASE10_MARP_SIDE_EFFECT_FORBIDDEN',
        'MARP adapter inputs must not request writing, rendering, sharing, or packaging.',
        { field }
      );
    }
  }

  if (source.reviewed !== true) {
    issue(
      issues,
      'E_PHASE10_MARP_SOURCE_UNREVIEWED',
      'MARP presentations require reviewed compiled/query/R2 inputs.',
      { pageId: sourcePageId(request) }
    );
  }

  if (source.resolved !== true) {
    issue(
      issues,
      'E_PHASE10_MARP_SOURCE_UNRESOLVED',
      'MARP presentations require resolved compiled/query/R2 inputs.',
      { pageId: sourcePageId(request) }
    );
  }

  if (!nonEmptyString(badge)) {
    issue(
      issues,
      'E_PHASE10_MARP_BADGE_REQUIRED',
      'MARP presentations must carry a visible epistemic badge.',
      { pageId: sourcePageId(request) }
    );
  }

  if (classification === 'not-for-decision') {
    issue(
      issues,
      'E_PHASE10_MARP_NOT_FOR_DECISION',
      'Not-for-decision query sources cannot feed presentations.',
      { pageId: sourcePageId(request) }
    );
  }

  if (classification === 'informational') {
    if (!nonEmptyString(request.overrideReason)) {
      issue(
        issues,
        'E_PHASE10_MARP_INFORMATIONAL_REQUIRES_OVERRIDE',
        'Informational sources require an explicit local-view override reason.'
      );
    } else if (nonEmptyString(badge) && !isInformationalBadge(badge)) {
      issue(
        issues,
        'E_PHASE10_MARP_INFORMATIONAL_BADGE_REQUIRED',
        'Informational overrides require an informational or non-decision badge.',
        { badge }
      );
    }
  }

  if (presentationUse === 'r2-verdict') {
    const sections = request.r2Verdict?.sections ?? {};
    for (const section of REQUIRED_R2_VERDICT_SECTIONS) {
      if (!nonEmptyString(sections[section])) {
        issue(
          issues,
          'E_PHASE10_MARP_R2_SECTION_MISSING',
          'R2 verdict presentations require every adversarial section.',
          { section }
        );
      }
    }
  }

  if (
    presentationUse === 'hypothesis-discussion'
    && request.includeHypothesisPresentations === true
    && !nonEmptyString(request.includeHypothesisReason)
  ) {
    issue(
      issues,
      'E_PHASE10_MARP_HYPOTHESIS_REASON_REQUIRED',
      'Including hypothesis slides requires an explicit local discussion reason.'
    );
  }

  if (hasPresentationProvenanceRef(request)) {
    issue(
      issues,
      'E_PHASE10_PRESENTATION_NOT_PROVENANCE',
      'MARP presentation artifacts are views and must not be LAW 13 provenance.'
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    templateVersion: template?.sha256
  };
}

export async function buildPhase10MarpPresentation(request = {}, options = {}) {
  const validation = await validatePhase10MarpPresentationRequest(request, options);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const template = await loadTemplate(request.templateId, options);
  const badge = sourceBadge(request);
  const sections = request.r2Verdict?.sections ?? {};
  const body = request.presentationUse === 'r2-verdict'
    ? renderR2Sections(sections)
    : request.source?.contentMarkdown ?? '';

  const marpMarkdown = renderTemplate(template.content, {
    title: request.title,
    sourcePageId: sourcePageId(request),
    epistemicBadge: badge,
    presentationUse: request.presentationUse,
    templateVersion: template.sha256,
    body,
    generatedAt: request.createdAt ?? ''
  });

  return {
    ok: true,
    issues: [],
    presentation: {
      presentationId: request.presentationId,
      title: request.title,
      presentationUse: request.presentationUse,
      templateId: request.templateId,
      templateVersion: template.sha256,
      sourcePageId: sourcePageId(request),
      epistemicBadge: badge,
      viewOnly: true,
      provenanceArtifact: false,
      allowedUse: 'local-view-only',
      status: 'draft-local'
    },
    marpMarkdown
  };
}
