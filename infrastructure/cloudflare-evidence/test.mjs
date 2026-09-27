import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateForecast,adaptForecast,summarizeIssued,targetPreopen,schedulerIsHealthy,settleExisting} from './src/index.mjs';
const fixture=(close=100,volume=1000)=>({time:1700000000,open:close*.998,close,high:close*1.01,low:close*.99,volume});
test('source-only candidate is coherent and cannot look at future candles',()=>{
 const prior=fixture(99),last=fixture(100);
 const before=candidateForecast(last,prior);
 assert.ok(before.high>=Math.max(before.open,before.close));
 assert.ok(before.low<=Math.min(before.open,before.close));
 const future=fixture(400);void future;
 assert.deepEqual(candidateForecast(last,prior),before);
});
test('no independently matured errors means baseline, not invented accuracy',()=>{
 const prior=fixture(99),last=fixture(100);
 const raw=candidateForecast(last,prior),base={open:100,high:101,low:99,close:100,volume:1000};
 const v=adaptForecast(raw,base,[]);
 for(const k of ['open','high','low','close','volume'])assert.equal(v.predicted[k],base[k]);
 assert.equal(summarizeIssued([]).byField.close.meanAbsolutePercent,null);
 assert.equal(summarizeIssued([]).byField.close.checks,0);
});
test('loss of confidence reduces model weight, never increases trust because of losses',()=>{
 const last=fixture(100),prior=fixture(99);
 const raw=candidateForecast(last,prior),base={open:100,high:101,low:99,close:100,volume:1000};
 const matured=Array.from({length:35},(_,i)=>({
  status:'SETTLED',
  raw_json:JSON.stringify(raw),
  baseline_json:JSON.stringify(base),
  observed_json:JSON.stringify({...base,open:100+Math.sin(i)*.001,close:100+Math.cos(i)*.001}),
 }));
 const a=adaptForecast(raw,base,matured);
 assert.equal(a.parameters.close.weight,0);
 assert.equal(a.predicted.close,base.close);
});
test('missing published volume remains unavailable throughout edge computation',()=>{
 const last=fixture(100,null),prior=fixture(99,null);
 const raw=candidateForecast(last,prior);
 assert.equal(raw.volume,null);
 const base={open:100,high:101,low:99,close:100,volume:null};
 assert.equal(adaptForecast(raw,base,[]).predicted.volume,null);
});
test('independent accuracy calculation uses only actually settled original predictions',()=>{
 const row=(state,actual)=>{
  const source={open:99,high:103,low:98,close:100,volume:10};
  return {status:state,source_json:JSON.stringify(source),
   raw_json:JSON.stringify(source),
   baseline_json:JSON.stringify({...source,close:100}),
   predicted_json:JSON.stringify({...source,close:110}),
   observed_json:actual?JSON.stringify({...source,close:100}):null};
 };
 const r=summarizeIssued([row('SETTLED',true),row('PENDING',false)]);
 assert.equal(r.settled,1);
 assert.equal(r.byField.close.checks,1);
 assert.ok(Math.abs(r.byField.close.meanAbsolutePercent-10)<1e-10);
});

test('next-open forecast must be actually issued before its target candle has begun',()=>{
 const origin={time:Date.parse('2026-09-27T11:55:00Z')/1000};
 const now=Date.parse('2026-09-27T12:01:00Z')/1000;
 const target=Date.parse('2026-09-27T12:05:00Z')/1000;
 assert.equal(targetPreopen(origin,now).expectedTime,target);
 assert.equal(targetPreopen(origin,now).canIssue,true);
 assert.equal(targetPreopen(origin,target).canIssue,false);
 assert.equal(targetPreopen(origin,target+1).canIssue,false);
 assert.equal(targetPreopen(origin,origin.time+300).canIssue,false);
});

test('a cron heartbeat without fresh publisher data never claims live accuracy tracking',()=>{
 const now=1000;
 const row={finished_at:900,tracked:2,fresh_sources:2,failures_json:'[]'};
 assert.equal(schedulerIsHealthy(row,now),true);
 assert.equal(schedulerIsHealthy({...row,fresh_sources:1},now),false);
 assert.equal(schedulerIsHealthy({...row,failures_json:'[{"symbol":"BTC-USD"}]'},now),false);
 assert.equal(schedulerIsHealthy({...row,finished_at:1},now),false);
 assert.equal(schedulerIsHealthy({...row,tracked:0,fresh_sources:0},now),false);
 assert.equal(schedulerIsHealthy(null,now),false);
});

function fakeEvidenceDb(pending){
 const record={statements:[],query:''};
 const DB={
  prepare(query){return {bind(...params){return {query,params,
   all:async()=>{record.query=query;return {results:pending};}
  };}}},
  async batch(statements){record.statements=statements;return statements.map(()=>({success:true,meta:{changes:1}}));}
 };
 return {DB,record};
}
test('a genuine next observed candle settles its original forecast with one atomic D1 batch',async()=>{
 const {DB,record}=fakeEvidenceDb([{id:'forecast-1',expected_time:1600,origin_time:1000}]);
 const result=await settleExisting({DB},'BTC-USD',[{time:1300},{time:1600,close:102},{time:1900}],2500);
 assert.equal(result.settled,1);assert.equal(result.gaps,0);
 assert.equal(record.statements.length,1);
 assert.match(record.statements[0].query,/SETTLED/);
 assert.equal(record.statements[0].params[2],'forecast-1');
 assert.match(record.query,/LIMIT 300/);
});
test('missing continuous-market slot is a source gap only when real surrounding candles bracket it',async()=>{
 const before=[{id:'missing-1',expected_time:1600,origin_time:1000}];
 const {DB,record}=fakeEvidenceDb(before);
 const result=await settleExisting({DB},'BTC-USD',[{time:1300},{time:1900}],2500);
 assert.equal(result.settled,0);assert.equal(result.gaps,1);
 assert.match(record.statements[0].query,/UNOBSERVED_GAP/);
});
test('a truncated publisher download must not be mislabeled as a missing market candle',async()=>{
 const {DB,record}=fakeEvidenceDb([{id:'too-old',expected_time:1600,origin_time:1000}]);
 const result=await settleExisting({DB},'BTC-USD',[{time:1900},{time:2200}],2800);
 assert.equal(result.settled,0);assert.equal(result.gaps,0);
 assert.equal(record.statements.length,0);
});
