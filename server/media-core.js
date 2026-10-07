import {matchTitle} from './watch-core.js';

const MEDIA_QUERY = `query SahneMedia($query: String!) {
  popularTitles(country: US, first: 12, filter: {searchQuery: $query}) {
    edges { node {
      id objectType
      content(country: US, language: en) {
        title originalTitle originalReleaseYear fullPath externalIds { imdbId }
        clips(country: US, language: en, first: 12, providers: [YOUTUBE]) {
          externalId provider name sourceUrl
        }
        backdrops(profile: S1920, format: JPG) { backdropUrl }
      }
      ... on Show {
        seasons(limit: 1) {
          content(country: US, language: en) {
            clips(country: US, language: en, first: 12, providers: [YOUTUBE]) {
              externalId provider name sourceUrl
            }
          }
        }
      }
    } }
  }
}`;

export class MediaError extends Error {
  constructor(code,message,status=503){super(message);this.code=code;this.status=status;}
}

const cleanText=(value,max=200)=>String(value||'').trim().slice(0,max);
const titleWords=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const relatesToTitle=(title,names)=>!names.length||names.some(name=>{
  const phrase=titleWords(name);return phrase&&` ${titleWords(title)} `.includes(` ${phrase} `);
});
export const validShowId=id=>Number.isSafeInteger(id)&&id>0&&id<=2_147_483_647;
const mediaUrl=(value,host)=>{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname===host?u.href:null;}catch{return null;}
};
const imageType=raw=>!raw||typeof raw!=='object'?null:raw.type==='background'||(!raw.type&&raw.resolutions?.original?.width>raw.resolutions?.original?.height*1.3)
  ?'background':raw.type==='banner'?'banner':raw.type==='poster'||raw.type===null?'poster':null;

export function normalizeImages(tvmazeImages,backdrops,title,mainImage){
  const result=[],seen=new Set();
  const add=image=>{if(image.url&&!seen.has(image.url)){seen.add(image.url);result.push(image);}};
  // Landscape artwork belongs to the exact IMDb-matched show, never a search neighbour.
  for(const raw of (Array.isArray(backdrops)?backdrops:[]).slice(0,8)){
    const path=raw?.backdropUrl;
    if(typeof path!=='string'||!/^\/backdrop\/\d+\/s1920\/[\w%.,()\-]+\.jpg$/i.test(path))continue;
    add({url:`https://images.justwatch.com${path}`,thumbnail:`https://images.justwatch.com${path.replace('/s1920/','/s640/')}`,
      type:'background',caption:`${title} · Sahne görseli`,source:'JustWatch'});
  }
  const rows=(Array.isArray(tvmazeImages)?tvmazeImages:[]).slice(0,300).filter(raw=>imageType(raw));
  rows.sort((a,b)=>({background:0,banner:1,poster:2}[imageType(a)]-({background:0,banner:1,poster:2}[imageType(b)]))||Number(b.main)-Number(a.main));
  let posters=0;
  for(const raw of rows){
    const type=imageType(raw),url=mediaUrl(raw.resolutions?.original?.url,'static.tvmaze.com');
    if(!url||!new URL(url).pathname.startsWith('/uploads/images/'))continue;
    if(type==='poster'&&posters++>=6)continue;
    const thumbnail=mediaUrl(raw.resolutions?.medium?.url,'static.tvmaze.com')||url;
    add({url,thumbnail,type,caption:`${title} · ${type==='poster'?'Afiş':'Sahne görseli'}`,source:'TVmaze'});
  }
  const primary=mediaUrl(mainImage?.original,'static.tvmaze.com');
  if(primary&&new URL(primary).pathname.startsWith('/uploads/images/'))add({url:primary,thumbnail:mediaUrl(mainImage?.medium,'static.tvmaze.com')||primary,
    type:'poster',caption:`${title} · Ana afiş`,source:'TVmaze'});
  return result.slice(0,16);
}

