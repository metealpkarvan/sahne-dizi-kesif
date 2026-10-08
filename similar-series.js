'use strict';
const similarMetadata=new WeakMap();
function similarSeriesCandidates(source){
  const pool=new Map(tasteCatalog().map(show=>[show.id,show]));
  // Scan compact metadata first; only displayed matches are materialized.
  const candidates=browseRows().filter(show=>show.id!==source.id&&show.image?.medium&&show.image.medium!==noPoster&&
    (!show.type||['Scripted','Animation','Documentary'].includes(show.type))&&
    (!show.premiered||show.premiered<=localDate())&&show.status!=='In Development'&&
    show.genres?.some(genre=>source.genres.includes(genre)));
  const overlap=show=>(show.genres||[]).filter(genre=>source.genres.includes(genre)).length/
    Math.sqrt(Math.max(1,show.genres.length*source.genres.length));
  const prelim=show=>overlap(show)+(source.language&&source.language===show.language ? 0.15 : 0)+
    (source.type&&source.type===show.type ? 0.1 : 0)+(Number(show.weight)||0)/1000+(Number(show.rating)||0)/100;
  const shortlisted=candidates.map(show=>({show,score:prelim(show)})).sort((a,b)=>b.score-a.score).slice(0,600);
  for(const {show} of shortlisted)if(!pool.has(show.id))pool.set(show.id,show);
  return [...pool.values()].map(show=>{if(byId.has(show.id))return byId.get(show.id);if(!similarMetadata.has(show))similarMetadata.set(show,{...show,mood:inferMood(show)});return similarMetadata.get(show)}).filter(show=>show.image?.medium&&show.image.medium!==noPoster&&
    (!show.type||['Scripted','Animation','Documentary'].includes(show.type))&&
    (!show.premiered||show.premiered<=localDate())&&show.status!=='In Development');
}
function renderSimilarSeries(source){
  const root=document.getElementById('similar-series');if(!root||!source)return;
  const previous=root.dataset.showId===String(source.id)?root.querySelector('.similar-track')?.scrollLeft||0:0;
  const rows=TasteEngine.related(source,similarSeriesCandidates(source),tasteCatalog(),8);
  root.dataset.showId=String(source.id);
  root.innerHTML=`<div class="similar-heading"><div><h3 id="similar-series-title">Benzer diziler</h3><p>Ortak türler ve temalardan yeni hikâyelere.</p></div>${rows.length?`<div class="similar-arrows"><button data-scroll-track="similar-track" data-dir="-1" aria-label="Benzer dizilerde geri kaydır">${iconSvg.right}</button><button data-scroll-track="similar-track" data-dir="1" aria-label="Benzer dizilerde ileri kaydır">${iconSvg.right}</button></div>`:''}</div>${rows.length?`<div id="similar-track" class="similar-track" aria-label="${esc(source.name)} ile benzer diziler">${rows.map(row=>{
    const show=materializeCatalogShow(row.show)||row.show;
    const reason=row.themes.length?'Ortak tema: '+row.themes[0]:'Ortak tür: '+(names[row.genres[0]]||row.genres[0]);
    const status=({done:'İzlendi',planned:'Listende',watching:'İzliyorsun',paused:'Ara verdin',dropped:'Bıraktın'})[saved[show.id]?.status];
    return `<button class="similar-card" data-detail="${show.id}" aria-label="${esc(show.name)} ayrıntılarını aç"><span class="similar-poster"><img src="${esc(show.image.medium||show.image.original)}" alt="${esc(show.name)} afişi" loading="lazy" width="210" height="295">${status?`<span class="similar-state">${status}</span>`:''}</span><strong class="similar-title">${esc(show.name)}</strong><span class="similar-meta">${show.year||'—'}${show.rating?' · TVmaze '+Number(show.rating).toFixed(1):''}</span><span class="similar-reason" title="${esc(reason)}">${esc(reason)}</span></button>`;
  }).join('')}</div>`:`<p class="similar-empty">Bu başlık için yeterli benzerlik bilgisi henüz yok. <a class="text-button" href="#sahne/katalog">Kataloğu keşfet</a></p>`}`;
  const track=root.querySelector('.similar-track');if(!track)return;
  track.scrollLeft=previous;
  const update=()=>{const buttons=root.querySelectorAll('.similar-arrows button');buttons[0].disabled=track.scrollLeft<=1;buttons[1].disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-1;};
  track.addEventListener('scroll',update,{passive:true});update();
}
