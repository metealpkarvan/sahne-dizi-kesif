import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchMedia,MediaError,normalizeImages,normalizeTrailer,trailerCandidates,validShowId} from '../server/media-core.js';

const id=38052,videoId='MvWE7u_zLxk';
const show={id,name:'Silo',premiered:'2023-05-05',externals:{imdb:'tt14688458'},image:{original:'https://static.tvmaze.com/uploads/images/original_untouched/459/1149371.jpg'}};
const clip=(patch={})=>({externalId:videoId,provider:'YOUTUBE',name:'Silo Season 1 Trailer',sourceUrl:`https://www.youtube.com/watch?v=${videoId}`,...patch});
const matched=(patch={})=>({id:'ts297178',objectType:'SHOW',content:{title:'Silo',originalTitle:'Silo',originalReleaseYear:2023,fullPath:'/us/tv-show/silo',externalIds:{imdbId:'tt14688458'},clips:[clip()],backdrops:[{backdropUrl:'/backdrop/346257620/s1920/silo.jpg'}]},...patch});
const poster={type:'poster',main:true,resolutions:{original:{url:'https://static.tvmaze.com/uploads/images/original_untouched/459/1149371.jpg',width:2000,height:3000},medium:{url:'https://static.tvmaze.com/uploads/images/medium_portrait/459/1149371.jpg'}}};
const backdrop={type:'background',resolutions:{original:{url:'https://static.tvmaze.com/uploads/images/original_untouched/500/1250000.jpg',width:1920,height:1080}}};
const metadata={provider_name:'YouTube',title:'Silo — Official Trailer',author_name:'Apple TV'};
const now=()=>new Date('2026-10-07T10:00:00.000Z');
function source({nodes=[matched()],images=[poster],showRecord=show,oembed=metadata,failImages=false,failJW=false,failVideo=false,aliases=[],episodes=[],failEpisodes=false}={}){
  const requests=[];
  const fetcher=async(url,options={})=>{
    requests.push({url,options});
    if(url===`https://api.tvmaze.com/shows/${id}`)return Response.json(showRecord);
    if(url.endsWith('/images'))return failImages?new Response('',{status:503}):Response.json(images);
    if(url.endsWith('/episodes?specials=1'))return failEpisodes?new Response('',{status:503}):Response.json(episodes);
    if(url.endsWith('/akas'))return Response.json(aliases);
    if(url==='https://apis.justwatch.com/graphql')return failJW?Response.json({errors:[{message:'Unavailable'}]}):Response.json({data:{popularTitles:{edges:nodes.map(node=>({node}))}}});
    if(url.startsWith('https://www.youtube.com/oembed?'))return failVideo?new Response('',{status:404}):Response.json(oembed);
    throw new Error(`Unexpected endpoint: ${url}`);
  };
  return {fetcher,requests};
}

test('accepts only positive bounded TVmaze integers',()=>{
  for(const value of [0,-1,1.5,NaN,Infinity,'38052',2_147_483_648])assert.equal(validShowId(value),false);
  assert.equal(validShowId(id),true);
});

test('landscape art comes first, poster images follow, duplicates are removed',()=>{
  const result=normalizeImages([poster,backdrop,poster],[{backdropUrl:'/backdrop/346257620/s1920/silo.jpg'}],'Silo',show.image);
  assert.deepEqual(result.map(row=>row.type),['background','background','poster']);
  assert.equal(result[0].thumbnail,'https://images.justwatch.com/backdrop/346257620/s640/silo.jpg');
});

test('rejects untrusted artwork URLs and typography while bounding poster count',()=>{
  const rows=Array.from({length:30},(_,i)=>({...poster,resolutions:{original:{url:`https://static.tvmaze.com/uploads/images/original_untouched/1/${i}.jpg`}}}));
  rows.push({...backdrop,resolutions:{original:{url:'https://attacker.example/leak.jpg'}}},{...poster,type:'typography'});
  const result=normalizeImages(rows,[{backdropUrl:'//attacker.example/a.jpg'},{backdropUrl:'/backdrop/1/s1920/../../leak.jpg'}],'Silo');
  assert.equal(result.length,6);
  assert.ok(result.every(row=>new URL(row.url).hostname==='static.tvmaze.com'));
});