export function trailerCandidates(node,names=[]){
  const seasonClips=node?.seasons?.[0]?.content?.clips,titleClips=node?.content?.clips;
  const clips=[...(Array.isArray(seasonClips)?seasonClips:[]).slice(0,24).map((clip,index)=>({clip,firstSeason:true,index})),
    ...(Array.isArray(titleClips)?titleClips:[]).slice(0,24).map((clip,index)=>({clip,firstSeason:false,index}))];
  const candidates=new Map();
  for(const {clip,firstSeason,index} of clips.slice(0,48)){
    const videoId=clip?.externalId,title=cleanText(clip?.name);
    if(clip?.provider!=='YOUTUBE'||!/^[A-Za-z0-9_-]{11}$/.test(videoId||'')||!/(trailer|teaser|fragman|tanıtım)/i.test(title)||!relatesToTitle(title,names))continue;
    if(/(fan.?made|fan trailer|concept|recap|explained|reaction|parody)/i.test(title))continue;
    const source=mediaUrl(clip.sourceUrl,'www.youtube.com')||mediaUrl(clip.sourceUrl,'youtube.com');
    if(!source||new URL(source).pathname!=='/watch'||new URL(source).searchParams.get('v')!==videoId)continue;
    const score=(firstSeason?30:0)+( /official|resm[iî]/i.test(title)?45:0)+(/trailer|fragman/i.test(title)?15:0)
      +(/türkçe|turkish/i.test(title)?5:0)-index;
    const previous=candidates.get(videoId);
    if(!previous||score>previous.score)candidates.set(videoId,{videoId,title,score});
  }
  return [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,3);
}

export function normalizeTrailer(candidate,metadata,names=[]){
  if(!candidate||!/^[A-Za-z0-9_-]{11}$/.test(candidate.videoId||'')||!metadata||metadata.provider_name!=='YouTube')return null;
  const title=cleanText(metadata.title)||candidate.title,author=cleanText(metadata.author_name,120);
  if(/fan.?made|fan trailer|concept trailer|parody|reaction/i.test(title)||!relatesToTitle(title,names))return null;
  return {videoId:candidate.videoId,title,url:`https://www.youtube.com/watch?v=${candidate.videoId}`,
    thumbnail:`https://i.ytimg.com/vi/${candidate.videoId}/hqdefault.jpg`,author,
    verifiedPublisher:/^(Netflix|Apple TV|HBO|HBO Max|Max|Disney Plus|Disney\+|Prime Video|Amazon Prime Video|FX Networks|Hulu|BBC|Paramount Plus|Paramount\+|AMC|Peacock)$/i.test(author)};
}

async function jsonRequest(fetcher,url,options,deadline){
  const response=await fetcher(url,{...options,signal:AbortSignal.any([deadline,AbortSignal.timeout(6500)])});
  if(response.status===404&&/^https:\/\/api\.tvmaze\.com\/shows\/\d+$/.test(url))throw new MediaError('SHOW_NOT_FOUND','Bu dizi kaydı bulunamadı.',404);
  if(!response.ok)throw new MediaError('SOURCE_UNAVAILABLE','Dizi medyaları şu an yüklenemedi.');
  const text=await response.text();
  if(text.length>2_000_000)throw new MediaError('SOURCE_UNAVAILABLE','Dizi medyaları şu an yüklenemedi.');
  try{return JSON.parse(text);}catch{throw new MediaError('SOURCE_UNAVAILABLE','Dizi medyaları şu an yüklenemedi.');}
}

