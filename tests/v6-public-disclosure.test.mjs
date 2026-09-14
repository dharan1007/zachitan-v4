import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('markets page discloses untouched holdout and drift publication gates', () => {
  const page = readFileSync(new URL('../app/markets/page.js', import.meta.url), 'utf8');
  assert.match(page, /untouched holdout/i);
  assert.match(page, /drift/i);
  assert.match(page, /withheld|publish/i);
});

test('methodology describes v6 frozen holdout and never promises fabricated exchange dates', () => {
  const page = readFileSync(new URL('../app/methodology/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /Zachitan v4/i);
  assert.match(page, /RELEASE_LINE/);
  assert.match(page, /untouched holdout/i);
  assert.match(page, /frozen/i);
  assert.match(page, /drift/i);
  assert.match(page, /not fabricate|not manufacturing|observation offsets/i);
});
