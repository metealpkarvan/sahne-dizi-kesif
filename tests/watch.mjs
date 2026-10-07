import test from 'node:test';
import assert from 'node:assert/strict';
import {WATCH_COUNTRIES,WatchError,matchTitle,normalizeOffers,fetchAvailability} from '../server/watch-core.js';

const show={id:38052,title:'Silo',year:2023,imdbId:'tt14688458'};
const canonical={id:38052,name:'Silo',premiered:'2023-05-05',externals:{imdb:'tt14688458'}};
const makeNode=(overrides={})=>({id:'ts297178',objectType:'SHOW',content:{title:'Silo',originalTitle:'Silo',originalReleaseYear:2023,fullPath:'/tr/tv-sovu/silo',externalIds:{imdbId:'tt14688458'}},offers:[],...overrides});
const makeOffer=(overrides={})=>({monetizationType:'FLATRATE',presentationType:'SD',retailPrice:null,currency:'TRY',standardWebURL:'https://tv.apple.com/tr/show/silo/example',elementCount:3,package:{packageId:350,clearName:'Apple TV',icon:'/icon/338367329/s100/appletvplus.{format}'},...overrides});
const response=value=>Response.json(value);
const graph=nodes=>response({data:{popularTitles:{edges:nodes.map(node=>({node}))}}});

