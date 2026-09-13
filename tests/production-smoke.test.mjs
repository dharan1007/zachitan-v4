import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTargetWithheldUnlessPublishable,
  validateHealth,
  validateExactSearch,
  validateYahooCapabilityMarket,
  validateCoinbaseMarket,
} from '../lib/production-smoke.mjs';

test('health smoke requires v5 and exact SHA when supplied', () => {
  const sha = 'a'.repeat(40);
  validateHealth({ ok:true, version:'5.0.0-beta.2', commitSha:sha }, sha);
  assert.throws(() => validateHealth({ ok:true, version:'5.0.0-beta.2', commitSha:sha }, 'b'.repeat(40)), /SHA/);
});

test('exact search requires AAPL first', () => {
  validateExactSearch({ ok:true, results:[{symbol:'AAPL'}] });
  assert.throws(() => validateExactSearch({ ok:true, results:[{symbol:'AAPL.TO'}] }), /AAPL/);
});

test('non-publishable targets must be fully withheld', () => {
  assertTargetWithheldUnlessPublishable({ publication:{state:'ABSTAIN'}, forecast:{center:null,points:[{price:null}]} });
  assert.throws(() => assertTargetWithheldUnlessPublishable({ publication:{state:'RESEARCH_ONLY'}, forecast:{center:101,points:[]} }), /numeric center/);
});

test('Yahoo closed session cannot publish and model history covers display history', () => {
  validateYahooCapabilityMarket({
    ok:true, provider:'yahoo', session:{state:'CLOSED',forecastAllowed:false}, publication:{state:'ABSTAIN'},
    compute:{modelRows:480,displayRows:120}, forecast:{center:null,points:[{price:null}]},
  });
});

test('Coinbase smoke requires OPEN session, null previous session close and evidence history', () => {
  validateCoinbaseMarket({
    ok:true, provider:'coinbase', quote:{previousClose:null}, session:{state:'OPEN'}, publication:{state:'ABSTAIN'},
    compute:{modelRows:480,displayRows:288}, forecast:{center:null,points:[{price:null}]},
  });
  assert.throws(() => validateCoinbaseMarket({
    ok:true, provider:'coinbase', quote:{previousClose:100}, session:{state:'OPEN'}, publication:{state:'ABSTAIN'},
    compute:{modelRows:480,displayRows:288}, forecast:{center:null,points:[]},
  }), /previous session close/);
});
