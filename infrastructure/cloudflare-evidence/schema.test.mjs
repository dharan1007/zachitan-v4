import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

function newDb(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 return db;
}
function issue(db,id='coinbase:BTC-USD:5m:1000:v2',target=1600){
 return db.prepare(`INSERT OR IGNORE INTO predictions (
 id,provider,symbol,interval,model_version,origin_time,expected_time,
 issued_at,source_json,raw_json,baseline_json,predicted_json,parameters_json,state
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')`).run(
  id,'coinbase','BTC-USD','5m','edge-5m-preopen-v2',1000,target,1300,
  '{"time":1000}','{"close":101}','{"close":100}',
  '{"open":100,"close":101}', '{"weight":0}');
}
test('schema enforces target two five-minute steps beyond source origin',()=>{
 const db=newDb();assert.throws(()=>issue(db,'wrong-horizon',1300));
 assert.equal(issue(db).changes,1);
 assert.equal(db.prepare('SELECT expected_time FROM predictions LIMIT 1').get().expected_time,1600);
 db.close();
});
test('retries cannot duplicate original issued predictions',()=>{
 const db=newDb();assert.equal(issue(db).changes,1);
 assert.equal(issue(db).changes,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n,1);
 db.close();
});
test('original source, forecast, issued clock and algorithm version cannot be rewritten',()=>{
 const db=newDb();issue(db);
 for(const [col,value] of [['predicted_json','{"close":9999}'],
  ['source_json','{"close":2}'],['issued_at',1400],['model_version','v999']]){
  assert.throws(()=>db.prepare('UPDATE predictions SET '+col+'=?').run(value),
   /Original as-issued forecast cannot be edited/);
 }
 db.close();
});
test('settlement can append genuine observed outcome without modifying issued prediction',()=>{
 const db=newDb();issue(db);
 db.prepare("UPDATE predictions SET state='SETTLED',observed_json=?,settled_at=? WHERE state='PENDING'")
  .run('{"close":105}',1900);
 const row=db.prepare('SELECT state,issued_at,predicted_json,observed_json,settled_at FROM predictions').get();
 assert.equal(row.state,'SETTLED');assert.equal(row.issued_at,1300);
 assert.equal(row.predicted_json,'{"open":100,"close":101}');
 assert.equal(row.observed_json,'{"close":105}');
 assert.equal(row.settled_at,1900);
 db.close();
});
test('settled state cannot contain a missing observation',()=>{
 const db=newDb();issue(db);
 assert.throws(()=>db.prepare("UPDATE predictions SET state='SETTLED' WHERE state='PENDING'").run());
 db.close();
});
