const STOP = new Set(['the','a','an','and','or','of','to','in','on','for','with','as','at','by','from','is','are','was','were','be','this','that','after','before','about','amid','says','say']);

export function tokens(text='') {
  return [...new Set(String(text).toLowerCase().replace(/[^a-z0-9\s.-]/g,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x)))];
}

function jaccard(a,b){
  const A=new Set(a),B=new Set(b);
  if(!A.size&&!B.size)return 1;
  let n=0;for(const x of A)if(B.has(x))n++;
  return n/Math.max(1,A.size+B.size-n);
}

function domainOf(article){
  if(article?.domain)return String(article.domain).toLowerCase().replace(/^www\./,'');
  try{return new URL(article?.url).hostname.toLowerCase().replace(/^www\./,'')}catch{return article?.provider||'unknown'}
}

export function clusterArticles(articles=[],query=''){
  const q=tokens(query),dedup=[],seen=new Set();
  for(const raw of articles){
    if(!raw?.title||!raw?.url)continue;
    const key=`${String(raw.title).toLowerCase().replace(/\s+/g,' ').trim()}|${raw.url}`;
    if(seen.has(key))continue;seen.add(key);
    const t=tokens(raw.title),relevance=q.length?jaccard(t,q):null;
    dedup.push({...raw,domain:domainOf(raw),titleTokens:t,relevanceScore:relevance});
  }
  const clusters=[];
  for(const article of dedup){
    let best=null,bestScore=0;
    for(const c of clusters){const s=jaccard(article.titleTokens,c.tokenUnion);if(s>bestScore){best=c;bestScore=s}}
    if(best&&bestScore>=0.58){best.articles.push(article);best.sources.add(article.domain);best.tokenUnion=[...new Set([...best.tokenUnion,...article.titleTokens])];}
    else clusters.push({articles:[article],sources:new Set([article.domain]),tokenUnion:[...article.titleTokens]});
  }
  const normalized=clusters.map((c,i)=>({
    id:`story-${i+1}`,
    title:c.articles[0].title,
    representativeUrl:c.articles[0].url,
    articleCount:c.articles.length,
    sourceCount:c.sources.size,
    sources:[...c.sources],
    corroborated:c.sources.size>=2,
    maxRelevance:c.articles.reduce((m,a)=>Math.max(m,a.relevanceScore??0),0),
  })).sort((a,b)=>b.sourceCount-a.sourceCount||b.articleCount-a.articleCount||b.maxRelevance-a.maxRelevance);
  const domains=new Set(dedup.map(domainOf));
  return {articles:dedup.map(({titleTokens,...x})=>x),clusters:normalized,sourceDiversity:{uniqueSources:domains.size,articleCount:dedup.length,ratio:dedup.length?domains.size/dedup.length:0}};
}
