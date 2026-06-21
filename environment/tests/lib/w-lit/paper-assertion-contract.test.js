import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vreRoot = path.resolve(__dirname, '..', '..', '..', '..');
const contractPath = path.resolve(
  vreRoot,
  '..',
  'vibe-science',
  'blueprints',
  'private',
  'phase14-world-class-vre',
  'w-lit-paper-assertion-contract.md'
);

const requiredRules = [
  {
    code: 'E_W_LIT_CONTRACT_KIND_ENUM',
    pattern: /^paperAssertion\.kind MUST be exactly one of: claim, method, confounder\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_CITES_NON_EMPTY',
    pattern: /^paperAssertion\.cites MUST be a non-empty array\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_CITES_RAW_DATA',
    pattern: /^Every cites\[\] entry MUST resolve to a raw\/ or data\/ path\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_LAW13_ONLY',
    pattern:
      /^Every cites\[\] entry MUST be a LAW 13 citation and MUST NOT resolve to wiki\/, query\/, chat\/, review\/, or generated summaries\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_PHASE12_PROPOSALS_ONLY',
    pattern: /^contradicts\/supports edge outputs MUST be Phase 12 proposals only\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_PROPOSAL_LEDGER_WRITE',
    pattern: /^contradicts\/supports proposals MUST NOT be written to the claim ledger by TW-LIT\.1\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_CREATE_CLAIM_EDGE',
    pattern: /^The contract MUST NOT call createClaimEdge\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_DIRECT_CLAIM_LEDGER_WRITE',
    pattern: /^The contract MUST NOT write the claim-ledger directly\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_VECTOR_DB',
    pattern: /^The contract MUST NOT use a vector database\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_EMBEDDING_STORE',
    pattern: /^The contract MUST NOT use an embedding store\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_NO_CLAIM_PROMOTION',
    pattern: /^TW-LIT\.1 MUST NOT promote paper assertions into claims\.$/m
  },
  {
    code: 'E_W_LIT_CONTRACT_RUNTIME_CLOSED',
    pattern: /^paperAssertion outputs MUST carry runtimeOpened: false\.$/m
  }
];

const forbiddenRules = [
  {
    code: 'E_W_LIT_CONTRACT_ALLOWS_CREATE_CLAIM_EDGE',
    pattern: /\bMAY\s+call\s+createClaimEdge\b/i
  },
  {
    code: 'E_W_LIT_CONTRACT_ALLOWS_DIRECT_CLAIM_LEDGER_WRITE',
    pattern: /\bMAY\s+write\s+the\s+claim-ledger\s+directly\b/i
  },
  {
    code: 'E_W_LIT_CONTRACT_ALLOWS_VECTOR_DB',
    pattern: /\bMAY\s+use\s+a\s+vector\s+database\b/i
  },
  {
    code: 'E_W_LIT_CONTRACT_ALLOWS_EMBEDDING_STORE',
    pattern: /\bMAY\s+use\s+an\s+embedding\s+store\b/i
  },
  {
    code: 'E_W_LIT_CONTRACT_ALLOWS_PROPOSAL_LEDGER_WRITE',
    pattern: /contradicts\/supports[\s\S]{0,120}\bMAY\s+write[\s\S]{0,80}\bclaim ledger\b/i
  }
];

const validContractFixture = [
  'paperAssertion.kind MUST be exactly one of: claim, method, confounder.',
  'paperAssertion.cites MUST be a non-empty array.',
  'Every cites[] entry MUST resolve to a raw/ or data/ path.',
  'Every cites[] entry MUST be a LAW 13 citation and MUST NOT resolve to wiki/, query/, chat/, review/, or generated summaries.',
  'contradicts/supports edge outputs MUST be Phase 12 proposals only.',
  'contradicts/supports proposals MUST NOT be written to the claim ledger by TW-LIT.1.',
  'The contract MUST NOT call createClaimEdge.',
  'The contract MUST NOT write the claim-ledger directly.',
  'The contract MUST NOT use a vector database.',
  'The contract MUST NOT use an embedding store.',
  'TW-LIT.1 MUST NOT promote paper assertions into claims.',
  'paperAssertion outputs MUST carry runtimeOpened: false.'
].join('\n');

function validatePaperAssertionContract(text) {
  for (const rule of requiredRules) {
    if (!rule.pattern.test(text)) {
      throw new Error(rule.code);
    }
  }

  for (const rule of forbiddenRules) {
    if (rule.pattern.test(text)) {
      throw new Error(rule.code);
    }
  }
}

function readContractOrSkip(t) {
  if (fs.existsSync(contractPath)) {
    return fs.readFileSync(contractPath, 'utf8');
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip(
      'SKIP_W_LIT_CONTRACT_MISSING: private sibling vibe-science contract absent in VRE-only CI checkout'
    );
    return null;
  }

  assert.fail(`Missing W-LIT paper assertion contract at ${contractPath}`);
}

test('W-LIT paper assertion contract is present and guarded', (t) => {
  const contractText = readContractOrSkip(t);
  if (contractText === null) {
    return;
  }

  validatePaperAssertionContract(contractText);
});

test('contract guard accepts the complete reviewed rule set', () => {
  assert.doesNotThrow(() => validatePaperAssertionContract(validContractFixture));
});

test('contract guard rejects missing required rules', () => {
  for (const rule of requiredRules) {
    const mutatedContract = validContractFixture.replace(rule.pattern, '');
    assert.throws(
      () => validatePaperAssertionContract(mutatedContract),
      { message: rule.code },
      `expected ${rule.code} for missing rule`
    );
  }
});

test('contract guard rejects permissive claim-ledger and vector language', () => {
  const mutations = [
    {
      text: `${validContractFixture}\nThe contract MAY call createClaimEdge.`,
      code: 'E_W_LIT_CONTRACT_ALLOWS_CREATE_CLAIM_EDGE'
    },
    {
      text: `${validContractFixture}\nThe contract MAY write the claim-ledger directly.`,
      code: 'E_W_LIT_CONTRACT_ALLOWS_DIRECT_CLAIM_LEDGER_WRITE'
    },
    {
      text: `${validContractFixture}\nThe contract MAY use a vector database.`,
      code: 'E_W_LIT_CONTRACT_ALLOWS_VECTOR_DB'
    },
    {
      text: `${validContractFixture}\nThe contract MAY use an embedding store.`,
      code: 'E_W_LIT_CONTRACT_ALLOWS_EMBEDDING_STORE'
    },
    {
      text: `${validContractFixture}\ncontradicts/supports proposals MAY write into the claim ledger.`,
      code: 'E_W_LIT_CONTRACT_ALLOWS_PROPOSAL_LEDGER_WRITE'
    }
  ];

  for (const mutation of mutations) {
    assert.throws(
      () => validatePaperAssertionContract(mutation.text),
      { message: mutation.code },
      `expected ${mutation.code}`
    );
  }
});
