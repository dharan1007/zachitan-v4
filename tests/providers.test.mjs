import test from 'node:test';
import assert from 'node:assert/strict';
import * as cb from '../lib/providers/coinbase.mjs';
import * as yf from '../lib/providers/yahoo.mjs';
import * as amfi from '../lib/providers/amfi.mjs';
import * as ecb from '../lib/providers/ecb.mjs';
import { verifyProviderContracts } from '../lib/provider-contracts.mjs';
import { cachedFetchJson, cachedFetchText, provenance } from '../lib/http.mjs';

test('all market providers satisfy the dispatcher contract at module load', () => {
  assert.equal(verifyProviderContracts({ coinbase: cb, yahoo: yf, amfi, ecb }), true);
});

test('HTTP compatibility exports exist so adapters cannot break module loading', () => {
  assert.equal(typeof cachedFetchJson, 'function');
  assert.equal(typeof cachedFetchText, 'function');
  assert.deepEqual(provenance({ provider: 'x', family: 'y' }), { provider: 'x', family: 'y', endpoint: null, rights: '', cadence: '', synthetic: false });
});