test('legacy landscape image dimensions are respected',()=>{
  const result=normalizeImages([{...backdrop,type:null}],[],'Silo');
  assert.equal(result[0].type,'background');
});

test('trailer candidates reject guessed IDs, mismatched source URLs and non-trailer videos',()=>{
  const clips=[clip(),clip({externalId:'bad'}),clip({sourceUrl:'https://www.youtube.com/watch?v=YSQf-3TuO6g'}),clip({name:'Silo ending explained'}),clip({name:'Silo fan-made trailer'}),clip({provider:'DAILYMOTION'})];
  const result=trailerCandidates(matched({content:{clips}}));
  assert.equal(result.length,1);assert.equal(result[0].videoId,videoId);
});

test('first season and explicit official trailers rank ahead of random later teasers',()=>{
  const node=matched({content:{clips:[clip({externalId:'2Ib8yeFQ6gw',sourceUrl:'https://www.youtube.com/watch?v=2Ib8yeFQ6gw',name:'SILO Teaser'})]},seasons:[{content:{clips:[clip()]}}]});
  assert.equal(trailerCandidates(node)[0].videoId,videoId);
});

test('oEmbed publisher is verified independently and not inferred from video title',()=>{
  const candidate=trailerCandidates(matched())[0];
  assert.equal(normalizeTrailer(candidate,metadata).verifiedPublisher,true);
  assert.equal(normalizeTrailer(candidate,{...metadata,author_name:'Fan channel'}).verifiedPublisher,false);
  assert.equal(normalizeTrailer(candidate,{...metadata,provider_name:'Attacker'}),null);
  assert.equal(normalizeTrailer(candidate,{...metadata,title:'Silo Fan-made Trailer'}),null);
});

test('rejects a related word such as Darksiders from Dark even if the catalog clip is misplaced',()=>{
  const bad=clip({name:'Darksiders 4 - Official Announcement Trailer'});
  assert.equal(trailerCandidates(matched({content:{clips:[bad]}}),['Dark']).length,0);
  assert.equal(normalizeTrailer(trailerCandidates(matched())[0],{...metadata,title:'Darksiders 4 Official Trailer'},['Dark']),null);
  assert.ok(normalizeTrailer(trailerCandidates(matched())[0],{...metadata,title:'DARK | Official Trailer'},['Dark']));
});

test('a real matched trailer and related artwork produce one safe response',async()=>{
  const fixture=source(),record=await fetchMedia(id,{...fixture,now});
  assert.equal(record.trailer.videoId,videoId);assert.equal(record.trailer.url,`https://www.youtube.com/watch?v=${videoId}`);
  assert.equal(record.source.justwatch,'https://www.justwatch.com/us/tv-show/silo');
  assert.equal(record.match.method,'imdb');assert.equal(record.trailerStatus,'available');assert.equal(record.checkedAt,now().toISOString());
  assert.ok(fixture.requests.some(row=>row.url.includes('oembed?url=https%3A%2F%2Fwww.youtube.com')));
});

test('a different show with the same title and a movie are not accepted',async()=>{
  const fixture=source({nodes:[matched({id:'tm297178',objectType:'MOVIE'}),matched({id:'ts999',content:{title:'Silo',originalReleaseYear:2023,externalIds:{imdbId:'tt999999'}}})]});
  const record=await fetchMedia(id,{...fixture,now});
  assert.equal(record.match,null);assert.equal(record.trailer,null);assert.equal(record.trailerStatus,'unmatched');
  assert.equal(record.images.length,1);assert.ok(!fixture.requests.some(row=>row.url.includes('oembed')));
});

test('missing metadata is distinct from a source outage',async()=>{
  const empty=matched({content:{...matched().content,clips:[]}});
  const missing=await fetchMedia(id,{...source({nodes:[empty]}),now});
  const unavailable=await fetchMedia(id,{...source({failJW:true}),now});
  assert.equal(missing.trailerStatus,'missing');assert.equal(missing.state,'ready');
  assert.equal(unavailable.trailerStatus,'unavailable');assert.equal(unavailable.state,'partial');
  assert.equal(unavailable.images[0].source,'TVmaze');
});

