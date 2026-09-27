import test from 'node:test';
import assert from 'node:assert/strict';
import {isActiveUnfinishedYahooBar} from '../lib/market-completion.mjs';
const at=s=>Date.parse(s)/1000;

test('NYSE active daily bar is excluded but the previous actual trading day is retained',()=>{
 const p={nowSeconds:at('2026-09-28T14:10:00Z'),interval:'1d',timezone:'America/New_York',marketState:'REGULAR'};
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-28T13:30:00Z')}),true);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-25T13:30:00Z')}),false);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-28T13:30:00Z'),marketState:'CLOSED'}),false);
});

test('active weekly bar respects Mumbai local week at a UTC Sunday/Monday boundary',()=>{
 const p={nowSeconds:at('2026-09-28T05:30:00Z'),interval:'1wk',timezone:'Asia/Kolkata',marketState:'REGULAR'};
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-27T18:40:00Z')}),true);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-25T05:30:00Z')}),false);
});

test('weekly candle is not excluded after the actual exchange session is closed',()=>{
 const p={nowSeconds:at('2026-09-27T12:00:00Z'),interval:'1wk',timezone:'America/New_York',marketState:'CLOSED'};
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-21T13:30:00Z')}),false);
});

test('invalid timestamps or non-daily source intervals never fabricate completed-period signals',()=>{
 const p={nowSeconds:at('2026-09-28T14:10:00Z'),interval:'1d',timezone:'America/New_York',marketState:'REGULAR'};
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:Number.NaN}),false);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:1e99}),false);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-28T13:30:00Z'),interval:'5m'}),false);
 assert.equal(isActiveUnfinishedYahooBar({...p,barTime:at('2026-09-28T13:30:00Z'),timezone:'Bad/Fake'}),false);
});
