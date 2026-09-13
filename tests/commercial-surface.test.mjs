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

test('commercial workspace states BYOD, pricing, intake and research boundaries', () => {
  const page = read('app/commercial/page.js');
  assert.match(page, /customer-supplied/i);
  assert.match(page, /Data rights/i);
  assert.match(page, /No brokerage/i);
  assert.match(page, /₹2,999/);
  assert.match(page, /₹9,999/);
  assert.match(page, /tally\.so\/r\/OD6BP8/);
});

test('research builds fail closed instead of exposing paid commercial CTAs', () => {
  const page = read('app/commercial/page.js');
  const footer = read('app/components/Footer.js');
  assert.match(page, /notFound/);
  assert.match(page, /ZACHITAN_RUNTIME_MODE/);
  assert.match(page, /commercial/);
  assert.match(footer, /ZACHITAN_RUNTIME_MODE/);
  assert.match(footer, /commercialMode/);
});

test('data-rights page states customer responsibility', () => {
  const page = read('app/legal/data-rights/page.js');
  assert.match(page, /responsible/i);
  assert.match(page, /does not grant exchange, publisher or market-data licenses/i);
});

test('privacy notice discloses founding intake and avoids credential collection', () => {
  const page = read('app/legal/privacy/page.js');
  assert.match(page, /Tally form/i);
  assert.match(page, /Do not submit broker credentials/i);
  assert.match(page, /scope, data-rights fit/i);
});

test('terms distinguish intake request from an accepted paid order', () => {
  const page = read('app/legal/terms/page.js');
  assert.match(page, /request for scope review, not an automatic purchase/i);
  assert.match(page, /personalized buy\/sell\/hold/i);
  assert.match(page, /Customer-supplied data/i);
});

test('refund policy protects cancellation before bespoke work starts', () => {
  const page = read('app/legal/refunds/page.js');
  assert.match(page, /full refund/i);
  assert.match(page, /before bespoke analysis or workspace setup begins/i);
  assert.match(page, /Mandatory consumer rights/i);
});

test('environment example documents commercial mode and public-safe conversion overrides', () => {
  const env = read('.env.example');
  assert.match(env, /ZACHITAN_RUNTIME_MODE=research/);
  assert.match(env, /NEXT_PUBLIC_ZACHITAN_ONBOARDING_URL=/);
  assert.match(env, /zero-cost Tally founding-access form/i);
});
