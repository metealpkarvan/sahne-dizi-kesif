import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const source=app.split('\n').filter(line=>/^function (navigationUrl|navigationMatches|initializeNavigation)\(/.test(line)).join('\n');
function load(hash,previous){
 const state={},history={state:previous?{sahneNavigation:previous}:null,replaceState(next){this.state=next;}};
 const context=vm.createContext({URL,state,history,window:{scrollY:0},location:{href:'http://localhost:4182/'+hash,hash},navigationKey:'sahneNavigation',validViews:['discover','catalog','collections','list','platforms','community']});
 vm.runInContext(source,context);return vm.runInContext('initializeNavigation()',context);
}
test('a copied profile link takes precedence over inherited homepage history',()=>{
 const nav=load('#sahne/profile/member_one',{view:'discover',detailId:null,depth:2});
 assert.equal(nav.view,'community');assert.equal(nav.communityView,'profile');assert.equal(nav.communityId,'member_one');
});
test('direct forum and topic links cannot be obscured by an old catalog state',()=>{
 for(const hash of ['#sahne/forum','#sahne/topic/topic-id'])assert.equal(load(hash,{view:'catalog',detailId:null}).view,'community');
});
test('matching browser history preserves detail tabs and back-navigation depth',()=>{
 const previous={view:'catalog',detailId:38052,detailTab:'watch',depth:3};
 const nav=load('#dizi/38052',previous);assert.equal(nav.detailTab,'watch');assert.equal(nav.depth,3);
});
test('changing a series link resolves the new title instead of reopening the previous one',()=>{
 assert.equal(load('#dizi/44933',{view:'catalog',detailId:38052,detailTab:'watch',depth:3}).detailId,44933);
});

test('the Forum menu opens the forum even while viewing a member profile',()=>{
 const state={view:'community',communityView:'profile',communityId:'member_one'},calls=[];
 const context=vm.createContext({state,pushNavigation:nav=>calls.push(nav),setView:(view,addHistory)=>calls.push({view,addHistory})});
 vm.runInContext(app.split('\n').find(line=>line.startsWith('function onDocClick(')),context);
 context.event={target:{closest:()=>({dataset:{view:'community'},classList:{contains:()=>false},matches:()=>false})},preventDefault(){}};
 vm.runInContext('onDocClick(event)',context);
 assert.equal(state.communityView,'forum');assert.equal(state.communityId,null);assert.equal(calls[0].communityView,'forum');
});
