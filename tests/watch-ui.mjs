import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {watchHandler} from '../server/watch.js';

const source=await readFile(new URL('../watch-ui.js',import.meta.url),'utf8');
const legacy='https://sahne-dizi-kesif.metealp.chatgpt.site';
const api='https://sahne-dizi-kesif.vercel.app';
function client(fetcher){
  const window={};
  vm.runInNewContext(source,{window,document:{addEventListener(){},querySelectorAll(){return [];}},
    fetch:fetcher,URL,AbortSignal,Intl,Date,Map,Set,Error});
  return window.SahneWatch;
}
const show={id:17861,name:'Dark'};
const record=(overrides={})=>({show:{id:show.id,title:show.name},country:'TR',state:'verified',
  offers:[{name:'Netflix',providerId:8,type:'subscription',url:'https://www.netflix.com/title/80100172',icon:null,quality:'4K'}],
  source:'https://www.justwatch.com/tr/tv-sovu/dark',checkedAt:new Date().toISOString(),freshness:'fresh',...overrides});

test('The original Site can read public watch results, including error responses',async()=>{
  const response=await watchHandler(new Request(`${api}/api/watch?id=0&country=TR`,{headers:{Origin:legacy}}));
  assert.equal(response.status,400);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),legacy);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
  assert.equal(response.headers.get('Vary'),'Origin');
});
test('Other origins are not granted cross-origin access',async()=>{
  for(const origin of ['https://example.com',legacy+'.example.com','https://user:password@'+new URL(legacy).host]){
    const response=await watchHandler(new Request(`${api}/api/watch?id=0`,{headers:{Origin:origin}}));
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
});
test('The current publication continues to use its same-origin endpoint',async()=>{
  let requested;
  const guide=client(async(url,options)=>{requested={url,options};return Response.json(record());});
  guide.install({countries:{TR:'Türkiye'}});
  await guide.lookup(show.id,'TR');
  assert.equal(requested.url,'/api/watch?id=17861&country=TR');
  assert.equal(requested.options.credentials,'omit');
  assert.match(guide.render(show,'TR'),/Netflix/);
});
test('The original publication fetches its dynamic titles from the shared live API',async()=>{
  let requested;
  const guide=client(async(url,options)=>{requested={url,options};return Response.json(record());});
  guide.install({apiBase:api,countries:{TR:'Türkiye'}});
  await guide.lookup(show.id,'TR');
  assert.equal(requested.url,`${api}/api/watch?id=17861&country=TR`);
  assert.equal(requested.options.credentials,'omit');
  const html=guide.render(show,'TR');
  assert.match(html,/Netflix/);
  assert.match(html,/https:\/\/www.netflix.com\/title\/80100172/);
  assert.doesNotMatch(html,/doğrulanmış platform kaydı yok|kataloğunda ara/);
});
test('An untrusted API base cannot receive watch requests',async()=>{
  let requested;
  const guide=client(async url=>{requested=url;return Response.json(record());});
  guide.install({apiBase:'https://example.com',countries:{TR:'Türkiye'}});
  await guide.lookup(show.id,'TR');
  assert.equal(requested,'/api/watch?id=17861&country=TR');
});
test('A source outage offers retry rather than claiming the title has no platforms',async()=>{
  const guide=client(async()=>Response.json({error:{message:'Servise ulaşılamıyor.'}},{status:503}));
  await assert.rejects(()=>guide.lookup(show.id,'TR'));
  const html=guide.render(show,'TR');
  assert.match(html,/İzleme bilgileri şu an yüklenemedi/);
  assert.match(html,/Tekrar dene/);
  assert.doesNotMatch(html,/yayın seçeneği listelenmiyor/);
});
test('A successful empty country result is distinct from missing or failed data',async()=>{
  const guide=client(async()=>Response.json(record({offers:[]})));
  await guide.lookup(show.id,'TR');
  const html=guide.render(show,'TR');
  assert.match(html,/Türkiye için yayın seçeneği listelenmiyor/);
  assert.doesNotMatch(html,/eşleştirilemedi|yüklenemedi|doğrulanmış platform kaydı yok/);
});
test('Responses for a different country or title cannot be displayed as verified',async()=>{
  for(const overrides of [{country:'US'},{show:{id:169,title:'Breaking Bad'}}]){
    const guide=client(async()=>Response.json(record(overrides)));
    await assert.rejects(()=>guide.lookup(show.id,'TR'));
    assert.match(guide.render(show,'TR'),/İzleme bilgileri şu an yüklenemedi/);
  }
});
