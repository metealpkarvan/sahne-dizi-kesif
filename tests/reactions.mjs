import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const helper=await readFile(new URL('../reaction-state.js',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(helper,context);
const engine=context.SahneReactionState;
const plain=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-08';
const episodes=[{id:1,airdate:'2025-01-01'},{id:2,airdate:date},{id:3,airdate:'2027-01-01'},{id:4,airdate:''}];

test('completes aired episodes only and deduplicates prior progress',()=>{
 const prior={status:'watching',episodes:[1],favorite:true,review:'Notum',stars:4,lists:['mine']};
 const plan=engine.complete(prior,episodes,date);
 assert.deepEqual(plain(plan.entry),{...prior,status:'done',date,episodes:[1,2]});
 assert.deepEqual(prior.episodes,[1]);
 assert.deepEqual(plain(engine.undo(plan.entry,plan).entry),prior);
});
test('undo removes a newly created archive entry',()=>{
 const plan=engine.complete(undefined,[],date);
 assert.equal(plan.entry.status,'done');
 assert.deepEqual(plain(engine.undo(plan.entry,plan)),{restored:true,entry:null});
});
test('undo restores a previous date and does not overwrite other edits',()=>{
 const plan=engine.complete({status:'paused',date:'2024-01-01'},episodes,date);
 plan.entry.review='Yeni not';
 assert.deepEqual(plain(engine.undo(plan.entry,plan).entry),{status:'paused',date:'2024-01-01',review:'Yeni not'});
});
test('already completed shows keep their original date and progress',()=>{
 const prior={status:'done',date:'2020-01-01',episodes:[1]};
 assert.equal(engine.complete(prior,episodes,date),null);
 assert.deepEqual(prior,{status:'done',date:'2020-01-01',episodes:[1]});
});
test('undo rejects subsequent status or episode changes',()=>{
 const plan=engine.complete({status:'watching',episodes:[1]},episodes,date);
 assert.equal(engine.undo({...plan.entry,status:'planned'},plan).restored,false);
 assert.equal(engine.undo({...plan.entry,episodes:[2]},plan).restored,false);
});
test('late episode loading stays undoable and stops after undo',()=>{
 const plan=engine.complete({status:'planned'},[],date);
 assert.equal(engine.extend(plan.entry,plan,episodes,date),true);
 assert.deepEqual(plain(plan.entry.episodes),[1,2]);
 const restored=engine.undo(plan.entry,plan);
 assert.deepEqual(plain(restored.entry),{status:'planned'});
 assert.equal(engine.extend(restored.entry,plan,episodes,date),false);
});

function fixture(reaction,prior){
 let notice;
 const saved=prior?{42:structuredClone(prior)}:{};
 const ratings={};
 const c=vm.createContext({SahneReactionState:engine,byId:new Map([[42,{name:'Test'}]]),TasteEngine:{weights:{like:1,love:2,dislike:-1}},ratings,saved,DETAILS:{42:{episodes}},localDate:()=>date,window:{SahneStorageKey:()=> 'test-account'},$:(selector)=>({open:false}),$$:()=>[],document:{activeElement:null},state:{detailId:0},ratingOptions:[['dislike','','Beğenmedim'],['like','','Beğendim'],['love','','Çok beğendim']],persist:()=>{},saveRatings:()=>{},renderAll:()=>{},toast:(message,action)=>{notice={message,action}}});
 vm.runInContext(app.slice(app.indexOf('const reactionCompletions='),app.indexOf('\nfunction ',app.indexOf('function rate(')+15)),c);
 vm.runInContext(`rate(42,'${reaction}')`,c);
 return {c,saved,ratings,notice:()=>notice};
}
for(const reaction of ['like','love','dislike'])test(`${reaction} completes the series; undo keeps the reaction`,()=>{
 const f=fixture(reaction,{status:'watching',episodes:[1]});
 assert.equal(f.saved[42].status,'done');
 assert.equal(f.notice().action.label,'Geri al');
 f.notice().action.run();
 assert.deepEqual(plain(f.saved[42]),{status:'watching',episodes:[1]});
 assert.equal(f.ratings[42],reaction);
});
test('undo cannot affect a different signed-in account',()=>{
 const f=fixture('like');
 vm.runInContext("window.SahneStorageKey=()=> 'other-account'",f.c);
 f.notice().action.run();
 assert.equal(f.saved[42].status,'done');
});
test('changing reaction retains the original completion undo',()=>{
 const f=fixture('like',{status:'planned'});
 vm.runInContext("rate(42,'love')",f.c);
 f.notice().action.run();
 assert.deepEqual(plain(f.saved[42]),{status:'planned'});
 assert.equal(f.ratings[42],'love');
});
