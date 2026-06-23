const GUARDRAIL_SCHEMA_VERSION =
  'phase14.tl0.5-guardrail-controller.v1';

// Hermes MIT provenance:
// audit_runs/hermes_agent_0603b/_clone/nousresearch_hermes-agent/
// agent/tool_dispatch_helpers.py:62-87 and :75-76.
const DESTRUCTIVE_COMMAND_PATTERN = new RegExp([
  '(?:^|\\s|&&|\\|\\||;|`)',
  '(?:rm\\s|rmdir\\s|cp\\s|install\\s|mv\\s|sed\\s+-i|',
  'truncate\\s|dd\\s|shred\\s|git\\s+(?:reset|clean|checkout)\\s)'
].join(''), 'u');
const REDIRECT_OVERWRITE_PATTERN = /[^>]>[^>]|^>[^>]/u;

// Hermes MIT provenance:
// agent/tool_dispatch_helpers.py:351-369.
const UNTRUSTED_TOOL_NAMES = Object.freeze(new Set([
  'web_extract',
  'web_search'
]));

const UNTRUSTED_TOOL_PREFIXES = Object.freeze([
  'browser_',
  'mcp_'
]);

// Hermes MIT provenance:
// agent/tool_dispatch_helpers.py:41 and :103-110.
const NEVER_PARALLEL_TOOLS = Object.freeze(new Set([
  'clarify'
]));

function normalizeToolName(toolName) {
  return typeof toolName === 'string' ? toolName.trim() : '';
}

function getCommand(args = {}) {
  if (typeof args?.command === 'string') {
    return args.command;
  }
  if (typeof args?.cmd === 'string') {
    return args.cmd;
  }
  if (typeof args?.input === 'string') {
    return args.input;
  }
  return '';
}

function decision({
  action = 'allow',
  code = 'allow',
  message = '',
  toolName = '',
  source = null,
  details = {}
} = {}) {
  return {
    ok: action === 'allow',
    schemaVersion: GUARDRAIL_SCHEMA_VERSION,
    action,
    code,
    message,
    toolName,
    allowsExecution: action === 'allow',
    runtimeOpened: false,
    autonomousRuntimeAllowed: false,
    source,
    details
  };
}

function isDestructiveCommand(toolName, args) {
  if (!['terminal', 'bash', 'shell', 'powershell'].includes(toolName)) {
    return false;
  }
  const command = getCommand(args);
  if (!command) {
    return false;
  }
  return DESTRUCTIVE_COMMAND_PATTERN.test(command)
    || REDIRECT_OVERWRITE_PATTERN.test(command);
}

function isUntrustedToolName(toolName) {
  if (!toolName) {
    return false;
  }
  if (UNTRUSTED_TOOL_NAMES.has(toolName)) {
    return true;
  }
  return UNTRUSTED_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

function hasReviewedDataTreatment(intent = {}) {
  return intent.reviewedDataTreatment === true
    || intent.treatsResultAsData === true
    || intent.resultTreatment === 'data';
}

export function evaluateL0GuardrailIntent(intent = {}) {
  const toolName = normalizeToolName(intent.toolName);

  if (isDestructiveCommand(toolName, intent.args)) {
    return decision({
      action: 'block',
      code: 'E_L0_GUARDRAIL_DESTRUCTIVE_TOOL_INTENT',
      message: 'TL0.5 guardrail blocked a destructive or overwriting tool intent before execution.',
      toolName,
      source: 'hermes-agent agent/tool_dispatch_helpers.py:62-87'
    });
  }

  if (isUntrustedToolName(toolName) && !hasReviewedDataTreatment(intent)) {
    return decision({
      action: 'block',
      code: 'E_L0_GUARDRAIL_UNTRUSTED_TOOL_INTENT',
      message: 'TL0.5 guardrail blocked an untrusted tool intent without reviewed data-treatment metadata.',
      toolName,
      source: 'hermes-agent agent/tool_dispatch_helpers.py:351-369'
    });
  }

  return decision({
    toolName,
    code: isUntrustedToolName(toolName)
      ? 'allow-reviewed-untrusted-data'
      : 'allow',
    source: 'hermes-agent agent/tool_guardrails.py:145-173'
  });
}

export function evaluateL0GuardrailBatch(intents = []) {
  const normalizedIntents = Array.isArray(intents) ? intents : [];
  if (normalizedIntents.length > 1) {
    const blockedTool = normalizedIntents
      .map((intent) => normalizeToolName(intent?.toolName))
      .find((toolName) => NEVER_PARALLEL_TOOLS.has(toolName));

    if (blockedTool) {
      return decision({
        action: 'block',
        code: 'E_L0_GUARDRAIL_NEVER_PARALLEL_TOOL_BATCH',
        message: 'TL0.5 guardrail blocked a never-parallel tool inside a batch.',
        toolName: blockedTool,
        source: 'hermes-agent agent/tool_dispatch_helpers.py:41,103-110'
      });
    }
  }

  for (const intent of normalizedIntents) {
    const intentDecision = evaluateL0GuardrailIntent(intent);
    if (!intentDecision.allowsExecution) {
      return intentDecision;
    }
  }

  return decision({
    details: { intentCount: normalizedIntents.length },
    source: 'hermes-agent agent/tool_guardrails.py:145-173'
  });
}

export function evaluateL0GuardrailForAction(action = {}, context = {}) {
  if (context.tier !== 'worker') {
    return decision({
      details: { skipped: 'non-worker-tier' }
    });
  }

  if (Array.isArray(action.toolIntents)) {
    return evaluateL0GuardrailBatch(action.toolIntents);
  }

  if (action.toolIntent) {
    return evaluateL0GuardrailIntent(action.toolIntent);
  }

  return decision({
    details: { skipped: 'no-tool-intent' }
  });
}

export {
  GUARDRAIL_SCHEMA_VERSION,
  NEVER_PARALLEL_TOOLS,
  UNTRUSTED_TOOL_NAMES
};
