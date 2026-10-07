import {query} from './db.js';
import {WATCH_COUNTRIES,WatchError,fetchAvailability} from './watch-core.js';

const memory=new Map(),inflight=new Map();
const VERSION=1;
const maxStale=72*60*60*1000;
const ttl=record=>record.state==='verified'&&record.offers.length?6*60*60*1000:60*60*1000;
const age=record=>Date.now()-new Date(record.checkedAt).getTime();
function remember(key,record){memory.set(key,record);if(memory.size>500)memory.delete(memory.keys().next().value);}
function validRecord(record,id,country){return record&&record.show?.id===id&&record.country===country&&
  ['verified','unmatched'].includes(record.state)&&Array.isArray(record.offers)&&record.offers.length<=100&&Number.isFinite(age(record));}

async function load(id,country,key){
  let cached=memory.get(key);
  if(cached&&age(cached)<ttl(cached))return cached;
  try{
    const {rows}=await query('SELECT payload FROM sahne_watch_cache WHERE show_id=$1 AND country=$2 AND version=$3',[id,country,VERSION]);
    const record=rows[0]?.payload;
    if(validRecord(record,id,country)){cached=record;remember(key,cached);if(age(cached)<ttl(cached))return cached;}
  }catch{/* Availability remains usable when only the cache is unavailable. */}
  try{
    const record=await fetchAvailability(id,country);
    remember(key,record);
    try{await query(`INSERT INTO sahne_watch_cache(show_id,country,version,payload,checked_at)
      VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(show_id,country) DO UPDATE
      SET version=EXCLUDED.version,payload=EXCLUDED.payload,checked_at=EXCLUDED.checked_at`,[id,country,VERSION,JSON.stringify(record),record.checkedAt]);}catch{}
    return record;
  }catch(error){
    if(cached&&cached.state==='verified'&&age(cached)<maxStale)return {...cached,freshness:'stale'};
    throw error;
  }
}

export async function getAvailability(id,country){
  if(!Number.isSafeInteger(id)||id<1||id>2_147_483_647||!WATCH_COUNTRIES[country])
    throw new WatchError('INVALID_INPUT','Geçerli bir dizi ve ülke seç.',400);
  const key=`${id}:${country}`;
  if(!inflight.has(key))inflight.set(key,load(id,country,key).finally(()=>inflight.delete(key)));
  return inflight.get(key);
}

export async function watchHandler(request){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  try{
    const url=new URL(request.url),id=Number(url.searchParams.get('id')),country=url.searchParams.get('country')||'TR';
    if(!/^[1-9]\d{0,9}$/.test(url.searchParams.get('id')||'')||[...url.searchParams.keys()].some(k=>!['id','country'].includes(k)))
      throw new WatchError('INVALID_INPUT','Geçerli bir dizi ve ülke seç.',400);
    const record=await getAvailability(id,country);
    return Response.json(record,{headers});
  }catch(error){
    const known=error instanceof WatchError;
    return Response.json({error:{code:known?error.code:'SOURCE_UNAVAILABLE',
      message:known?error.message:'İzleme bilgileri şu an yüklenemedi. Tekrar deneyebilirsin.'}},
      {status:known?error.status:503,headers});
  }
}
