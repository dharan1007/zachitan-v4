import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRecurring,xirr} from '../lib/sip.mjs';

function monthlySeries(months=36, growth=0.01){const out=[];let p=100;for(let i=0;i<months;i++){p*=1+growth;out.push({time:Date.UTC(2023+Math.floor(i/12),i%12,1)/1000,open:p,high:p,low:p,close:p,volume:0})}return out}

test('recurring simulation produces finite XIRR and cash-flow-independent drawdown',()=>{const s=simulateRecurring(monthlySeries(72,0.005),1000);assert.ok(s);assert.equal(s.purchases,72);assert.ok(Number.isFinite(s.irr));assert.equal(s.underlyingMaxDrawdown,0)});
test('underlying drawdown is not diluted by later contributions',()=>{const rows=monthlySeries(72,0);rows.forEach((x,i)=>{x.close=x.open=x.high=x.low=i<30?100:50});const s=simulateRecurring(rows,1000);assert.ok(s.underlyingMaxDrawdown<=-0.5)});
test('xirr rejects non-bracketed cash flow',()=>assert.equal(xirr([{date:0,value:1},{date:86400000,value:2}]),null));
