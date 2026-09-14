import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');

test('production deploy workflow is release-version agnostic and verifies exact SHA', () => {
  assert.doesNotMatch(workflow, /5\.0\.0-beta\.2/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /EXPECTED_SHA|GITHUB_SHA/);
});

test('production deploy runs software, security and benchmark gates before promotion', () => {
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm audit[^\n]*audit-level=high/);
  assert.match(workflow, /npm run benchmark/);
  assert.match(workflow, /npm run smoke:production/);
});
