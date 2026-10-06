const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const path=require('path');
const project=path.resolve(__dirname,'..');
const root=fs.existsSync(path.join(project,'dist'))?path.join(project,'dist'):project;
const files=['recommendations.js','catalog-seed.js','app.js','catalog-experience.js','data.js','home-shelves.js','platform-data.js'];
const sources=Object.fromEntries(files.map(f=>[f,fs.readFileSync(root+'/'+f,'utf8')]));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const beforeHashes=Object.fromEntries(files.map(f=>[f,hash(sources[f])]));
class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-06T09:30:00Z']));}static now(){return Date.parse('2026-10-06T09:30:00Z');}}
const ctx=vm.createContext({URL,Date:FixedDate,console,localStorage:{getItem(){return null}},document:{querySelector(){return {checked:false}}},DOMParser:class{parseFromString(s){return {body:{textContent:String(s).replace(/<[^>]*>/g,'')}}}}});
for(const f of ['data.js','home-shelves.js','platform-data.js','catalog-seed.js'])vm.runInContext(sources[f],ctx,{filename:f});
vm.runInContext(sources['recommendations.js'],ctx,{filename:'recommendations.js'});
vm.runInContext(sources['catalog-experience.js'].slice(0,sources['catalog-experience.js'].indexOf('\nfunction browseRows')),ctx);
vm.runInContext('const cinemaMediaByTitle={};',ctx);
vm.runInContext(sources['app.js'].slice(0,sources['app.js'].indexOf('const homeFeedCacheKey=')),ctx,{filename:'app-initialization.js'});
const candidates=sources['app.js'].split('\n').find(l=>l.startsWith('function recommendationCandidates()'));
vm.runInContext(candidates,ctx);
const engine=vm.runInContext('TasteEngine',ctx),catalog=vm.runInContext('tasteCatalog()',ctx),pool=vm.runInContext('recommendationCandidates()',ctx),seedCount=vm.runInContext('CATALOG_BOOTSTRAP.shows.length',ctx);
const find=n=>{const s=catalog.find(s=>s.name===n);assert(s,'Missing show '+n);return s;};
const sev=find('Severance'),bear=find('The Bear'),devs=find('Devs'),silo=find('Silo'),dark=find('Dark'),mrRobot=find('Mr. Robot'),fleabag=find('Fleabag');
const ids=rows=>Array.from(rows,s=>s.id),names=rows=>Array.from(rows,s=>s.name);
const rec=(ratings={},saved={})=>engine.recommend(pool,catalog,ratings,saved,12);
const serial=x=>JSON.parse(JSON.stringify(x));
const originalInputHash=hash(JSON.stringify({catalog,pool}));
const tests=[];
const test=(name,f)=>{try{const detail=f();tests.push({name,pass:true,detail:serial(detail)});}catch(e){tests.push({name,pass:false,error:e.stack});}};
const mean=(rows,source)=>rows.reduce((sum,s)=>sum+engine.similarity(s,source,catalog),0)/rows.length;
let baseline=rec(),liked=rec({[sev.id]:'like'}),disliked=rec({[sev.id]:'dislike'});
test('like and dislike change recommendations and score content neighbors',()=>{
 assert.notDeepEqual(ids(liked).slice(0,6),ids(disliked).slice(0,6));
 assert.notDeepEqual(ids(liked).slice(0,6),ids(baseline).slice(0,6));
 const rp=engine.rank(pool,catalog,{[sev.id]:'like'}),rn=engine.rank(pool,catalog,{[sev.id]:'dislike'}),r0=engine.rank(pool,catalog,{});
 const anchors=[devs,silo,dark,mrRobot].map(s=>({name:s.name,baseline:r0.findIndex(x=>x.id===s.id)+1,like:rp.findIndex(x=>x.id===s.id)+1,dislike:rn.findIndex(x=>x.id===s.id)+1,scores:{baseline:engine.score(s,catalog,{}),like:engine.score(s,catalog,{[sev.id]:'like'}),dislike:engine.score(s,catalog,{[sev.id]:'dislike'})}}));
 for(const s of anchors){assert(s.like<s.dislike,s.name+' rank must improve for like vs dislike');assert(s.scores.like>s.scores.dislike,s.name+' score must reflect positive vs negative feedback');}
 assert(mean(liked,sev)>mean(disliked,sev));
 for(const rows of [liked,disliked])assert(!ids(rows).includes(sev.id));
 return {baseline:names(baseline).slice(0,6),like:names(liked).slice(0,6),dislike:names(disliked).slice(0,6),affinity:{like:mean(liked,sev),dislike:mean(disliked,sev)},anchors};
});
test('love outranks like in both directions for a mixed profile',()=>{
 const strongSev={[sev.id]:'love',[bear.id]:'like'},strongBear={[sev.id]:'like',[bear.id]:'love'};
 const a=rec(strongSev),b=rec(strongBear);assert.notDeepEqual(ids(a),ids(b));
 assert(mean(a,sev)>mean(b,sev));assert(mean(b,bear)>mean(a,bear));
 assert(engine.score(devs,catalog,strongSev)>engine.score(devs,catalog,strongBear));
 assert(engine.score(fleabag,catalog,strongBear)>engine.score(fleabag,catalog,strongSev));
 assert(!ids(a).some(id=>[sev.id,bear.id].includes(id)));assert(!ids(b).some(id=>[sev.id,bear.id].includes(id)));
 return {severanceLove:names(a).slice(0,6),bearLove:names(b).slice(0,6),meanSeverance:{severanceLove:mean(a,sev),bearLove:mean(b,sev)},meanBear:{severanceLove:mean(a,bear),bearLove:mean(b,bear)}};
});
test('all five saved status objects exclude independently and together',()=>{
 const target=baseline[0],statuses=['planned','watching','done','paused','dropped'];
 const individual=statuses.map(status=>{const saved={[target.id]:{status}};assert(!ids(rec({},saved)).includes(target.id));assert.equal(engine.insights(catalog,{},saved).count,0);return status;});
 const entries=Object.fromEntries(baseline.slice(0,5).map((s,i)=>[s.id,{status:statuses[i]}]));
 const together=rec({},entries);assert(!ids(together).some(id=>Object.hasOwn(entries,id)));assert.equal(together.length,12);
 const unarchived=rec({},{});assert.deepEqual(ids(unarchived),ids(baseline));
 return {individual,combinedExcluded:names(baseline).slice(0,5),replacementCount:together.length};
});
test('favorite and all star boundaries equal the intended explicit rating',()=>{
 const cases=[{entry:{favorite:true},rating:'love'},{entry:{stars:0},rating:null},{entry:{stars:1},rating:'dislike'},{entry:{stars:2},rating:'dislike'},{entry:{stars:2.5},rating:null},{entry:{stars:3},rating:null},{entry:{stars:3.5},rating:'like'},{entry:{stars:4},rating:'like'},{entry:{stars:4.5},rating:'love'},{entry:{stars:5},rating:'love'}];
 return cases.map(({entry,rating})=>{const implicitSaved={[sev.id]:entry},explicit=rating?{[sev.id]:rating}:{};const a=rec({},implicitSaved),b=rec(explicit,{});assert.deepEqual(ids(a),ids(b));assert.deepEqual(serial(engine.insights(catalog,{},implicitSaved)),serial(engine.insights(catalog,explicit,{})));assert.equal(engine.score(devs,catalog,{},implicitSaved),engine.score(devs,catalog,explicit,{}));assert.deepEqual(ids(engine.rank(pool,catalog,{},implicitSaved)),ids(engine.rank(pool,catalog,explicit,{})));return {entry,rating,count:engine.insights(catalog,{},implicitSaved).count};});
});
test('mixed implicit favorites stars and dislikes equal explicit mixed profile',()=>{
 const saved={[sev.id]:{status:'done',favorite:true},[bear.id]:{status:'done',stars:4},[silo.id]:{status:'dropped',stars:1.5}};
 const ratings={[sev.id]:'love',[bear.id]:'like',[silo.id]:'dislike'};
 assert.deepEqual(ids(rec({},saved)),ids(rec(ratings,{})));assert.deepEqual(serial(engine.insights(catalog,{},saved)),serial(engine.insights(catalog,ratings,{})));
 return {insights:engine.insights(catalog,{},saved),top:names(rec({},saved)).slice(0,6)};
});
test('explicit ratings override favorite and star in either direction',()=>{
 const cases=[{entry:{favorite:true,stars:5},rating:'dislike'},{entry:{favorite:true,stars:5},rating:'like'},{entry:{stars:1},rating:'love'}];
 return cases.map(({entry,rating})=>{const saved={[sev.id]:entry},ratings={[sev.id]:rating};assert.deepEqual(ids(rec(ratings,saved)),ids(rec(ratings,{})));assert.deepEqual(serial(engine.insights(catalog,ratings,saved)),serial(engine.insights(catalog,ratings,{})));return {entry,rating,insights:engine.insights(catalog,ratings,saved)};});
});
test('repeated calls invalidate and fresh engine preserve deterministic ids scores reasons',()=>{
 const profiles=[{r:{},s:{}},{r:{[sev.id]:'like'},s:{}},{r:{[sev.id]:'dislike'},s:{}},{r:{[sev.id]:'love',[bear.id]:'like'},s:{}},{r:{},s:{[sev.id]:{status:'done',favorite:true},[bear.id]:{stars:4},[silo.id]:{stars:1.5}}}];
 const signature=(eng,p)=>{const rows=eng.recommend(pool,catalog,p.r,p.s,12);return JSON.stringify({ids:ids(rows),scores:Array.from(rows,s=>eng.score(s,catalog,p.r,p.s)),reasons:Array.from(rows,s=>eng.explanation(s,catalog,p.r,p.s))});};
 const expected=profiles.map(p=>signature(engine,p));for(let pass=0;pass<3;pass++){for(let i=0;i<profiles.length;i++)assert.equal(signature(engine,profiles[i]),expected[i]);engine.invalidate();}
 const fresh=vm.createContext({module:{exports:{}}});vm.runInContext(sources['recommendations.js'],fresh);const freshEngine=fresh.module.exports;for(let i=0;i<profiles.length;i++)assert.equal(signature(freshEngine,profiles[i]),expected[i]);
 return {profiles:profiles.length,repetitions:3,freshEngine:true};
});
test('recommendations contain unique finite scored valid current candidates',()=>{
 for(const ratings of [{},{[sev.id]:'like'},{[sev.id]:'dislike'},{[bear.id]:'love',[sev.id]:'like'}]){const rows=rec(ratings);assert.equal(new Set(ids(rows)).size,rows.length);for(const s of rows){assert(Number.isFinite(engine.score(s,catalog,ratings)));assert(s.year&&s.year<=2026);assert(s.status!=='In Development');assert(!s.premiered||s.premiered<='2026-10-06');}}
 return {pool:pool.length,seed:seedCount,catalog:catalog.length};
});
test('engine does not mutate input catalog or source files',()=>{
 assert.equal(hash(JSON.stringify({catalog,pool})),originalInputHash);for(const f of files)assert.equal(hash(fs.readFileSync(root+'/'+f,'utf8')),beforeHashes[f]);return {files:files.length,catalogUnchanged:true};
});
const out={asOf:'2026-10-06',seedCount,catalogCount:catalog.length,candidateCount:pool.length,sourceHashes:beforeHashes,passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length,tests};
console.log(JSON.stringify({passed:out.passed,failed:out.failed,catalogCount:out.catalogCount,candidateCount:out.candidateCount,tests:out.tests.map(t=>({name:t.name,pass:t.pass,error:t.error}))},null,2));process.exitCode=out.failed?1:0;