test('unavailable video does not start an unverified embed',async()=>{
  const record=await fetchMedia(id,{...source({failVideo:true}),now});
  assert.equal(record.trailer,null);assert.equal(record.trailerStatus,'unavailable');assert.equal(record.state,'partial');
});

test('show poster remains usable when gallery and trailer services fail',async()=>{
  const record=await fetchMedia(id,{...source({failImages:true,failJW:true}),now});
  assert.equal(record.state,'partial');assert.equal(record.images[0].url,show.image.original);
});

test('no usable media plus a source failure is a retriable service error',async()=>{
  await assert.rejects(fetchMedia(id,{...source({showRecord:{...show,image:null},failImages:true,failJW:true}),now}),error=>error instanceof MediaError&&error.status===503);
});

test('canonical missing show is a 404 rather than an empty gallery',async()=>{
  await assert.rejects(fetchMedia(id,{fetcher:async()=>new Response('',{status:404}),now}),error=>error instanceof MediaError&&error.code==='SHOW_NOT_FOUND'&&error.status===404);
});

test('canonical identity cannot be swapped by upstream metadata',async()=>{
  await assert.rejects(fetchMedia(id,{...source({showRecord:{...show,id:169}}),now}),error=>error instanceof MediaError&&error.status===503);
});

test('official channel verification wins over a high ranking re-upload',async()=>{
  const other='2Ib8yeFQ6gw',node=matched({seasons:[{content:{clips:[clip({externalId:other,name:'Silo Official Trailer',sourceUrl:`https://www.youtube.com/watch?v=${other}`}),clip()]}}]});
  const fixture=source({nodes:[node]});
  const fetcher=async(url,options)=>url.includes(other)&&url.includes('oembed')?Response.json({...metadata,author_name:'MovieGasm'}):fixture.fetcher(url,options);
  const record=await fetchMedia(id,{fetcher,now});
  assert.equal(record.trailer.videoId,videoId);assert.equal(record.trailer.verifiedPublisher,true);
});

test('invalid input performs no external request',async()=>{
  let calls=0;
  await assert.rejects(fetchMedia(0,{fetcher:async()=>{calls++;}}),error=>error.status===400);
  assert.equal(calls,0);
});

const episode={season:1,number:1,name:'Freedom Day',image:{original:'https://static.tvmaze.com/uploads/images/original_untouched/450/1125000.jpg',medium:'https://static.tvmaze.com/uploads/images/medium_landscape/450/1125000.jpg'}};
test('genuine episode stills lead the gallery with first-season captions and a bounded count',()=>{
  const rows=Array.from({length:20},(_,i)=>({...episode,number:i+1,image:{original:`https://static.tvmaze.com/uploads/images/original_untouched/450/${1125000+i}.jpg`}}));
  rows.unshift({...episode,season:2,number:1,image:{original:'https://static.tvmaze.com/uploads/images/original_untouched/450/9999999.jpg'}});
  rows.unshift({...episode,image:{original:'https://attacker.example/still.jpg'}});
  const images=normalizeImages([poster],matched().content.backdrops,'Silo',show.image,rows);
  assert.equal(images[0].type,'episode');assert.match(images[0].caption,/1\. sezon, 1\. bölüm · Freedom Day/);
  assert.equal(images.filter(image=>image.type==='episode').length,8);
  assert.ok(!images.some(image=>image.url.includes('9999999')||image.url.includes('attacker')));
  assert.ok(images.length<=16);
});
test('episode photos are fetched for curated shows as well as catalog search results',async()=>{
  const fixture=source({episodes:[episode]});
  const record=await fetchMedia(id,{...fixture,now});
  assert.equal(record.images[0].type,'episode');assert.equal(record.images[0].url,episode.image.original);
  assert.ok(fixture.requests.some(request=>request.url.endsWith('/episodes?specials=1')));
  assert.equal(record.state,'ready');
});
test('an episode service failure preserves the usable trailer and artwork',async()=>{
  const record=await fetchMedia(id,{...source({failEpisodes:true}),now});
  assert.equal(record.trailer.videoId,videoId);assert.ok(record.images.length>0);assert.equal(record.state,'partial');
});
