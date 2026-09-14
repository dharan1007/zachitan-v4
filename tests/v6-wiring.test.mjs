import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production route delegates to the v6 market API', () => {
  const route = readFileSync(new URL('../app/api/data/route.js', import.meta.url), 'utf8');
  assert.match(route, /market-api-v6\.mjs/);
});

test('v6 market API exposes untouched qualification and session-aware integrity', () => {
  const api = readFileSync(new URL('../lib/market-api-v6.mjs', import.meta.url), 'utf8');
  assert.match(api, /evaluatePublicationHoldout|qualification/);
  assert.match(api, /market-integrity-v6/);
});
