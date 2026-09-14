import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('markets page discloses untouched holdout and drift publication gates', () => {
  const page = readFileSync(new URL('../app/markets/page.js', import.meta.url), 'utf8');
  assert.match(page, /untouched holdout/i);
  assert.match(page, /drift/i);
  assert.match(page, /withheld|publish/i);
});
