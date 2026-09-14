import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASE_VERSION, RELEASE_BADGE, RELEASE_LINE } from '../lib/release.mjs';

test('release constants identify the deployed v6 beta line', () => {
  assert.equal(RELEASE_VERSION, '6.0.0-beta.1');
  assert.equal(RELEASE_BADGE, 'V6 BETA');
  assert.equal(RELEASE_LINE, 'v6');
});

test('public shell, metadata and homepage derive branding from release constants', () => {
  const shell = readFileSync(new URL('../app/components/Shell.js', import.meta.url), 'utf8');
  const footer = readFileSync(new URL('../app/components/Footer.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../app/layout.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /V[45] BETA/i);
  assert.doesNotMatch(footer, /Zachitan v[45]/i);
  assert.doesNotMatch(layout, /Zachitan v[45]/i);
  assert.doesNotMatch(home, /Zachitan v[45]/i);
  assert.match(shell, /RELEASE_BADGE/);
  assert.match(footer, /RELEASE_VERSION/);
  assert.match(layout, /RELEASE_LINE/);
  assert.match(home, /RELEASE_LINE/);
});
