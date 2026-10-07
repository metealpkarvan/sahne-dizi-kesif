'use strict';
(() => {
  const entries=new Map(),pending=new Map();
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&Number(id)<=2147483647;
  const ttl=record=>record.state==='partial'||record.freshness==='stale'?300000:86400000;
  async function lookup(id,{retry=false}={}){
    id=Number(id);if(!validId(id))throw Error('Geçerli bir dizi seç.');
    const cached=entries.get(id);
    if(!retry&&cached&&Date.now()-cached.loadedAt<ttl(cached.record))return cached.record;
    if(pending.has(id))return pending.get(id);
    const work=(async()=>{
      const response=await fetch(`/api/media?id=${id}`,{credentials:'omit',signal:AbortSignal.timeout(28000)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error?.message||'Dizi görselleri şu an yüklenemedi.');
      if(data.show?.id!==id||!Array.isArray(data.images))throw Error('Dizi görselleri doğrulanamadı.');
      const trailer=data.trailer&&/^[A-Za-z0-9_-]{11}$/.test(data.trailer.videoId)?{
        ...data.trailer,url:`https://www.youtube.com/watch?v=${data.trailer.videoId}`,thumbnail:safe(data.trailer.thumbnail)
      }:null;
      const record={...data,trailer,images:data.images.slice(0,60).map(item=>({...item,url:safe(item.url),thumbnail:safe(item.thumbnail)||safe(item.url)})).filter(item=>item.url)};
      entries.set(id,{record,loadedAt:Date.now()});if(entries.size>500)entries.delete(entries.keys().next().value);
      return record;
    })().finally(()=>pending.delete(id));
    pending.set(id,work);return work;
  }
  window.SahneMedia={lookup,get:id=>entries.get(Number(id))?.record||null};
})();
