import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterArticles,tokens} from '../lib/intelligence.mjs';

test('tokenizer removes common stop words',()=>{const t=tokens('The Federal Reserve cuts rates in the United States');assert.ok(t.includes('federal'));assert.ok(t.includes('reserve'));assert.ok(!t.includes('the'))});
test('news intelligence clusters near-duplicate headlines and reports source diversity',()=>{const d=clusterArticles([{title:'Federal Reserve cuts interest rates after meeting',url:'https://a.example/x',domain:'a.example'},{title:'Federal Reserve cuts rates after policy meeting',url:'https://b.example/y',domain:'b.example'},{title:'Gold rises on separate demand story',url:'https://c.example/z',domain:'c.example'}],'Federal Reserve rates');assert.equal(d.articles.length,3);assert.equal(d.sourceDiversity.uniqueSources,3);assert.ok(d.clusters.some(x=>x.sourceCount>=2&&x.corroborated))});