export async function fetchMedia(id,{fetcher=fetch,now=()=>new Date(),getShow}={}){
  if(!validShowId(id))throw new MediaError('INVALID_INPUT','Geçerli bir dizi seç.',400);
  const deadline=AbortSignal.timeout(24_000);
  const raw=getShow?await getShow(id):await jsonRequest(fetcher,`https://api.tvmaze.com/shows/${id}`,{},deadline);
  if(Number(raw?.id)!==id||!cleanText(raw?.name))throw new MediaError('SOURCE_UNAVAILABLE','Dizi kimliği doğrulanamadı.');
  const show={id,title:cleanText(raw.name),year:Number(String(raw.premiered||'').slice(0,4))||null,
    imdbId:/^tt\d+$/.test(raw.externals?.imdb||'')?raw.externals.imdb:null};
  const lookup=async query=>{
    const data=await jsonRequest(fetcher,'https://apis.justwatch.com/graphql',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({query:MEDIA_QUERY,variables:{query}})},deadline);
    if(data.errors?.length||!Array.isArray(data.data?.popularTitles?.edges))throw new MediaError('SOURCE_UNAVAILABLE','Fragman kaynağına şu an ulaşılamıyor.');
    return data.data.popularTitles.edges.map(edge=>edge?.node).filter(Boolean);
  };
  const findMatched=async()=>{
    let nodes=await lookup(show.title),matched=matchTitle(show,nodes);
    if(matched)return matched;
    let aliases=[];
    try{const rows=await jsonRequest(fetcher,`https://api.tvmaze.com/shows/${id}/akas`,{},deadline);
      if(Array.isArray(rows))aliases=[...new Set(rows.filter(row=>row.country?.code==='US'||row.country?.code==='TR'||!row.country)
        .map(row=>cleanText(row.name)).filter(name=>name&&name!==show.title))].slice(0,2);
    }catch{}
    for(const alias of aliases){nodes.push(...await lookup(alias));matched=matchTitle(show,nodes,aliases);if(matched)return matched;}
    return null;
  };
  const [artwork,match]=await Promise.allSettled([
    jsonRequest(fetcher,`https://api.tvmaze.com/shows/${id}/images`,{},deadline),findMatched(),
  ]);
  const matched=match.status==='fulfilled'?match.value:null;
  const node=matched?.node,path=node?.content?.fullPath;
  const source={tvmaze:`https://www.tvmaze.com/shows/${id}`,
    justwatch:typeof path==='string'&&/^\/us\/tv-show\/[\w-]+$/.test(path)?`https://www.justwatch.com${path}`:null};
  const images=normalizeImages(artwork.status==='fulfilled'?artwork.value:[],node?.content?.backdrops,show.title,raw.image);
  let trailer=null,trailerStatus=match.status==='rejected'?'unavailable':matched?'missing':'unmatched';
  if(matched){
    const names=[show.title,node.content?.title,node.content?.originalTitle].filter(Boolean);
    const candidates=trailerCandidates(node,names);
    if(candidates.length){
      const checked=await Promise.allSettled(candidates.map(async candidate=>{
        const metadata=await jsonRequest(fetcher,`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${candidate.videoId}`)}&format=json`,{},deadline);
        const preview=normalizeTrailer(candidate,metadata,names);
        return preview?{preview,score:candidate.score+(preview.verifiedPublisher?100:0)+(/Rotten Tomatoes|IGN|Entertainment Weekly/i.test(preview.author)?30:0)}:null;
      }));
      trailer=checked.filter(row=>row.status==='fulfilled'&&row.value).map(row=>row.value).sort((a,b)=>b.score-a.score)[0]?.preview||null;
      trailerStatus=trailer?'available':checked.some(row=>row.status==='rejected')?'unavailable':'missing';
    }
  }
  const partial=artwork.status==='rejected'||trailerStatus==='unavailable';
  if(partial&&!images.length&&!trailer)throw new MediaError('SOURCE_UNAVAILABLE','Dizi medyaları şu an yüklenemedi. Tekrar deneyebilirsin.');
  return {show:{id,title:show.title},trailer,images,source,checkedAt:now().toISOString(),freshness:'fresh',
    state:partial?'partial':'ready',trailerStatus,match:matched?{id:node.id,method:matched.method}:null};
}
