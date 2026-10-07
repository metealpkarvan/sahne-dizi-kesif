import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {mediaHandler} from '../server/media.js';
const source=await readFile(new URL('../media-client.js',import.meta.url),'utf8');
const origin='https://sahne-dizi-kesif.metealp.chatgpt.site';
const record={show:{id:38052},images:[],trailer:{videoId:'MvWE7u_zLxk',url:'https://attacker.example'},state:'ready'};
function client(fetcher){const window={};vm.runInNewContext(source,{window,fetch:fetcher,URL,AbortSignal});return window.SahneMedia;}
test('original publication can read public media without granting credential access',async()=>{
  const response=await mediaHandler(new Request('https://local/api/media?id=0',{headers:{Origin:origin}}));
  assert.equal(response.status,400);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);assert.equal(response.headers.get('Vary'),'Origin');
});
test('unrelated sites receive no media CORS grant',async()=>{
  const response=await mediaHandler(new Request('https://local/api/media?id=0',{headers:{Origin:'https://attacker.example'}}));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
});
test('both publications share verified media through their configured API origin',async()=>{
  const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return Response.json(record);};
  const local=client(fetcher),legacy=client(fetcher);legacy.install({apiBase:'https://sahne-dizi-kesif.vercel.app'});
  await Promise.all([local.lookup(38052),legacy.lookup(38052)]);
  assert.equal(calls[0].url,'/api/media?id=38052');assert.equal(calls[1].url,'https://sahne-dizi-kesif.vercel.app/api/media?id=38052');
  assert.ok(calls.every(call=>call.options.credentials==='omit'));
  assert.equal(legacy.get(38052).trailer.url,'https://www.youtube.com/watch?v=MvWE7u_zLxk');
});
test('a wrong origin cannot receive media requests and a wrong show cannot enter the cache',async()=>{
  let url;const api=client(async value=>{url=value;return Response.json({...record,show:{id:169}});});
  api.install({apiBase:'https://attacker.example'});
  await assert.rejects(api.lookup(38052),/doğrulanamadı/);assert.equal(url,'/api/media?id=38052');assert.equal(api.get(38052),null);
});
test('simultaneous hover and detail loads share a request; retry can recover a failure',async()=>{
  let calls=0,resolve;const api=client(()=>{calls++;return new Promise(done=>{resolve=done;});});
  const a=api.lookup(38052),b=api.lookup(38052);assert.equal(calls,1);
  resolve(Response.json({error:{message:'Kaynak geçici olarak kapalı'}},{status:503}));
  await Promise.all([assert.rejects(a,/geçici/),assert.rejects(b,/geçici/)]);
  const next=api.lookup(38052,{retry:true});assert.equal(calls,2);resolve(Response.json(record));await next;
  assert.equal(api.get(38052).show.id,38052);
});
