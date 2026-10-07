import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../trailer-preview.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const listeners={},timers=new Map(),panels=[];let counter=0,requests=0,resolveMedia,frames=0;
  class Element{
    constructor(kind='button'){this.kind=kind;this.dataset={};this.isConnected=true;this.style={};this.classList={add(){},remove(){}};this.children=new Map();this.hidden=true;}
    matches(){return false;}setAttribute(){}addEventListener(){}contains(node){return node===this;}
    closest(selector){return selector==='#main'?{}:selector.includes('.card')?this:null;}
    getBoundingClientRect(){return {left:100,top:100,width:200,height:300};}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
    append(node){if(node.kind==='iframe')frames++;}remove(){this.isConnected=false;}
  }
  const card=new Element('card');card.dataset.detail='38052';
  const document={hidden:false,body:{append(panel){panels.push(panel);}},head:{append(){}},querySelector:()=>null,
    createElement:kind=>new Element(kind),addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const window={SahneMedia:{lookup:()=>{requests++;return new Promise(resolve=>{resolveMedia=resolve;});}},addEventListener(){},YT:{Player:class {destroy(){}}}};
  vm.runInNewContext(source,{window,document,Element,matchMedia:query=>({matches:!query.includes('reduced'),addEventListener(){}}),
    MutationObserver:class {observe(){}},innerWidth:1200,innerHeight:900,navigator:{},location:{origin:'http://localhost'},
    setTimeout:(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;},clearTimeout:id=>timers.delete(id)});
  window.SahnePreview.install({getShow:()=>({id:38052,name:'Silo',genres:['Drama'],image:{original:'https://static.tvmaze.com/silo.jpg'}})});
  const enter=()=>listeners.pointerover({target:card,relatedTarget:null,pointerType:'mouse'});
  const dwell=()=>{for(const [id,timer] of timers)if(timer.ms===650){timers.delete(id);timer.fn();}};
  return {window,card,listeners,panels,timers,enter,dwell,get requests(){return requests;},get frames(){return frames;},resolve:record=>resolveMedia(record)};
}
const media={trailer:{videoId:'MvWE7u_zLxk',thumbnail:'https://i.ytimg.com/vi/MvWE7u_zLxk/hqdefault.jpg'}};
test('an expanded card is visible during a cold lookup, before any unverified video starts',async()=>{
  const b=setup();b.enter();b.dwell();assert.equal(b.panels.length,1);assert.equal(b.requests,1);assert.equal(b.frames,0);
  assert.match(b.panels[0].innerHTML,/Fragman bulunuyor/);b.resolve(media);await tick();assert.equal(b.frames,1);
});
test('quick pointer departure prevents both the panel and external request',()=>{
  const b=setup();b.enter();b.listeners.pointerout({target:b.card,relatedTarget:null});b.dwell();
  assert.equal(b.requests,0);assert.equal(b.panels.length,0);
});
test('closing while metadata loads prevents a late ghost video',async()=>{
  const b=setup();b.enter();b.dwell();b.window.SahnePreview.stop();b.resolve(media);await tick();
  assert.equal(b.panels[0].isConnected,false);assert.equal(b.frames,0);
});
test('a removed card cannot start a late video',async()=>{
  const b=setup();b.enter();b.dwell();b.card.isConnected=false;b.resolve(media);await tick();assert.equal(b.frames,0);assert.equal(b.panels[0].isConnected,false);
});
test('a missing trailer keeps an informative expanded card with no fake embed',async()=>{
  const b=setup();b.enter();b.dwell();b.resolve({trailer:null,trailerStatus:'missing'});await tick();
  assert.equal(b.frames,0);assert.equal(b.panels[0].isConnected,true);assert.match(b.panels[0].querySelector('.trailer-preview-status').textContent,/bulunamadı/);
});
