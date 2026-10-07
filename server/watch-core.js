export const WATCH_COUNTRIES = {
  TR: {language:'tr',path:'tr'}, US: {language:'en',path:'us'},
  GB: {language:'en',path:'uk'}, DE: {language:'de',path:'de'},
};

const SEARCH_QUERY = `query SahneAvailability($country: Country!, $language: Language!, $query: String!) {
  popularTitles(country: $country, first: 12, filter: {searchQuery: $query}) {
    edges { node {
      id objectType objectId
      content(country: $country, language: $language) {
        title originalTitle originalReleaseYear fullPath externalIds { imdbId }
      }
      offers(country: $country, platform: WEB) {
        monetizationType presentationType retailPrice(language: $language)
        currency standardWebURL elementCount
        package { packageId clearName icon(profile: S100) }
      }
    } }
  }
}`;

export class WatchError extends Error {
  constructor(code, message, status=503) { super(message);this.code=code;this.status=status; }
}

const titleKey = value => String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
  .toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const httpsUrl = value => {
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null; }
  catch { return null; }
};

// IMDb identity takes precedence. A matching title must also have the same year;
// remakes and different shows with the same title are never silently selected.
export function matchTitle(show, nodes, aliases=[]) {
  const unique=[...new Map(nodes.filter(n=>n?.objectType==='SHOW'&&/^ts\d+$/.test(n.id||''))
    .map(node=>[node.id,node])).values()];
  if (show.imdbId) {
    const matches=unique.filter(n=>n.content?.externalIds?.imdbId===show.imdbId);
    if(matches.length===1)return {node:matches[0],method:'imdb'};
  }
  if(!show.year)return null;
  const names=new Set([show.title,...aliases].map(titleKey).filter(Boolean));
  const matches=unique.filter(node=>{
    const c=node.content;
    if(!c||Number(c.originalReleaseYear)!==show.year)return false;
    if(show.imdbId&&c.externalIds?.imdbId&&c.externalIds.imdbId!==show.imdbId)return false;
    return [c.title,c.originalTitle].some(name=>names.has(titleKey(name)));
  });
  return matches.length===1?{node:matches[0],method:'title-year'}:null;
}

export function normalizeOffers(rawOffers) {
  const types={FLATRATE:'subscription',RENT:'rent',BUY:'buy',FREE:'free',ADS:'ads'};
  const qualities={SD:1,HD:2,FULL_HD:3,_4K:4};
  const groups=new Map();
  for(const raw of (Array.isArray(rawOffers)?rawOffers:[]).slice(0,600)) {
    const type=types[raw?.monetizationType],provider=raw?.package;
    const url=httpsUrl(raw?.standardWebURL);
    if(!type||!provider||!String(provider.clearName||'').trim()||!url)continue;
    // The action must lead to the streaming service, never back to an aggregator.
    const host=new URL(url).hostname;
    if(/(^|\.)justwatch\.com$/i.test(host))continue;
    const key=`${provider.packageId}:${provider.clearName}:${type}`;
    const quality=raw.presentationType==='_4K'?'4K':String(raw.presentationType||'');
    const price=typeof raw.retailPrice==='number'&&Number.isFinite(raw.retailPrice)&&raw.retailPrice>=0?raw.retailPrice:null;
    const currency=/^[A-Z]{3}$/.test(raw.currency||'')?raw.currency:null;
    const icon=typeof provider.icon==='string'&&/^\/icon\/[\w/.-]+(?:\{format\})?$/.test(provider.icon)
      ?`https://images.justwatch.com${provider.icon.replace('{format}','png')}`:null;
    const count=Number.isSafeInteger(raw.elementCount)&&raw.elementCount>0?raw.elementCount:null;
    const candidate={name:String(provider.clearName).slice(0,120),providerId:provider.packageId,type,url,icon,
      quality:quality.slice(0,12)||null,price,currency,coverageCount:count};
    const previous=groups.get(key);
    if(!previous){groups.set(key,candidate);continue;}
    // Keep the best available format and the lowest listed price independently.
    if((qualities[raw.presentationType]||0)>(qualities[previous.quality==='4K'?'_4K':previous.quality]||0))previous.quality=candidate.quality;
    if(price!==null&&(previous.price===null||price<previous.price)&&(!previous.currency||previous.currency===currency)){
      previous.price=price;previous.currency=currency;previous.url=url;
    }
    if(count!==null)previous.coverageCount=Math.max(previous.coverageCount||0,count);
  }
  const order={subscription:0,free:1,ads:2,rent:3,buy:4};
  return [...groups.values()].sort((a,b)=>order[a.type]-order[b.type]||a.name.localeCompare(b.name)).slice(0,100);
}

