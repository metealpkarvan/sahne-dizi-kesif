/* Content similarity, not a probability of liking a show. No network or tracking. */
const TasteEngine = (() => {
  const weights = { dislike: -1.5, like: 1, love: 2 };
  const themes = {
    44933:['identity','conspiracy','psychology','dystopia','puzzle'],
    17861:['puzzle','family','secrets','time','conspiracy'],
    54198:['family','work','relationships','ambition','grief'],
    37336:['politics','power','culture','strategy'],
    16149:['relationships','grief','identity','humor'],
    30770:['history','institutions','disaster','politics'],
    23470:['family','power','ambition','politics','humor'],
    46562:['survival','relationships','grief','dystopia'],
    335:['investigation','puzzle','friendship','psychology'],
    44458:['friendship','work','relationships','humor'],
    305:['dystopia','technology','psychology','identity'],
    10822:['investigation','psychology','crime','institutions']
  };
  function validRatings(raw, catalog) {
    const result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    for (const s of catalog) if (Object.hasOwn(weights,raw[s.id])) result[s.id]=raw[s.id];
    return result;
  }
  function similarity(a,b,catalog) {
    const ga=new Set(a.genres), gb=new Set(b.genres);
    let shared=0,total=0;
    for(const g of new Set([...ga,...gb])) {
      // Common genres such as Drama carry less information.
      const idf=1+Math.log((catalog.length+1)/(1+catalog.filter(s=>s.genres.includes(g)).length));
      total+=idf;if(ga.has(g)&&gb.has(g))shared+=idf;
    }
    const ta=themes[a.id]||[],tb=themes[b.id]||[];
    const union=new Set([...ta,...tb]).size;
    const topic=union?ta.filter(t=>tb.includes(t)).length/union:0;
    const duration=a.runtime&&b.runtime?Math.max(0,1-Math.abs(a.runtime-b.runtime)/60):0;
    return .45*(total?shared/total:0)+.3*topic+.2*(a.mood!=='search'&&a.mood===b.mood?1:0)+.05*duration;
  }
  function score(candidate,catalog,ratings) {
    let sum=0,weight=0;
    for(const source of catalog) {
      const w=weights[ratings[source.id]];
      if(w===undefined||source.id===candidate.id)continue;
      sum+=w*similarity(candidate,source,catalog);weight+=Math.abs(w);
    }
    return sum/(weight+1); // Shrink sparse profiles toward neutral.
  }
  function rank(items,catalog,ratings) {
    return items.map((s,index)=>({s,index,score:score(s,catalog,ratings)}))
      .sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.s);
  }
  function recommend(items,catalog,ratings,saved) {
    return rank(items.filter(s=>!ratings[s.id]&&!['watching','done'].includes(saved[s.id])),catalog,ratings);
  }
  function explanation(s,catalog,ratings) {
    const positives=catalog.filter(x=>weights[ratings[x.id]]>0&&x.id!==s.id)
      .map(x=>({source:x,affinity:similarity(s,x,catalog),contribution:weights[ratings[x.id]]*similarity(s,x,catalog)}))
      .sort((a,b)=>b.contribution-a.contribution);
    const best=positives[0];
    if(best&&best.affinity>=.22&&score(s,catalog,ratings)>0) {
      const same=s.genres.filter(g=>best.source.genres.includes(g));
      return {kind:'match',source:best.source.name,reaction:ratings[best.source.id],genres:same,sameMood:s.mood===best.source.mood};
    }
    return {kind:Object.keys(ratings).length?'explore':'editor'};
  }
  return {weights,validRatings,similarity,score,rank,recommend,explanation};
})();
if(typeof module!=='undefined')module.exports=TasteEngine;
