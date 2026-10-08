import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../recommendations.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const engine=vm.runInContext('TasteEngine',context);
const anchor={id:1,name:'Crime drama',type:'Scripted',genres:['Drama','Crime'],summary:'An investigation into a drug cartel and criminal family.',runtime:45,year:2010,language:'English',rating:8,weight:60};
const close={...anchor,id:2,name:'Another crime story',rating:7,weight:10};
const broad={...anchor,id:3,name:'Relationship drama',genres:['Drama','Romance'],summary:'A couple confront their marriage.',rating:10,weight:100};
const unrelated={...anchor,id:4,name:'Space adventure',genres:['Science-Fiction','Adventure'],summary:'Astronauts explore a galaxy.',rating:10,weight:100};

test('actual content similarity outranks popularity and shared language',()=>{
 const rows=engine.related(anchor,[broad,unrelated,close],[anchor,broad,unrelated,close]);
 assert.equal(rows[0].show.id,2);
 assert(!rows.some(row=>row.show.id===4));
 assert(rows[0].themes.includes('suç dünyası'));
});
test('excludes the source and duplicate IDs, respects the limit',()=>{
 const rows=engine.related(anchor,[anchor,close,close,broad],[anchor,close,broad],1);
 assert.equal(rows.length,1);assert.equal(rows[0].show.id,2);
});
test('does not fabricate matches for titles without genre or theme evidence',()=>{
 assert.equal(engine.related({...anchor,id:5,name:'Unknown',genres:[],summary:''},[unrelated],[unrelated]).length,0);
});
test('shared genres remain explainable when synopsis metadata is missing',()=>{
 const rows=engine.related({...anchor,summary:''},[{...close,summary:'',name:'Title'}],[anchor,close]);
 assert(rows[0].genres.includes('Crime'));assert(Number.isFinite(rows[0].score));
});
test('ranking preserves input metadata and is deterministic',()=>{
 const items=[close,broad,unrelated];const original=JSON.stringify(items);
 const ids=()=>Array.from(engine.related(anchor,items,[anchor,...items]),row=>row.show.id);
 assert.deepEqual(ids(),ids());assert.equal(JSON.stringify(items),original);
});

test('catalog selection supports a searched title, excludes unreleased shows and does not materialize the full catalog',async()=>{
 const code=await readFile(new URL('../similar-series.js',import.meta.url),'utf8');
 const searched={...anchor,id:9999};
 const rows=[close,{...close,id:6,premiered:'2099-01-01'},{...close,id:7,status:'In Development'}].map(show=>({...show,image:{medium:'poster.jpg'}}));
 let materialized=0;
 const c=vm.createContext({tasteCatalog:()=>[searched],browseRows:()=>rows,byId:new Map([[searched.id,searched]]),inferMood:()=> 'dark',localDate:()=> '2026-10-08',noPoster:'missing.jpg',materializeCatalogShow:()=>{materialized++;}});
 vm.runInContext(code,c);
 const pool=vm.runInContext('similarSeriesCandidates(tasteCatalog()[0])',c);
 assert.deepEqual(Array.from(pool,s=>s.id),[2]);assert.equal(materialized,0);
});