async function jsonRequest(fetcher,url,options={},deadline) {
  const response=await fetcher(url,{...options,signal:AbortSignal.any([deadline,AbortSignal.timeout(6500)])});
  if(response.status===404&&url.startsWith('https://api.tvmaze.com/shows/'))
    throw new WatchError('SHOW_NOT_FOUND','Bu dizi kaydı bulunamadı.',404);
  if(!response.ok)throw new WatchError('SOURCE_UNAVAILABLE','İzleme bilgisi servisine şu an ulaşılamıyor.');
  const text=await response.text();
  if(text.length>2_000_000)throw new WatchError('SOURCE_UNAVAILABLE','İzleme bilgisi şu an yüklenemedi.');
  try{return JSON.parse(text);}catch{throw new WatchError('SOURCE_UNAVAILABLE','İzleme bilgisi şu an yüklenemedi.');}
}

export async function fetchAvailability(id,country,{fetcher=fetch,now=()=>new Date(),getShow}={}) {
  const locale=WATCH_COUNTRIES[country];
  if(!locale||!Number.isSafeInteger(id)||id<1||id>2_147_483_647)
    throw new WatchError('INVALID_INPUT','Geçerli bir dizi ve ülke seç.',400);
  const deadline=AbortSignal.timeout(22_000);
  const raw=getShow?await getShow(id):await jsonRequest(fetcher,`https://api.tvmaze.com/shows/${id}`,{},deadline);
  if(Number(raw?.id)!==id||!String(raw?.name||'').trim())throw new WatchError('SOURCE_UNAVAILABLE','Dizi kimliği doğrulanamadı.');
  const show={id,title:String(raw.name).slice(0,200),year:Number(String(raw.premiered||'').slice(0,4))||null,
    imdbId:/^tt\d+$/.test(raw.externals?.imdb||'')?raw.externals.imdb:null};
  const lookup=async query=>{
    const result=await jsonRequest(fetcher,'https://apis.justwatch.com/graphql',{
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({query:SEARCH_QUERY,variables:{country,language:locale.language,query}}),
    },deadline);
    if(result.errors?.length||!Array.isArray(result.data?.popularTitles?.edges))
      throw new WatchError('SOURCE_UNAVAILABLE','İzleme bilgisi servisine şu an ulaşılamıyor.');
    return result.data.popularTitles.edges.map(edge=>edge?.node).filter(Boolean);
  };
  let nodes=await lookup(show.title),matched=matchTitle(show,nodes),aliases=[];
  if(!matched) {
    // Localised TVmaze aliases improve foreign-title matching without guessing.
    let rows=[];
    try{rows=await jsonRequest(fetcher,`https://api.tvmaze.com/shows/${id}/akas`,{},deadline);}catch{}
    if(Array.isArray(rows))aliases=[...new Set(rows.filter(r=>r.country?.code===country||r.country?.code==='US')
      .sort((a,b)=>Number(b.country?.code===country)-Number(a.country?.code===country))
      .map(r=>String(r.name||'').trim()).filter(name=>name&&name.length<=200&&titleKey(name)!==titleKey(show.title)))].slice(0,2);
    for(const alias of aliases){nodes.push(...await lookup(alias));matched=matchTitle(show,nodes,aliases);if(matched)break;}
  }
  const checkedAt=now().toISOString();
  if(!matched)return {show,country,state:'unmatched',offers:[],source:`https://www.justwatch.com/${locale.path}`,
    checkedAt,freshness:'fresh',match:null};
  const content=matched.node.content,path=content.fullPath;
  const source=typeof path==='string'&&path.startsWith(`/${locale.path}/`)?`https://www.justwatch.com${path}`:`https://www.justwatch.com/${locale.path}`;
  return {show,country,state:'verified',offers:normalizeOffers(matched.node.offers),source,checkedAt,freshness:'fresh',
    match:{id:matched.node.id,method:matched.method,title:String(content.title||show.title).slice(0,200)}};
}
