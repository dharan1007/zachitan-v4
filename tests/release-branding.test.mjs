import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASE_VERSION, RELEASE_BADGE } from '../lib/release.mjs';

test('release constants identify the deployed v5 beta line', () => {
  assert.equal(RELEASE_VERSION, '5.0.0-beta.2');
  assert.equal(RELEASE_BADGE, 'V5 BETA');
});

test('public shell, metadata and homepage do not ship stale v4 branding', () => {
  const shell = readFileSync(new URL('../app/components/Shell.js', import.meta.url), 'utf8');
  const footer = readFileSync(new URL('../app/components/Footer.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../app/layout.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /V4 BETA/i);
  assert.doesNotMatch(footer, /Zachitan v4/i);
  assert.doesNotMatch(layout, /Zachitan v4/i);
  assert.doesNotMatch(home, /Zachitan v4/i);
  assert.match(shell, /RELEASE_BADGE/);
  assert.match(footer, /RELEASE_VERSION/);
  assert.match(layout, /RELEASE_LINE/);
  assert.match(home, /RELEASE_LINE/);
});
