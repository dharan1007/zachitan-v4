import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTargetWithheldUnlessPublishable,
  validateHealth,
  validateExactSearch,
  validateYahooCapabilityMarket,
  validateCoinbaseMarket,
} from '../lib/production-smoke.mjs';

test('health smoke requires v6 and exact SHA when supplied', () => {
  const sha = 'a'.repeat(40);
  validateHealth({ ok:true, version:'6.0.0-beta.1', commitSha:sha }, sha);
  assert.throws(() => validateHealth({ ok:true, version:'6.0.0-beta.1', commitSha:sha }, 'b'.repeat(40)), /SHA/);
  assert.throws(() => validateHealth({ ok:true, version:'5.0.0-beta.2', commitSha:sha }, sha), /v6/);
});

test('exact search requires AAPL first', () => {
  validateExactSearch({ ok:true, results:[{symbol:'AAPL'}] });
  assert.throws(() => validateExactSearch({ ok:true, results:[{symbol:'AAPL.TO'}] }), /AAPL/);
});

test('non-publishable targets must be fully withheld', () => {
  assertTargetWithheldUnlessPublishable({ publication:{state:'ABSTAIN'}, forecast:{center:null,points:[{price:null}]} });
  assert.throws(() => assertTargetWithheldUnlessPublishable({ publication:{state:'RESEARCH_ONLY'}, forecast:{center:101,points:[]} }), /numeric center/);
});

test('Yahoo smoke requires v6 qualification and separates expected closures', () => {
  validateYahooCapabilityMarket({
    ok:true,
    provider:'yahoo',
    session:{state:'CLOSED',forecastAllowed:false},
    publication:{state:'ABSTAIN',qualificationState:'INSUFFICIENT'},
    qualification:{available:false,qualified:false,state:'INSUFFICIENT'},
    compute:{modelRows:700,displayRows:120,holdoutChecks:0},
    quality:{integrity:{largeGapCount:0,expectedClosureGapCount:18,status:'CLEAN'}},
    forecast:{center:null,points:[{price:null}]},
  });
});

test('Coinbase smoke requires OPEN session, v6 evidence history and qualification object', () => {
  validateCoinbaseMarket({
    ok:true,
    provider:'coinbase',
    quote:{previousClose:null},
    session:{state:'OPEN'},
    publication:{state:'ABSTAIN',qualificationState:'UNQUALIFIED'},
    qualification:{available:true,qualified:false,state:'UNQUALIFIED',checks:12,drift:{detected:true}},
    compute:{modelRows:840,displayRows:288,holdoutChecks:12,targetValidationRows:840},
    forecast:{center:null,points:[{price:null}]},
  });
  assert.throws(() => validateCoinbaseMarket({
    ok:true,
    provider:'coinbase',
    quote:{previousClose:100},
    session:{state:'OPEN'},
    publication:{state:'ABSTAIN',qualificationState:'UNQUALIFIED'},
    qualification:{available:true,qualified:false,state:'UNQUALIFIED'},
    compute:{modelRows:840,displayRows:288,holdoutChecks:12,targetValidationRows:840},
    forecast:{center:null,points:[]},
  }), /previous session close/);
});
