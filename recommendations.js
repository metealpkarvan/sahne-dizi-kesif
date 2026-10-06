/* Device-local content recommendations. Scores express similarity, not a probability. */
const TasteEngine = (() => {
  const weights = {dislike:-2.4,like:1,love:3};
  const curated = {
    38052:['dystopia','conspiracy','secrets','puzzle','institutions'],
    1871:['identity','psychology','conspiracy','technology','institutions'],
    52341:['politics','espionage','institutions','power','journey'],
    35951:['politics','power','strategy','space','identity'],
    1825:['conspiracy','investigation','space','politics','puzzle'],
    68156:['work','relationships','ambition'],
    367:['family','grief','relationships','work'],
    75605:['work','ambition','power','humor'],
    75632:['medicine','work','institutions'],
    44933:['identity','conspiracy','psychology','dystopia','puzzle','work'],
    17861:['puzzle','family','secrets','time','conspiracy'],
    54198:['family','work','relationships','ambition','grief'],
    37336:['politics','power','culture','strategy','history'],
    16149:['relationships','grief','identity','humor'],
    30770:['history','institutions','disaster','politics'],
    23470:['family','power','ambition','politics','humor'],
    46562:['survival','relationships','grief','dystopia','journey'],
    335:['investigation','puzzle','friendship','psychology'],
    44458:['friendship','work','relationships','humor','sports'],
    305:['dystopia','technology','psychology','identity'],
    10822:['investigation','psychology','crime','institutions']
  };
  const lexicon = {
    identity:/\b(identit\w*|memor\w*|amnesia|severance|clone\w*)\b|kimlik|hafıza/i,
    conspiracy:/\b(conspir\w*|cover.up|secret organization|corporat\w*)\b|komplo/i,
    psychology:/\b(psycholog\w*|psychiatr\w*|obsessi\w*|therap\w*)\b|psikoloji/i,
    dystopia:/\b(dystopi\w*|apocalyp\w*|post.apocalyp\w*|totalitarian|underground silo|toxic.future|deep.underground)\b|distopya/i,
    puzzle:/\b(myster\w*|puzzl\w*|enigmat\w*|unexplain\w*)\b|gizem|bulmaca/i,
    work:/\b(workplace|office|colleague\w*|employee\w*|restaurant|chef\w*|kitchen|career\w*)\b|iş hayatı|mutfak/i,
    family:/\b(famil\w*|parent\w*|sibling\w*|mother|father|brother\w*|sister\w*)\b|aile/i,
    secrets:/\b(secret\w*|hidden|disappear\w*)\b|sırları|kaybol/i,
    time:/\b(time.travel|timeline\w*|time.loop|alternate.reality|parallel\w*)\b|zaman yolculuğu/i,
    relationships:/\b(relationshi\w*|marriage|couple\w*|divorc\w*|romanc\w*|love.life)\b|ilişki|evlilik/i,
    ambition:/\b(ambitio\w*|success\w*|inherit\w*|wealth\w*|billionaire\w*)\b|hırs|miras/i,
    grief:/\b(grief|griev\w*|mourning|loss|bereav\w*)\b|kayıp|yas/i,
    politics:/\b(politic\w*|president\w*|government|diploma\w*|election\w*|rebellion|rebel\w*|resistance|regime|imperial)\b|siyasi/i,
    power:/\b(power|dynast\w*|empire\w*|throne\w*|royal\w*|kingdom\w*)\b|iktidar|imparatorluk/i,
    culture:/\b(cultur\w*|tradition\w*|immigran\w*)\b|kültür/i,
    strategy:/\b(strateg\w*|allianc\w*|rival\w*|warfare|samurai)\b|ittifak/i,
    history:/\b(histor\w*|century|medieval|world.war|victorian|194\d|19th|18th|17th)\b|tarih/i,
    institutions:/\b(institut\w*|bureau|fbi|cia|police\w*|authority|systemic|empire|rule\w*)\b/i,
    disaster:/\b(disaster\w*|nuclear|catastroph\w*|pandemic|epidemic)\b|felaket/i,
    humor:/\b(comed\w*|humor\w*|hilarious|sitcom|funny|satir\w*)\b|mizah|komedi/i,
    survival:/\b(surviv\w*|zombie\w*|infect\w*|wilderness|stranded)\b|hayatta kal/i,
    investigation:/\b(investigat\w*|detective\w*|murder\w*|case|crime.scene|forensic\w*)\b|dedektif|soruşturma/i,
    friendship:/\b(friend\w*|buddy|companio\w*|roommate\w*)\b|arkadaş/i,
    technology:/\b(technolog\w*|artificial.intelligence|robot\w*|android\w*|hacker\w*|cyber\w*)\b|teknoloji/i,
    crime:/\b(crimin\w*|crime|gang\w*|mafia|cartel\w*|heist\w*|drug\w*)\b|suç/i,
    space:/\b(space|galaxy|galactic|planet\w*|alien\w*|astronaut\w*|starship\w*)\b|galaksi|uzay/i,
    magic:/\b(magic\w*|witch\w*|wizard\w*|dragon\w*|supernatural|vampire\w*|demon\w*)\b|büyü|cadı/i,
    youth:/\b(teen\w*|high.school|coming.of.age|adolescen\w*|college|student\w*)\b|gençlik/i,
    sports:/\b(sport\w*|football|soccer|coach\w*|athlet\w*|basketball)\b|spor/i,
    journey:/\b(journey|road.trip|travel\w*|expedition|quest)\b|yolculuk/i,
    medicine:/\b(hospital|doctor\w*|medical|surgeon\w*|nurs\w*|patient\w*)\b|hastane|doktor/i,
    espionage:/\b(spy|spies|espionage|intelligence.agent|undercover|secret.agent)\b|casus/i,
    justice:/\b(lawyer\w*|attorney\w*|courtroom|judge\w*|legal|prosecut\w*)\b|avukat|mahkeme/i,
    hero:/\b(superhero\w*|super.power\w*|marvel|mutant\w*)\b|süper kahraman/i,
    smalltown:/\b(small.town|rural|village|close.knit)\b|kasaba/i
  };
  const themeNames={identity:'kimlik ve hafıza',conspiracy:'komplo',psychology:'psikolojik gerilim',dystopia:'distopya',puzzle:'gizem',work:'iş hayatı',family:'aile',secrets:'sırlar',time:'zaman bulmacaları',relationships:'ilişkiler',ambition:'hırs',grief:'kayıp ve yas',politics:'siyaset',power:'güç mücadelesi',culture:'kültür',strategy:'strateji',history:'tarih',institutions:'kurumlar',disaster:'felaket',humor:'mizah',survival:'hayatta kalma',investigation:'soruşturma',friendship:'dostluk',technology:'teknoloji',crime:'suç dünyası',space:'uzay',magic:'fantastik dünyalar',youth:'gençlik',sports:'spor',journey:'yolculuk',medicine:'hastane',espionage:'casusluk',justice:'hukuk',hero:'süper kahramanlar',smalltown:'kasaba sırları'};
  let model=null,dirty=true;const cache=new WeakMap();
  function invalidate(){dirty=true;}
  function validRatings(raw,catalog){const result={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;for(const s of catalog)if(Object.hasOwn(weights,raw[s.id]))result[s.id]=raw[s.id];return result;}
  function effectiveRatings(raw,saved={}){const out={...raw};for(const [id,e] of Object.entries(saved)){if(out[id])continue;if(e.favorite||Number(e.stars)>=4.5)out[id]='love';else if(Number(e.stars)>=3.5)out[id]='like';else if(Number(e.stars)>0&&Number(e.stars)<=2)out[id]='dislike';}return out;}
  function features(s){
    const signature=[s.summary,s.description,(s.genres||[]).join('|'),s.mood,s.runtime,s.language,s.year].join('~');
    const old=cache.get(s);if(old?.signature===signature)return old;
    const text=[s.name,s.summary,s.description].join(' '),topics=new Set(curated[s.id]||[]);
    for(const [tag,pattern] of Object.entries(lexicon))if(pattern.test(text))topics.add(tag);
    const value={signature,genres:new Set(s.genres||[]),topics};cache.set(s,value);return value;
  }
  function getModel(catalog){
    const key=catalog.length+':'+catalog[0]?.id+':'+catalog[catalog.length-1]?.id;
    if(!dirty&&model?.key===key)return model;
    const counts=new Map();for(const s of catalog)for(const g of new Set(s.genres||[]))counts.set(g,(counts.get(g)||0)+1);
    model={key,features:new WeakMap(catalog.map(s=>[s,features(s)])),idf:new Map([...counts].map(([g,n])=>[g,Math.min(2.2,1+Math.log((catalog.length+1)/(n+1)))*(['Food','Medical','Sports'].includes(g)?.4:1)]))};dirty=false;return model;
  }
  function sim(a,b,m){
    if(a.id===b.id)return 1;
    const fa=m.features.get(a)||features(a),fb=m.features.get(b)||features(b);let common=0,aa=0,bb=0;
    for(const g of fa.genres){const v=m.idf.get(g)||1;aa+=v*v;if(fb.genres.has(g))common+=v*v;}
    for(const g of fb.genres){const v=m.idf.get(g)||1;bb+=v*v;}
    const genre=aa&&bb?common/Math.sqrt(aa*bb):0;
    const shared=[...fa.topics].filter(t=>fb.topics.has(t)).length;
    const topic=fa.topics.size&&fb.topics.size?shared/Math.sqrt(fa.topics.size*fb.topics.size):0;
    const runtime=a.runtime&&b.runtime?Math.exp(-Math.abs(a.runtime-b.runtime)/22):0;
    const mood=a.mood&&a.mood!=='search'&&a.mood===b.mood?1:0;
    const language=a.language&&a.language===b.language?1:0;
    const year=a.year&&b.year?Math.max(0,1-Math.abs(a.year-b.year)/25):0;
    // An unsupported topic comparison cannot dominate a shared genre.
    return .45*genre+.39*topic+.06*mood+.05*runtime+.03*language+.02*year;
  }
  function similarity(a,b,catalog){return sim(a,b,getModel(catalog));}
  function quality(s){return .65*Math.min(1,Math.max(0,(Number(s.rating)||6.3)/10))+.35*Math.min(1,Math.log1p(Number(s.weight)||0)/Math.log(101));}
  function profile(catalog,ratings,saved={}){
    const values=effectiveRatings(ratings,saved),positive=[],negative=[];
    for(const s of catalog){const w=weights[values[s.id]];if(w>0)positive.push({s,w,reaction:values[s.id]});else if(w<0)negative.push({s,w:Math.abs(w),reaction:values[s.id]});}
    return {positive,negative,values,model:getModel(catalog)};
  }
  function evaluate(candidate,p){
    let pSum=0,pWeight=0,pMax=0,best=null,nSum=0,nWeight=0,nMax=0;
    for(const source of p.positive){if(source.s.id===candidate.id)continue;const affinity=sim(candidate,source.s,p.model),weighted=affinity*(source.w===3?1.5:1);pSum+=affinity*source.w;pWeight+=source.w;if(weighted>pMax){pMax=weighted;best={...source,affinity};}}
    for(const source of p.negative){if(source.s.id===candidate.id)continue;const affinity=sim(candidate,source.s,p.model);nSum+=affinity*source.w;nWeight+=source.w;nMax=Math.max(nMax,affinity);}
    const positive=.68*pMax+.32*(pWeight?pSum/pWeight:0),negative=.78*nMax+.22*(nWeight?nSum/nWeight:0);
    const has=p.positive.length+p.negative.length;
    return {score:has?1.35*positive-1.15*negative+.13*quality(candidate):quality(candidate),positive,negative,best};
  }
  function score(candidate,catalog,ratings,saved={}){return evaluate(candidate,profile(catalog,ratings,saved)).score;}
  function rank(items,catalog,ratings,saved={}){const p=profile(catalog,ratings,saved);return items.map((s,index)=>({s,index,...evaluate(s,p)})).sort((a,b)=>b.score-a.score||quality(b.s)-quality(a.s)||a.index-b.index).map(x=>x.s);}
  function recommend(items,catalog,ratings,saved={},limit=12){
    const p=profile(catalog,ratings,saved),seen=new Set();
    const eligible=items.filter(s=>{if(seen.has(s.id)||p.values[s.id])return false;seen.add(s.id);const e=saved[s.id],status=typeof e==='string'?e:e?.status;return !['planned','watching','done','paused','dropped'].includes(status);});
    const ranked=eligible.map((s,index)=>({s,index,...evaluate(s,p)})).sort((a,b)=>b.score-a.score||quality(b.s)-quality(a.s)||a.index-b.index);
    // Penalize near-duplicates within the first page, keeping each preference meaningful.
    const remaining=ranked.slice(0,Math.max(240,limit*3)),picked=[];
    while(remaining.length&&picked.length<Math.min(limit,24,eligible.length)){
      let bestIndex=0,bestScore=-Infinity;
      for(let i=0;i<remaining.length;i++){const row=remaining[i],duplicate=picked.length?Math.max(...picked.slice(-12).map(other=>sim(row.s,other,p.model))):0;const adjusted=row.score-.1*duplicate;if(adjusted>bestScore){bestScore=adjusted;bestIndex=i;}}
      picked.push(remaining.splice(bestIndex,1)[0].s);
    }
    const chosen=new Set(picked.map(s=>s.id));return [...picked,...ranked.filter(row=>!chosen.has(row.s.id)).map(row=>row.s)].slice(0,limit);
  }
  function explanation(s,catalog,ratings,saved={}){
    const p=profile(catalog,ratings,saved),result=evaluate(s,p),best=result.best;
    if(best&&best.affinity>=.24&&result.positive>result.negative*.65){const topics=[...features(s).topics].filter(t=>features(best.s).topics.has(t));return {kind:'match',source:best.s.name,reaction:best.reaction,genres:(s.genres||[]).filter(g=>best.s.genres.includes(g)),themes:topics.map(t=>themeNames[t]||t),sameMood:s.mood===best.s.mood,affinity:best.affinity};}
    return {kind:p.negative.length?'avoid':p.positive.length?'explore':'editor'};
  }
  function insights(catalog,ratings,saved={}){const p=profile(catalog,ratings,saved),counts=new Map();for(const x of p.positive)for(const g of x.s.genres||[])counts.set(g,(counts.get(g)||0)+x.w);return {count:p.positive.length+p.negative.length,positive:p.positive.length,negative:p.negative.length,genres:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0])};}
  return {weights,validRatings,similarity,score,rank,recommend,explanation,insights,invalidate};
})();
if(typeof module!=='undefined')module.exports=TasteEngine;
