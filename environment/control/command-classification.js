import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  DISPATCH_TABLE,
  IMPLEMENTED_PHASE9_COMMANDS
} from '../../bin/vre';

export const COMMAND_CLASSIFICATION_SCHEMA_VERSION =
  'phase14.command-classification.v1';
export const COMMAND_CLASSIFICATION_SCHEMA_FILE =
  'command-classification.schema.json';

export class CommandClassificationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'CommandClassificationError';
    this.code = code;
    this.details = details;
  }
}

export const DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS = Object.freeze({});

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function normalizeCommandName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CommandClassificationError(
      'E_COMMAND_NAME_INVALID',
      'command names must be non-empty strings',
      { value }
    );
  }
  return value.trim();
}

function assertNoDuplicates(values, code, label) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.push(value);
    }
    seen.add(value);
  }
  if (duplicates.length > 0) {
    throw new CommandClassificationError(
      code,
      `${label} contains duplicate command names`,
      { duplicates: uniqueSorted(duplicates) }
    );
  }
}

function contractPathFor(commandName) {
  return `commands/${commandName}.md`;
}

function normalizeReviewedContracts(reviewedContracts) {
  if (reviewedContracts instanceof Map) {
    return new Map(
      [...reviewedContracts.entries()].map(([commandName, contractPath]) => [
        normalizeCommandName(commandName),
        String(contractPath)
      ])
    );
  }

  if (Array.isArray(reviewedContracts)) {
    return new Map(
      reviewedContracts.map((commandName) => {
        const normalized = normalizeCommandName(commandName);
        return [normalized, contractPathFor(normalized)];
      })
    );
  }

  throw new CommandClassificationError(
    'E_REVIEWED_CONTRACTS_INVALID',
    'reviewedContracts must be an array or Map'
  );
}

export function getLiveExecutableCommands({
  dispatchTable = DISPATCH_TABLE,
  implementedPhase9Commands = IMPLEMENTED_PHASE9_COMMANDS
} = {}) {
  const dispatchCommands = Object.keys(dispatchTable ?? {});
  const implementedCommands = Array.isArray(implementedPhase9Commands)
    ? implementedPhase9Commands
    : [];
  const normalized = [...dispatchCommands, ...implementedCommands].map(
    normalizeCommandName
  );
  return uniqueSorted(normalized);
}

export async function discoverMarkdownCommandContracts({
  rootDir = process.cwd(),
  commandsDir = path.join(rootDir, 'commands')
} = {}) {
  let entries;
  try {
    entries = await readdir(commandsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }

  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  const contracts = new Map();
  for (const fileName of markdownFiles) {
    const commandName = normalizeCommandName(fileName.slice(0, -'.md'.length));
    contracts.set(commandName, `commands/${fileName}`);
  }
  return contracts;
}

export function buildCommandClassificationManifest({
  executableCommands = getLiveExecutableCommands(),
  reviewedContracts,
  explicitClassifications = DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS
} = {}) {
  const normalizedExecutables = executableCommands.map(normalizeCommandName);
  assertNoDuplicates(
    normalizedExecutables,
    'E_DUPLICATE_EXECUTABLE_COMMAND',
    'executableCommands'
  );

  const contractMap = normalizeReviewedContracts(reviewedContracts);
  const executableSet = new Set(normalizedExecutables);
  const reviewedExecutableContracts = [...contractMap.keys()].filter((command) =>
    executableSet.has(command)
  );
  const markdownOnlyContracts = [...contractMap.keys()].filter(
    (command) => !executableSet.has(command)
  );

  const records = normalizedExecutables.sort().map((commandName) => {
    const contractPath = contractMap.get(commandName);
    if (contractPath != null) {
      const explicit = explicitClassifications[commandName];
      if (explicit != null && explicit.classification !== 'reviewed') {
        throw new CommandClassificationError(
          'E_REVIEWED_COMMAND_CONFLICT',
          'a command with a reviewed contract cannot be classified as internal or deprecated',
          { commandName, classification: explicit.classification }
        );
      }
      return {
        command: commandName,
        classification: 'reviewed',
        contractPath,
        reason: null,
        runtimeOpened: false
      };
    }

    const explicit = explicitClassifications[commandName];
    if (explicit == null) {
      throw new CommandClassificationError(
        'E_UNCLASSIFIED_OPERATOR_COMMAND',
        'executable command without a reviewed contract needs an explicit classification',
        { commandName }
      );
    }

    const classification = explicit.classification;
    if (!['internal', 'deprecated', 'reviewed'].includes(classification)) {
      throw new CommandClassificationError(
        'E_COMMAND_CLASSIFICATION_INVALID',
        'classification must be reviewed, internal, or deprecated',
        { commandName, classification }
      );
    }
    if (classification === 'reviewed') {
      throw new CommandClassificationError(
        'E_REVIEWED_COMMAND_CONTRACT_MISSING',
        'reviewed classification requires a markdown contract',
        { commandName }
      );
    }
    if (typeof explicit.reason !== 'string' || explicit.reason.trim() === '') {
      throw new CommandClassificationError(
        'E_COMMAND_CLASSIFICATION_REASON_REQUIRED',
        'internal and deprecated classifications require a non-empty reason',
        { commandName, classification }
      );
    }

    return {
      command: commandName,
      classification,
      contractPath: null,
      reason: explicit.reason.trim(),
      runtimeOpened: false
    };
  });

  assertNoDuplicates(
    records.map((record) => record.command),
    'E_DUPLICATE_CLASSIFICATION_RECORD',
    'classification records'
  );
  if (records.length !== normalizedExecutables.length) {
    throw new CommandClassificationError(
      'E_COMMAND_CLASSIFICATION_CARDINALITY_MISMATCH',
      'classifier must emit exactly one record per live executable command',
      {
        executableCommandCount: normalizedExecutables.length,
        recordCount: records.length
      }
    );
  }

  return {
    schemaVersion: COMMAND_CLASSIFICATION_SCHEMA_VERSION,
    runtimeOpened: false,
    source: {
      executableCommandSource: 'bin/vre metadata',
      markdownContractSource: 'commands/*.md',
      executableCommandCount: normalizedExecutables.length,
      markdownContractCount: contractMap.size,
      reviewedExecutableContractCount: reviewedExecutableContracts.length,
      markdownOnlyContractCount: markdownOnlyContracts.length
    },
    records
  };
}

export async function buildLiveCommandClassificationManifest({
  rootDir = process.cwd(),
  explicitClassifications = DEFAULT_EXPLICIT_COMMAND_CLASSIFICATIONS
} = {}) {
  const reviewedContracts = await discoverMarkdownCommandContracts({ rootDir });
  return buildCommandClassificationManifest({
    executableCommands: getLiveExecutableCommands(),
    reviewedContracts,
    explicitClassifications
  });
}