test('IMDb identity resolves translated titles independently of their release year',()=>{
  const node=makeNode({content:{title:'Yeraltı',originalTitle:'Silo',originalReleaseYear:2024,externalIds:{imdbId:show.imdbId}}});
  assert.equal(matchTitle(show,[node]).method,'imdb');
});
test('A fallback title match requires an exact year',()=>{
  const noImdb={...show,imdbId:null};
  assert.equal(matchTitle(noImdb,[makeNode()]).method,'title-year');
  assert.equal(matchTitle({...noImdb,year:2022},[makeNode()]),null);
  assert.equal(matchTitle({...noImdb,year:null},[makeNode()]),null);
});
test('Different IMDb identities and ambiguous remakes are not selected',()=>{
  const wrong=makeNode({content:{...makeNode().content,externalIds:{imdbId:'tt00000001'}}});
  assert.equal(matchTitle(show,[wrong]),null);
  assert.equal(matchTitle({...show,imdbId:null},[makeNode(),makeNode({id:'ts999'})]),null);
});
test('Movies cannot become TV availability results, even with the same title',()=>{
  assert.equal(matchTitle(show,[makeNode({objectType:'MOVIE'})]),null);
});
test('Duplicate representations of one title do not create ambiguity',()=>{
  const node=makeNode();assert.equal(matchTitle(show,[node,node]).node.id,node.id);
});
test('Provider formats collapse into one option with the best quality',()=>{
  const result=normalizeOffers([makeOffer(),makeOffer({presentationType:'HD'}),makeOffer({presentationType:'_4K'})]);
  assert.equal(result.length,1);assert.equal(result[0].quality,'4K');
  assert.equal(result[0].icon,'https://images.justwatch.com/icon/338367329/s100/appletvplus.png');
});
test('Free episodes and subscription access remain separate options',()=>{
  const result=normalizeOffers([makeOffer(),makeOffer({monetizationType:'FREE',elementCount:1})]);
  assert.deepEqual(result.map(o=>o.type),['subscription','free']);assert.equal(result[1].coverageCount,1);
});
test('Separate channel subscriptions remain separate providers',()=>{
  const result=normalizeOffers([makeOffer(),makeOffer({package:{packageId:2243,clearName:'Apple TV Amazon Channel'}})]);
  assert.equal(result.length,2);assert.notEqual(result[0].providerId,result[1].providerId);
});
test('Purchase prices are lowest listed starting prices; absent prices stay null',()=>{
  const result=normalizeOffers([makeOffer({monetizationType:'BUY',retailPrice:19.99}),makeOffer({monetizationType:'BUY',retailPrice:9.99}),makeOffer()]);
  assert.equal(result.find(o=>o.type==='buy').price,9.99);assert.equal(result.find(o=>o.type==='subscription').price,null);
});
test('Unsafe and aggregator action links are excluded',()=>{
  const urls=['javascript:alert(1)','http://netflix.com/title/1','https://user:password@netflix.com/','https://www.justwatch.com/tr/tv-sovu/silo'];
  assert.equal(normalizeOffers(urls.map(standardWebURL=>makeOffer({standardWebURL}))).length,0);
});
test('Unrecognised access types and malformed prices are not invented',()=>{
  assert.equal(normalizeOffers([makeOffer({monetizationType:'UNKNOWN'})]).length,0);
  assert.equal(normalizeOffers([makeOffer({retailPrice:-10})])[0].price,null);
  assert.equal(normalizeOffers([makeOffer({retailPrice:'19.99'})])[0].price,null);
  assert.equal(normalizeOffers([makeOffer({currency:'<script>'})])[0].currency,null);
});
test('All supported countries send their own locale and retain their own source path',async()=>{
  for(const [country,locale] of Object.entries(WATCH_COUNTRIES)){
    let requests=0;
    const fetcher=async(url,options)=>{
      requests++;
      if(url==='https://api.tvmaze.com/shows/38052')return response(canonical);
      assert.equal(url,'https://apis.justwatch.com/graphql');
      const body=JSON.parse(options.body);assert.equal(body.variables.country,country);assert.equal(body.variables.language,locale.language);
      return graph([makeNode({content:{...makeNode().content,fullPath:`/${locale.path}/tv-show/silo`},offers:[makeOffer()]})]);
    };
    const result=await fetchAvailability(show.id,country,{fetcher,now:()=>new Date('2026-10-07T12:00:00Z')});
    assert.equal(result.country,country);assert.equal(result.match.method,'imdb');assert.equal(result.offers.length,1);assert.equal(requests,2);
    assert.equal(result.source,`https://www.justwatch.com/${locale.path}/tv-show/silo`);
  }
});
test('A matched title with no country offers is distinct from an unmatched title',async()=>{
  const fetcher=async url=>url.includes('/shows/')?response(canonical):graph([makeNode()]);
  const result=await fetchAvailability(show.id,'TR',{fetcher});
  assert.equal(result.state,'verified');assert.deepEqual(result.offers,[]);assert.ok(result.match);
});
test('Unmatched search results do not imply that the show is unavailable',async()=>{
  const fetcher=async url=>url.endsWith('/akas')?response([]):url.includes('/shows/')?response(canonical):graph([]);
  const result=await fetchAvailability(show.id,'TR',{fetcher});
  assert.equal(result.state,'unmatched');assert.equal(result.match,null);assert.deepEqual(result.offers,[]);
});
test('Localised aliases can find an exact IMDb identity without guessing',async()=>{
  let searches=0;
  const fetcher=async(url,options)=>{
    if(url.endsWith('/akas'))return response([{name:'Yeraltı',country:{code:'TR'}}]);
    if(url.includes('/shows/'))return response(canonical);
    const query=JSON.parse(options.body).variables.query;searches++;
    return query==='Yeraltı'?graph([makeNode()]):graph([]);
  };
  const result=await fetchAvailability(show.id,'TR',{fetcher});assert.equal(result.match.method,'imdb');assert.equal(searches,2);
});
test('Upstream failures are errors, never false empty availability records',async()=>{
  const fetcher=async url=>url.includes('/shows/')?response(canonical):new Response('Unavailable',{status:503});
  await assert.rejects(()=>fetchAvailability(show.id,'TR',{fetcher}),e=>e instanceof WatchError&&e.code==='SOURCE_UNAVAILABLE');
});
test('GraphQL errors with partial data cannot be treated as a successful country lookup',async()=>{
  const fetcher=async url=>url.includes('/shows/')?response(canonical):response({errors:[{message:'error'}],data:{popularTitles:{edges:[]}}});
  await assert.rejects(()=>fetchAvailability(show.id,'TR',{fetcher}),e=>e.code==='SOURCE_UNAVAILABLE');
});
test('A missing canonical show and malformed query inputs are rejected',async()=>{
  await assert.rejects(()=>fetchAvailability(show.id,'TR',{fetcher:async()=>new Response('',{status:404})}),e=>e.status===404);
  for(const [id,country]of [[0,'TR'],[NaN,'US'],[38052,'XX'],[2147483648,'TR']])
    await assert.rejects(()=>fetchAvailability(id,country),e=>e.status===400);
});
