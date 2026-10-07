import {query} from './db.js';
import {fetchMedia,MediaError,validShowId} from './media-core.js';

const memory=new Map(),inflight=new Map(),VERSION=2;
const age=record=>Date.now()-new Date(record.checkedAt).getTime();
const ttl=record=>record.state==='partial'?15*60*1000:record.trailer?12*60*60*1000:60*60*1000;
const valid=(record,id)=>record?.show?.id===id&&['ready','partial'].includes(record.state)&&Array.isArray(record.images)&&
  record.images.length<=16&&['available','missing','unmatched','unavailable'].includes(record.trailerStatus)&&Number.isFinite(age(record));
function remember(id,record){memory.set(id,record);if(memory.size>800)memory.delete(memory.keys().next().value);}

async function load(id){
  let cached=memory.get(id);
  if(cached&&age(cached)<ttl(cached))return cached;
  try{
    const {rows}=await query('SELECT payload FROM sahne_media_cache WHERE show_id=$1 AND version=$2',[id,VERSION]);
    const record=rows[0]?.payload;
    if(valid(record,id)){cached=record;remember(id,cached);if(age(cached)<ttl(cached))return cached;}
  }catch{/* Public media lookup remains available if its cache is unavailable. */}
  try{
    const record=await fetchMedia(id);
    // A temporary source failure must not replace an older, usable trailer.
    if(record.trailerStatus==='unavailable'&&cached?.trailer&&age(cached)<72*60*60*1000)
      return {...cached,freshness:'stale'};
    remember(id,record);
    try{await query(`INSERT INTO sahne_media_cache(show_id,version,payload,checked_at) VALUES($1,$2,$3::jsonb,$4)
      ON CONFLICT(show_id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload,checked_at=EXCLUDED.checked_at`,
      [id,VERSION,JSON.stringify(record),record.checkedAt]);}catch{}
    return record;
  }catch(error){if(cached&&age(cached)<72*60*60*1000)return {...cached,freshness:'stale'};throw error;}
}

export async function getMedia(id){
  if(!validShowId(id))throw new MediaError('INVALID_INPUT','Geçerli bir dizi seç.',400);
  if(!inflight.has(id))inflight.set(id,load(id).finally(()=>inflight.delete(id)));
  return inflight.get(id);
}

export async function mediaHandler(request){
  const headers={'Cache-Control':'public, max-age=60, s-maxage=300','X-Content-Type-Options':'nosniff'};
  try{
    const url=new URL(request.url),value=url.searchParams.get('id');
    if(!/^[1-9]\d{0,9}$/.test(value||'')||[...url.searchParams.keys()].some(key=>key!=='id'))
      throw new MediaError('INVALID_INPUT','Geçerli bir dizi seç.',400);
    return Response.json(await getMedia(Number(value)),{headers});
  }catch(error){
    const known=error instanceof MediaError;
    return Response.json({error:{code:known?error.code:'SOURCE_UNAVAILABLE',message:known?error.message:'Dizi medyaları şu an yüklenemedi. Tekrar deneyebilirsin.'}},
      {status:known?error.status:503,headers:{...headers,'Cache-Control':'no-store'}});
  }
}
