'use strict';
(() => {
  const entries=new Map(),pending=new Map(),shows=new Map(),filters=new Map();
  let context={apiBase:'',countries:{TR:'Türkiye',US:'ABD',GB:'Birleşik Krallık',DE:'Almanya'}};
  const labels={subscription:'Abonelikle izle',free:'Ücretsiz seçenekler',ads:'Reklamlı izle',rent:'Kirala',buy:'Satın al'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  const keyFor=(id,country)=>`${id}:${country}`;
  const ttl=record=>record.state==='verified'&&record.offers.length?6*3600e3:3600e3;
  const current=entry=>entry?.status==='ready'&&entry.record.freshness==='fresh'&&Date.now()-new Date(entry.record.checkedAt).getTime()<ttl(entry.record);
  const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
  const screen='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4m-2-10 5 2.5-5 2.5z"/></svg>';

  function checkedDate(value){
    const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(date);
  }
  function header(show,country,record){
    const count=record?.offers?.length||0;
    return `<header class="watch-guide-heading"><div><span class="tiny-label">SAHNE / İZLEME REHBERİ</span><h3>${escape(show.name)} <em>nerede izlenir?</em></h3><p>${escape(context.countries[country])}${count?` · ${new Set(record.offers.map(o=>o.providerId||o.name)).size} platform · ${count} seçenek`:' için yayın seçenekleri'}</p></div><label class="watch-guide-country">Yayın ülkesi<select data-watch-country>${Object.entries(context.countries).map(([code,name])=>`<option value="${code}" ${country===code?'selected':''}>${escape(name)}</option>`).join('')}</select></label></header>`;
  }
  function source(record){
    return `<div class="watch-guide-source"><span>Kaynak kontrolü · ${escape(checkedDate(record.checkedAt))}</span><a href="${escape(safeUrl(record.source)||'https://www.justwatch.com')}" target="_blank" rel="noopener noreferrer">Veri: JustWatch ${arrow}</a></div>`;
  }
  function countries(country){
    return `<div class="watch-guide-countries" aria-label="Diğer ülkelerin yayın seçenekleri">${Object.entries(context.countries).filter(([code])=>code!==country).map(([code,name])=>`<button type="button" data-watch-region-choice="${code}">${escape(name)} ${arrow}</button>`).join('')}</div>`;
  }
  function empty(show,country,record){
    const verified=record.state==='verified';
    return `<div class="watch-guide-empty">${screen}<div><h4>${verified?`${escape(context.countries[country])} için yayın seçeneği listelenmiyor.`:'Bu dizi için platform kaydı eşleştirilemedi.'}</h4><p>${verified?'Bu ülke kaydında abonelik, kiralama veya satın alma seçeneği bulunmadı. Başka bir ülkenin seçeneklerini burada karşılaştırabilirsin.':'Aynı isimli farklı dizileri karıştırmamak için emin olmadığımız bir platform göstermiyoruz. Diğer ülkeleri kontrol edebilir veya daha sonra tekrar deneyebilirsin.'}</p>${countries(country)}</div></div>${source(record)}`;
  }
  function price(offer,country){
    if(offer.price===null||offer.price===undefined||!offer.currency)return '';
    try{return new Intl.NumberFormat(country==='GB'?'en-GB':country==='US'?'en-US':country==='DE'?'de-DE':'tr-TR',{style:'currency',currency:offer.currency,maximumFractionDigits:2}).format(offer.price);}catch{return '';}
  }
  function offerCard(offer,country){
    const url=safeUrl(offer.url),icon=safeUrl(offer.icon),amount=price(offer,country);
    const initials=String(offer.name||'').split(/\s+/).map(word=>word[0]).slice(0,2).join('');
    const detail=offer.type==='subscription'?'Abonelik gerekir':offer.type==='free'?'Bazı sezon veya bölümler':offer.type==='ads'?'Reklamlı erişim':amount?'Başlangıç fiyatı':'Fiyatı platformda gör';
    return `<article class="watch-offer"><div class="watch-offer-top"><span class="watch-offer-logo ${icon?'has-image':''}"><span aria-hidden="true">${escape(initials)}</span>${icon?`<img src="${escape(icon)}" alt="" loading="lazy" width="56" height="56">`:''}</span><span class="watch-offer-kind">${escape(labels[offer.type]||'İzleme seçeneği')}</span></div><h5>${escape(offer.name)}</h5><p class="watch-offer-detail">${escape(detail)}</p><div class="watch-offer-meta">${offer.quality?`<span>${escape(offer.quality)}</span>`:''}${amount?`<strong>${escape(amount)}</strong>`:''}</div>${url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" class="watch-offer-link" aria-label="${escape(offer.name)} üzerinde ${escape(labels[offer.type]||'diziyi aç')}">Platformda aç ${arrow}</a>`:'<span class="watch-offer-unlinked">Platform bağlantısı bulunamadı.</span>'}</article>`;
  }
  function results(show,country,record){
    const warning=record.freshness==='stale'||record.freshness==='archive';
    const notice=warning?'<p class="watch-guide-warning" role="status">Güncel kontrol şu an tamamlanamadı. Aşağıda son kayıt gösteriliyor; kontrol tarihine dikkat et. <button type="button" data-watch-retry>Tekrar dene</button></p>':'';
    if(!record.offers.length)return notice+empty(show,country,record);
    const key=keyFor(show.id,country),savedFilter=filters.get(key)||'all';
    const types=Object.keys(labels).filter(type=>record.offers.some(o=>o.type===type));
    const selected=types.includes(savedFilter)?savedFilter:'all';
    return `${notice}<div class="watch-guide-filters" role="group" aria-label="İzleme türü">${[['all','Tüm seçenekler'],...types.map(type=>[type,labels[type]])].map(([type,label])=>`<button type="button" data-watch-filter="${type}" aria-pressed="${selected===type}">${escape(label)}<span>${type==='all'?record.offers.length:record.offers.filter(o=>o.type===type).length}</span></button>`).join('')}</div>${types.filter(type=>selected==='all'||type===selected).map(type=>`<section class="watch-offer-section"><div class="watch-offer-section-title"><span class="watch-guide-dot ${type}" aria-hidden="true"></span><h4>${escape(labels[type])}</h4></div><div class="watch-offer-grid">${record.offers.filter(o=>o.type===type).map(offer=>offerCard(offer,country)).join('')}</div></section>`).join('')}<p class="watch-guide-note">Seçenekler tüm sezonları veya bölümleri kapsamayabilir. Abonelik paketleri, fiyatlar ve yayın hakları değişebilir; ayrıntıları ilgili platformda kontrol et.</p>${source(record)}`;
  }
  function render(show,country){
    shows.set(Number(show.id),show);const entry=entries.get(keyFor(show.id,country));
    let body,record=entry?.record;
    if(entry?.status==='ready')body=results(show,country,record);
    else if(entry?.status==='error'){
      const archive=context.archive?.(show.id,country);
      if(archive?.state==='verified'&&archive.offers?.length){record={...archive,freshness:'archive'};body=results(show,country,record);}
      else body=`<div class="watch-guide-empty">${screen}<div><h4>İzleme bilgileri şu an yüklenemedi.</h4><p>${escape(entry.error||'Veri servisine geçici olarak ulaşılamıyor.')}</p><button type="button" class="secondary" data-watch-retry>Tekrar dene</button></div></div>`;
    }else body='<div class="watch-guide-loading" role="status" aria-live="polite"><p>Ülkene göre platformlar kontrol ediliyor…</p><div class="watch-guide-skeletons" aria-hidden="true"><span></span><span></span><span></span></div></div>';
    return `<section class="watch-guide" data-watch-show="${Number(show.id)}" data-watch-region="${escape(country)}" aria-label="${escape(show.name)} izleme seçenekleri">${header(show,country,record)}${body}</section>`;
  }
  function repaint(id,country){
    const show=shows.get(Number(id));if(!show)return;
    for(const host of document.querySelectorAll(`[data-watch-show="${Number(id)}"][data-watch-region="${country}"]`)){
      const active=host.contains(document.activeElement)?document.activeElement:null;
      const focusedFilter=active?.dataset.watchFilter,focusedCountry=active?.matches('[data-watch-country]');
      host.outerHTML=render(show,country);
      const next=document.querySelector(`[data-watch-show="${Number(id)}"][data-watch-region="${country}"]`);
      if(focusedFilter)next?.querySelector(`[data-watch-filter="${focusedFilter}"]`)?.focus({preventScroll:true});
      else if(focusedCountry)next?.querySelector('[data-watch-country]')?.focus({preventScroll:true});
    }
  }
  async function lookup(id,country,{retry=false}={}){
    const key=keyFor(id,country);if(!context.countries[country])throw Error('Geçerli bir ülke seç.');
    if(!retry&&current(entries.get(key)))return entries.get(key).record;
    if(pending.has(key))return pending.get(key);
    entries.set(key,{status:'loading'});
    const work=(async()=>{
      try{
        const response=await fetch(`${context.apiBase}/api/watch?id=${Number(id)}&country=${country}`,{credentials:'omit',signal:AbortSignal.timeout(28_000)});
        const record=await response.json();
        if(!response.ok)throw Error(record.error?.message||'İzleme bilgileri şu an yüklenemedi.');
        if(record.show?.id!==Number(id)||record.country!==country||!['verified','unmatched'].includes(record.state)||!Array.isArray(record.offers))throw Error('İzleme bilgisi doğrulanamadı.');
        entries.set(key,{status:'ready',record});context.onLoaded?.(record);return record;
      }catch(error){entries.set(key,{status:'error',error:error.name==='TimeoutError'?'Platform sorgusu beklenenden uzun sürdü. Tekrar deneyebilirsin.':error.message});throw error;}
      finally{pending.delete(key);repaint(id,country);}
    })();pending.set(key,work);return work;
  }
  function load(show,country){shows.set(Number(show.id),show);lookup(Number(show.id),country).catch(()=>{});}
  document.addEventListener('click',event=>{
    const button=event.target.closest('button'),host=button?.closest('[data-watch-show]');if(!host)return;
    const id=Number(host.dataset.watchShow),country=host.dataset.watchRegion,key=keyFor(id,country);
    if(button.dataset.watchFilter){filters.set(key,button.dataset.watchFilter);repaint(id,country);}
    else if(button.dataset.watchRegionChoice)context.onCountryChange?.(button.dataset.watchRegionChoice);
    else if('watchRetry'in button.dataset){lookup(id,country,{retry:true}).catch(()=>{});repaint(id,country);}
  });
  document.addEventListener('error',event=>{if(event.target.matches?.('.watch-offer-logo img'))event.target.parentElement.classList.remove('has-image');},true);
  window.SahneWatch={install:options=>{context={...context,...options,apiBase:options.apiBase==='https://sahne-dizi-kesif.vercel.app'?options.apiBase:''};},render,load,lookup,get:(id,country)=>entries.get(keyFor(id,country))?.record||null};
})();
