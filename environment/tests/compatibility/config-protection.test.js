import test from 'node:test';
import assert from 'node:assert/strict';

const PROTECTED_PATHS = [
  'skills/vibe/assets/schemas/claim.schema.json',
  'skills/vibe/assets/fault-taxonomy.yaml',
  'skills/vibe/assets/judge-rubric.yaml'
];

function isProtectedKernelPath(filePath) {
  return PROTECTED_PATHS.some((protectedPath) => filePath === protectedPath);
}

function classifyKernelWriteAttempt(filePath) {
  return isProtectedKernelPath(filePath) ? 'schema_modification_attempt' : null;
}

test('writes to protected kernel files are recognized as blocked attempts', () => {
  assert.equal(isProtectedKernelPath('skills/vibe/assets/fault-taxonomy.yaml'), true);
  assert.equal(
    classifyKernelWriteAttempt('skills/vibe/assets/judge-rubric.yaml'),
    'schema_modification_attempt'
  );
});

test('ordinary workspace paths are not treated as protected kernel files', () => {
  assert.equal(isProtectedKernelPath('.vibe-science-environment/flows/index.json'), false);
  assert.equal(classifyKernelWriteAttempt('environment/schemas/flow-index.schema.json'), null);
});
