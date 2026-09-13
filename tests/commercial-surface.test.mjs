import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('commercial build blocks the general provider API route', () => {
  const config = read('next.config.mjs');
  assert.match(config, /ZACHITAN_RUNTIME_MODE/);
  assert.match(config, /source:\s*['"]\/api\/data['"]/);
  assert.match(config, /destination:\s*['"]\/api\/commercial-blocked['"]/);
});

test('commercial workspace states the BYOD and research boundary', () => {
  const page = read('app/commercial/page.js');
  assert.match(page, /customer-supplied/i);
  assert.match(page, /Data rights/i);
  assert.match(page, /No brokerage/i);
  assert.match(page, /₹2,999/);
  assert.match(page, /₹9,999/);
});

test('data-rights page states customer responsibility', () => {
  const page = read('app/legal/data-rights/page.js');
  assert.match(page, /responsible/i);
  assert.match(page, /does not grant exchange, publisher or market-data licenses/i);
});

test('environment example documents the commercial mode', () => {
  const env = read('.env.example');
  assert.match(env, /ZACHITAN_RUNTIME_MODE=research/);
  assert.match(env, /NEXT_PUBLIC_ZACHITAN_ONBOARDING_URL=/);
});
