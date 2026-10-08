'use strict';
let catalogIndex=null,catalogIndexRequest=null,catalogBrowseRows=[],catalogById=new Map(),catalogPage=1,catalogPages=1,catalogFilterSignature='',platformPage=1,platformPages=1,platformFilterSignature='',liveShelf='new',releaseFeed=[];
const catalogPageSize=48;
const catalogShelves=[['popular','Popüler'],['personal','Sana göre'],['new','Yeni başlayanlar'],['running','Devam edenler'],['classic','Klasikler'],['rated','Yüksek puanlılar'],['upcoming','Yakında'],['all','Kataloğun tamamı']];
const curatedCollections=[
 {key:'mind',title:'Zihnin sınırları',description:'Gizem, hafıza ve başka gerçeklikler.',genres:['Science-Fiction','Mystery'],image:'assets/severance.jpg'},
 {key:'warm',title:'Biraz iyi gelsin',description:'Komedi ve sıcak insan hikâyeleri.',genres:['Comedy'],exclude:['Horror','Thriller'],image:'assets/bear.jpg'},
 {key:'dark',title:'Karanlık dosyalar',description:'Suç, psikoloji ve zor sorular.',genres:['Crime','Thriller','Horror'],image:'assets/lastofus.jpg'},
 {key:'intense',title:'Bir hamle daha',description:'Güç, tarih ve büyük mücadeleler.',genres:['Action','History','War'],image:'assets/shogun.jpg'},
 {key:'modern-classics',title:'Modern klasikler',description:'2000–2015 arasında başlayan güçlü hikâyeler.',from:2000,to:2015,minRating:7.6},
 {key:'nineties',title:'90’lara dön',description:'Bir dönemin unutulmayan dizileri.',from:1990,to:1999},
 {key:'millennium',title:'2000’lerin sahnesi',description:'2000–2009 arasında açılan dünyalar.',from:2000,to:2009},
 {key:'crime',title:'Bir suçun peşinde',description:'Soruşturmalar, suç örgütleri ve adalet.',genres:['Crime']},
 {key:'future',title:'Gelecek uzak değil',description:'Bilim kurgu dünyalarını keşfet.',genres:['Science-Fiction'],image:'assets/silo.jpg'},
 {key:'fantasy',title:'Gerçekliğin ötesi',description:'Fantastik evrenler ve doğaüstü hikâyeler.',genres:['Fantasy','Supernatural']},
 {key:'history',title:'Tarihin içinden',description:'Dönem hikâyeleri ve tarihsel dramlar.',genres:['History','War'],image:'assets/shogun.jpg'},
 {key:'comedy',title:'Bir kahkaha molası',description:'Kısa ya da uzun, komedinin her hâli.',genres:['Comedy']},
 {key:'animation',title:'Çizginin ötesinde',description:'Animasyon ve anime dünyaları.',type:'Animation'},
 {key:'turkish',title:'Bizim hikâyelerimiz',description:'Türkçe diziler, geçmişten bugüne.',language:'Turkish'},
 {key:'korean',title:'Kore’den hikâyeler',description:'Korece dram, gizem ve romantik diziler.',language:'Korean'},
 {key:'japanese',title:'Japonya’ya bir kapı',description:'Japonca diziler ve animasyonlar.',language:'Japanese'},
 {key:'romance',title:'İlişkilerin içinden',description:'Yakınlık, aşk ve beklenmedik karşılaşmalar.',genres:['Romance']},
 {key:'adventure',title:'Yola çık',description:'Macera ve keşif dolu dünyalar.',genres:['Adventure'],image:'assets/andor.jpg'},
 {key:'medical',title:'Hayatın kıyısında',description:'Hastane, sağlık ve insan hayatı.',genres:['Medical']},
 {key:'short',title:'Kısa bir mola',description:'Bölümleri 30 dakika veya daha kısa.',maxRuntime:30},
 {key:'ongoing',title:'Hikâye devam ediyor',description:'TVmaze’de devam ediyor olarak kayıtlı diziler.',status:'Running'},
 {key:'recent',title:'Yeni bir başlangıç',description:'Son iki yılda başlayan diziler.',recent:true},
 {key:'ended',title:'Finali olan hikâyeler',description:'Tamamlanmış dizilere baştan başla.',status:'Ended'},
 {key:'acclaimed',title:'İzleyicilerin favorileri',description:'TVmaze puanı 8 ve üzeri diziler.',minRating:8}
];
function channelPlatform(name){const n=String(name||'').toLowerCase();if(['apple tv','apple tv+'].includes(n))return 'apple';if(['hbo','hbo max','max','hbo españa','hbo nordic'].includes(n))return 'hbo';if(n==='netflix')return 'netflix';if(['disney+','fx','fxx','hulu','disney channel','disney xd','disney junior'].includes(n))return 'disney';return '';}
function localDate(offset=0){const date=new Date();date.setDate(date.getDate()+offset);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
function catalogPlatformOverrides(){const result=new Map();for(const p of PLATFORM_DATA.platforms)for(const show of p.shows)result.set(Number(show.id),p.key);return result;}
function seedCatalog(){
  for(const raw of CATALOG_BOOTSTRAP.shows){const s=registerHomeShow(raw);if(!s)continue;for(const key of ['premiered','status','type','language','weight','productionPlatforms'])if(raw[key]!==undefined)s[key]=raw[key];s.year=Number(String(raw.premiered||'').slice(0,4))||s.year;s.rating=Number(raw.rating?.average)||0;s.mood=collectionById[s.id]||inferMood(s);if(!s.productionPlatforms?.length){const key=channelPlatform(s.webChannel||s.network);if(key)s.productionPlatforms=[key];}}
}
function browseRows(){return catalogIndex?catalogBrowseRows:tasteCatalog();}
function materializeCatalogShow(row){
  if(byId.has(row.id))return byId.get(row.id);
  const show=rememberTvmazeShow(row);if(!show)return null;
  show.productionPlatforms=row.productionPlatforms||[];show.mood=inferMood(show);
  const platform=PLATFORM_DATA.platforms.find(p=>show.productionPlatforms.includes(p.key));if(platform)show.label=platform.name+' YAPIMLARI';
  return show;
}
function catalogCollection(key){return curatedCollections.find(c=>c.key===key)||null;}
function collectionMatches(show,c){
  if(!c)return true;const g=show.genres||[];
  return (!c.genres||c.genres.some(genre=>g.includes(genre)))&&(!c.exclude||!c.exclude.some(genre=>g.includes(genre)))&&(!c.from||show.year>=c.from)&&(!c.to||show.year<=c.to)&&(!c.minRating||show.rating>=c.minRating)&&(!c.language||show.language===c.language)&&(!c.type||show.type===c.type)&&(!c.status||show.status===c.status)&&(!c.maxRuntime||show.runtime>0&&show.runtime<=c.maxRuntime)&&(!c.recent||(show.premiered&&show.premiered>=localDate(-730)&&show.premiered<=localDate()));
}
function browseMatch(s,{platform=state.catalogPlatform,genre=state.genre,language=state.catalogLanguage,type=state.catalogType,status=state.catalogStatus,query=state.query,collection=state.collection,mood=state.mood,available=$('#available-only')?.checked}={}){
  const q=normal(query||'');
  return (!platform||platform==='all'||s.productionPlatforms?.includes(platform))&&(!genre||genre==='all'||s.genres?.includes(genre))&&(!language||language==='all'||s.language===language)&&(!status||status==='all'||s.status===status)&&(!type||type==='all'||(type==='series'?['Scripted','Animation'].includes(s.type)||!s.type:s.type===type))&&(!mood||mood==='all'||(s.mood||inferMood(s))===mood)&&(!q||(s.searchName||normal(s.name)).includes(q))&&(!available||!!showForCountry(s)?.offers?.length)&&collectionMatches(s,catalogCollection(collection));
}
function shelfMatches(s,key){const today=localDate();if(key==='new')return s.premiered&&s.premiered>=localDate(-730)&&s.premiered<=today;if(key==='running')return s.status==='Running'&&(!s.premiered||s.premiered<=today);if(key==='classic')return s.year&&s.year<=2015;if(key==='rated')return s.rating>=7.5;if(key==='upcoming')return s.premiered&&s.premiered>today;return true;}
function sortBrowse(list,sort){
  if(sort==='name')return list.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  if(sort==='new')return list.sort((a,b)=>String(b.premiered||'').localeCompare(String(a.premiered||''))||(b.weight||0)-(a.weight||0));
  if(sort==='short')return list.sort((a,b)=>(a.runtime||9999)-(b.runtime||9999)||(b.weight||0)-(a.weight||0));
  if(sort==='rated')return list.sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.weight||0)-(a.weight||0));
  return list.sort((a,b)=>(b.weight||0)-(a.weight||0)||(b.rating||0)-(a.rating||0)||String(b.premiered||'').localeCompare(String(a.premiered||'')));
}
function openCatalogShelf(key){
  if(!catalogShelves.some(x=>x[0]===key))return;
  state.catalogShelf=key;state.collection=null;state.query='';state.genre='all';state.mood='all';state.catalogStatus='all';state.catalogType=key==='all'?'all':'series';state.catalogPlatform='all';state.catalogLanguage='all';state.sort=key==='personal'?'personal':key==='new'||key==='upcoming'?'new':key==='rated'?'rated':'popular';$('#search').value='';$('#sort').value=state.sort;searchMatches=[];searchStatus('');catalogPage=1;syncBrowseControls();setView('catalog');renderBrowseCatalog();loadCatalogIndex();
}
function openCatalogCollection(key){const c=catalogCollection(key);if(!c)return;state.collection=key;state.catalogShelf='popular';state.catalogType='series';state.catalogPlatform='all';state.catalogLanguage='all';state.catalogStatus='all';state.query='';state.genre='all';state.mood='all';state.sort='popular';$('#sort').value='popular';$('#search').value='';searchMatches=[];searchStatus('');catalogPage=1;syncBrowseControls();setView('catalog');renderBrowseCatalog();loadCatalogIndex();}
function resetBrowseFilters(){state.genre='all';state.mood='all';state.query='';state.collection=null;state.catalogPlatform='all';state.catalogLanguage='all';state.catalogStatus='all';state.catalogType='series';state.catalogShelf='popular';state.sort='popular';$('#search').value='';$('#sort').value='popular';$('#available-only').checked=false;searchMatches=[];catalogPage=1;syncBrowseControls();searchStatus('');renderBrowseCatalog();}
function syncBrowseControls(){for(const [id,key] of [['catalog-platform','catalogPlatform'],['catalog-language','catalogLanguage'],['catalog-type','catalogType'],['catalog-status','catalogStatus'],['catalog-genre','genre']]){const el=$('#'+id);if(el)el.value=state[key]||'all';}}
function browsePager(root,page,pages,total,kind='catalog'){
  if(!root)return;root.hidden=!total;root.innerHTML='<button data-'+kind+'-page="'+Math.max(1,page-1)+'" '+(page===1?'disabled':'')+'>Önceki sayfa</button><p>'+page.toLocaleString('tr-TR')+' / '+pages.toLocaleString('tr-TR')+' sayfa · '+total.toLocaleString('tr-TR')+' başlık</p><button data-'+kind+'-page="'+Math.min(pages,page+1)+'" '+(page===pages?'disabled':'')+'>Sonraki sayfa</button>'+(pages>5?'<label class="sr-only" for="'+kind+'-page-jump">Sayfa numarası</label><input id="'+kind+'-page-jump" type="number" min="1" max="'+pages+'" value="'+page+'" aria-label="'+(kind==='catalog'?'Katalog':'Platform')+' sayfa numarası"><button data-'+kind+'-jump>Sayfaya git</button>':'');
}
function renderBrowseCatalog(){
  if(!$('#catalog-shelves'))return;
  const key=state.catalogShelf||'popular',signature=[key,state.sort,state.genre,state.catalogPlatform,state.catalogLanguage,state.catalogType,state.catalogStatus,state.query,state.collection,state.mood,$('#available-only')?.checked].join('|');
  if(signature!==catalogFilterSignature){catalogFilterSignature=signature;catalogPage=1;}
  const personal=key==='personal'||state.sort==='personal';let list;
  if(personal){list=TasteEngine.recommend(recommendationCandidates().filter(s=>browseMatch(s)),tasteCatalog(),ratings,saved,240);}
  else {list=browseRows().filter(s=>browseMatch(s)&&shelfMatches(s,key));if(state.query.trim().length>=2){const extras=searchMatches.filter(s=>browseMatch(s));list=[...new Map([...extras,...list].map(s=>[s.id,s])).values()];}sortBrowse(list,key==='new'||key==='upcoming'?'new':key==='rated'?'rated':state.sort);}
  const total=list.length;catalogPages=Math.max(1,Math.ceil(total/catalogPageSize));catalogPage=Math.min(catalogPage,catalogPages);
  const slice=list.slice((catalogPage-1)*catalogPageSize,catalogPage*catalogPageSize).map(materializeCatalogShow).filter(Boolean);
  $('#grid').innerHTML=slice.map(s=>card(s)+ '').join('');
  if(personal)$$('#grid .card').forEach((node,i)=>{const reason=document.createElement('p');reason.className='catalog-card-reason';reason.textContent=recommendationReason(slice[i]);node.append(reason);});
  $('#result-count').textContent=total.toLocaleString('tr-TR')+' başlık';$('#catalog-result-total').textContent=total.toLocaleString('tr-TR')+' başlık'+(personal?' · kişisel öneriler':'');
  $('#catalog-visible-range').textContent=total?((catalogPage-1)*catalogPageSize+1).toLocaleString('tr-TR')+'–'+Math.min(catalogPage*catalogPageSize,total).toLocaleString('tr-TR')+' gösteriliyor':'Sonuç yok';
  $('#empty').hidden=!!total;$('#catalog-shelves').innerHTML=catalogShelves.map(([k,name])=>'<button data-catalog-shelf="'+k+'" class="'+(key===k?'active':'')+'" aria-pressed="'+(key===k)+'">'+name+'</button>').join('');
  $$('[data-genre]').forEach(b=>{b.classList.toggle('active',b.dataset.genre===state.genre);b.setAttribute('aria-pressed',String(b.dataset.genre===state.genre));});
  const collection=catalogCollection(state.collection),title=collection?collection.title:personal?'Senin hikâyelerin.':key==='new'?'Yeni başlayanlar.':key==='running'?'Hikâye devam ediyor.':key==='classic'?'Klasiklere dön.':key==='upcoming'?'Sıradaki sahne.':'Binlerce hikâye. Bir sonraki favorin.';
  $('#catalog-view .page-heading h1').textContent=title;$('#catalog-view .page-heading p').textContent=collection?collection.description:personal?'Tercihlerine göre sıralandı. Arşivindeki ve değerlendirdiğin diziler bu listede yer almaz.':'Arama yapmadan gez. Popüler dizilerden başla, türünü ve platformunu seç.';
  browsePager($('#catalog-pagination'),catalogPage,catalogPages,total);
  syncBrowseControls();renderCatalogLoadState();refreshHomeArchiveButtons();
}
function renderCatalogLoadState(error=false){
  const root=$('#catalog-load');if(!root)return;
  if(catalogIndex){root.hidden=true;$('#catalog-source-note').textContent='TVmaze indeksi · '+fmtDate(catalogIndex.checkedAt.slice(0,10))+' · '+catalogIndex.total.toLocaleString('tr-TR')+' kayıt. Platformlar yapım/yayıncı bağlantısını gösterir; ülke erişimi dizi ayrıntısında doğrulanır.';return;}
  root.hidden=false;root.innerHTML=error?'<span>Geniş katalog yüklenemedi. Popüler seçkiyi gezmeye devam edebilirsin.</span><button id="catalog-retry">Yeniden dene</button>':'<span>'+CATALOG_BOOTSTRAP.shows.length.toLocaleString('tr-TR')+' dizilik başlangıç seçkisi hazır. Tam katalog yükleniyor…</span>';
}
async function loadCatalogIndex(){
  if(catalogIndex)return catalogIndex;if(catalogIndexRequest)return catalogIndexRequest;
  renderCatalogLoadState();
  catalogIndexRequest=fetch('catalog/index.json?v='+CATALOG_BOOTSTRAP.checkedAt.slice(0,10)).then(r=>{if(!r.ok)throw Error('Catalog '+r.status);return r.json();}).then(data=>{
    if(!Array.isArray(data.rows)||data.rows.length!==data.total)throw Error('Invalid catalog index');catalogIndex=data;const overrides=catalogPlatformOverrides();
    catalogBrowseRows=data.rows.map(r=>{const platform=overrides.get(r[0])||data.platforms[r[13]],poster=r[12]?r[12].startsWith('@')?'https://static.tvmaze.com/uploads/images/medium_portrait/'+r[12].slice(1):r[12]:noPoster;return {id:r[0],name:r[1],searchName:normal(r[1]),premiered:r[2]||null,year:Number(r[2].slice(0,4))||null,status:data.statuses[r[3]]||'',type:data.types[r[4]],genres:r[5].map(g=>data.genres[g]),runtime:r[6],rating:r[7],weight:r[8],network:data.channels[r[9]]||null,webChannel:null,language:data.languages[r[10]],country:data.countries[r[11]],image:{medium:poster,original:poster},productionPlatforms:platform?[platform]:[],label:platform?(PLATFORM_DATA.platforms.find(p=>p.key===platform)?.name||'')+' YAPIMLARI':'TVMAZE KATALOĞU'};});
    catalogById=new Map(catalogBrowseRows.map(s=>[s.id,s]));for(const id of new Set([...Object.keys(saved),...Object.keys(ratings)])){const row=catalogById.get(Number(id));if(row)materializeCatalogShow(row);}
    populateCatalogFilters();renderBrowseCatalog();renderPlatformPage();renderCuratedCollections();renderGenreAtlas();renderPlatformWorlds();renderRecommendations();if(state.view==='list')renderLibrary();renderContinue();refreshHomeArchiveButtons();if($('#detail').open)renderSimilarSeries(byId.get(state.detailId));return data;
  }).catch(()=>{renderCatalogLoadState(true);return null;}).finally(()=>catalogIndexRequest=null);
  return catalogIndexRequest;
}
function populateCatalogFilters(){
  const rows=browseRows(),genres=[...new Set(rows.flatMap(s=>s.genres))].sort((a,b)=>(names[a]||a).localeCompare(names[b]||b,'tr')),languages=[...new Set(rows.map(s=>s.language).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
  $('#catalog-genre').innerHTML='<option value="all">Tüm türler</option>'+genres.map(g=>'<option value="'+esc(g)+'">'+esc(names[g]||g)+'</option>').join('');
  const languageNames={Turkish:'Türkçe',English:'İngilizce',Korean:'Korece',Japanese:'Japonca',Spanish:'İspanyolca',French:'Fransızca',German:'Almanca',Italian:'İtalyanca',Chinese:'Çince',Russian:'Rusça',Portuguese:'Portekizce',Arabic:'Arapça'};
  const priority=['Turkish','English','Korean','Japanese','Spanish','French','German'];languages.sort((a,b)=>(priority.includes(a)?priority.indexOf(a):99)-(priority.includes(b)?priority.indexOf(b):99)||a.localeCompare(b));
  $('#catalog-language').innerHTML='<option value="all">Tüm diller</option>'+languages.map(l=>'<option value="'+esc(l)+'">'+esc(languageNames[l]||l)+'</option>').join('');syncBrowseControls();
}
function platformBrowseShows(key='all'){
  const overrides=catalogPlatformOverrides();return browseRows().filter(s=>(s.productionPlatforms?.length||overrides.has(s.id))&&(key==='all'||s.productionPlatforms?.includes(key)||overrides.get(s.id)===key)&&(!s.type||['Scripted','Animation'].includes(s.type)));
}
function renderPlatformBrowse(){
  const key=state.platform||'all',q=normal(state.platformQuery||''),status=state.platformStatus||'all',signature=[key,q,state.platformGenre,status,$('#platform-sort').value].join('|');if(signature!==platformFilterSignature){platformFilterSignature=signature;platformPage=1;}
  let shows=platformBrowseShows(key).filter(s=>(!q||(s.searchName||normal(s.name)).includes(q))&&(!state.platformGenre||state.platformGenre==='all'||s.genres.includes(state.platformGenre))&&shelfMatches(s,status));
  const sort=$('#platform-sort').value;if(sort==='personal')shows=TasteEngine.recommend(shows.filter(s=>s.premiered&&s.premiered<=localDate()&&s.status!=='In Development').map(materializeCatalogShow).filter(Boolean),tasteCatalog(),ratings,saved,240);else sortBrowse(shows,sort==='editor'?'popular':sort);
  platformPages=Math.max(1,Math.ceil(shows.length/catalogPageSize));platformPage=Math.min(platformPage,platformPages);
  $('#platform-grid').innerHTML=shows.slice((platformPage-1)*catalogPageSize,platformPage*catalogPageSize).map(materializeCatalogShow).filter(Boolean).map(s=>card(s)).join('');$('#platform-result-count').textContent=shows.length.toLocaleString('tr-TR')+' dizi';$('#platform-empty').hidden=!!shows.length;
  $('#platform-status-tabs').innerHTML=[['all','Tüm diziler'],['new','Yeni başlayanlar'],['running','Devam edenler'],['upcoming','Yakında']].map(([k,n])=>'<button data-platform-status="'+k+'" class="'+(status===k?'active':'')+'" aria-pressed="'+(status===k)+'">'+n+'</button>').join('');
  browsePager($('#platform-pagination'),platformPage,platformPages,shows.length,'platform');
}
function renderCuratedCollections(){
  const pool=browseRows().filter(s=>(!s.type||['Scripted','Animation'].includes(s.type))),html=curatedCollections.map((c,i)=>{const list=sortBrowse(pool.filter(s=>collectionMatches(s,c)),'popular');if(!list.length)return '';const lead=materializeCatalogShow(list.find(s=>s.image?.medium&&s.image.medium!==noPoster)||list[0]),image=c.image||lead.image.original||lead.image.medium;return '<button class="curated-card" data-curated="'+c.key+'" aria-label="'+esc(c.title)+' seçkisini aç"><img src="'+esc(image)+'" alt="" loading="lazy"><span class="curated-card-copy"><small>SEÇKİ '+String(i+1).padStart(2,'0')+'</small><strong>'+esc(c.title)+'</strong><span>'+esc(c.description)+'</span><small>'+list.length.toLocaleString('tr-TR')+' dizi</small></span></button>';}).join('');
  if($('#curated-collections'))$('#curated-collections').innerHTML=html;$('#all-collections').innerHTML=html;
}
function refreshCatalogHomeShelves(){
  const rows=recommendationCandidates();homeRankings.popular=sortBrowse([...rows],'popular').slice(0,18);homeRankings.rated=sortBrowse(rows.filter(s=>s.rating>=7.5&&(s.weight||0)>=85),'rated').slice(0,18);homeRankings.newest=sortBrowse(rows.filter(s=>s.productionPlatforms?.length&&s.premiered&&s.premiered<=localDate()&&s.premiered>=localDate(-730)),'new').slice(0,18);renderHomeRankings();$('#ranking-updated').textContent='Katalog verisi · '+fmtDate(CATALOG_BOOTSTRAP.checkedAt.slice(0,10));$('#newest-status').textContent='Platform yapımları · ilk yayın tarihine göre · '+fmtDate(CATALOG_BOOTSTRAP.checkedAt.slice(0,10));renderLiveShelf();
}
function renderLiveShelf(){
  const base=recommendationCandidates().filter(s=>s.productionPlatforms?.length);let shows;
  if(liveShelf==='episodes')shows=releaseFeed.map(x=>({s:byId.get(x.id),date:x.date,episode:x.episode})).filter(x=>x.s).sort((a,b)=>b.date.localeCompare(a.date)).map(x=>x.s);
  else shows=sortBrowse(base.filter(s=>shelfMatches(s,liveShelf)),liveShelf==='new'?'new':'popular');
  $('#live-series-rail').innerHTML=shows.slice(0,18).map((s,i)=>{const html=rankingCard(s,i,liveShelf==='new'?'newest':'popular'),ep=liveShelf==='episodes'?releaseFeed.find(x=>x.id===s.id):null;return ep?html.replace('<div class="ranking-card-tools">','<p class="release-episode">'+esc(fmtDate(ep.date))+' · '+esc(ep.episode||'Yeni bölüm')+'</p><div class="ranking-card-tools">'):html;}).join('')||'<p class="catalog-scope-note">Bu aralıkta platformlara ait bir bölüm kaydı henüz bulunamadı. Devam eden dizileri keşfedebilirsin.</p>';
  $$('[data-live-shelf]').forEach(b=>{b.classList.toggle('active',b.dataset.liveShelf===liveShelf);b.setAttribute('aria-pressed',String(b.dataset.liveShelf===liveShelf));});
}
async function refreshReleaseFeed(){
  const cacheKey='sahne-release-feed-v2';
  function apply(rows,checked){releaseFeed=rows.map(x=>{const s=rememberTvmazeShow(x.show);if(s){const key=channelPlatform(s.webChannel||s.network);if(key)s.productionPlatforms=[key];}return {id:s?.id,date:x.date,episode:x.episode};}).filter(x=>x.id);$('#live-feed-status').textContent='Bölüm takvimi kontrolü · '+new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(checked))+'. Devam ediyor durumu yeni bölümün bugün yayımlandığı anlamına gelmez.';renderLiveShelf();}
  try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached?.rows&&Date.now()-cached.checkedAt<6*3600e3){apply(cached.rows,cached.checkedAt);return;}
    const collected=[];for(const offset of [-6,-5,-4,-3,-2,-1,0]){const r=await fetch('https://api.tvmaze.com/schedule/web?date='+localDate(offset));if(!r.ok)throw Error('Schedule');const episodes=await r.json();for(const ep of episodes){const show=ep._embedded?.show||ep.show,key=channelPlatform((show?.webChannel||show?.network)?.name);if(show&&key&&['Scripted','Animation'].includes(show.type))collected.push({show,date:ep.airdate||localDate(offset),episode:ep.name||''});}}
    const rows=[...new Map(collected.sort((a,b)=>a.date.localeCompare(b.date)).map(x=>[x.show.id,x])).values()],checkedAt=Date.now();try{localStorage.setItem(cacheKey,JSON.stringify({rows,checkedAt}));}catch{}apply(rows,checkedAt);
  }catch{$('#live-feed-status').textContent='Bölüm takvimi şu an güncellenemedi. Yeni ve devam eden diziler katalog kaydından gösteriliyor.';}
}
function initializeCatalogExperience(){
  Object.assign(state,{catalogShelf:'popular',catalogPlatform:'all',catalogLanguage:'all',catalogType:'series',catalogStatus:'all',platformStatus:'all',sort:'popular'});$('#sort').value='popular';populateCatalogFilters();renderCuratedCollections();refreshCatalogHomeShelves();
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
    if(button.dataset.catalogShelf){openCatalogShelf(button.dataset.catalogShelf);return;}
    if(button.dataset.curated){openCatalogCollection(button.dataset.curated);return;}
    if(button.dataset.catalogPage){catalogPage=Number(button.dataset.catalogPage);renderBrowseCatalog();$('#catalog-shelves').scrollIntoView({block:'start',behavior:motionPreference.matches?'auto':'smooth'});return;}
    if(button.dataset.catalogJump!==undefined){catalogPage=Math.max(1,Math.min(catalogPages,Number($('#catalog-page-jump').value)||1));renderBrowseCatalog();$('#catalog-shelves').scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(button.dataset.platformPage){platformPage=Number(button.dataset.platformPage);renderPlatformBrowse();$('#platform-tabs').scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(button.dataset.platformJump!==undefined){platformPage=Math.max(1,Math.min(platformPages,Number($('#platform-page-jump').value)||1));renderPlatformBrowse();$('#platform-tabs').scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(button.dataset.platformStatus){state.platformStatus=button.dataset.platformStatus;renderPlatformBrowse();return;}
    if(button.dataset.liveShelf){liveShelf=button.dataset.liveShelf;renderLiveShelf();return;}
    if(button.id==='catalog-clear'){resetBrowseFilters();return;}
    if(button.id==='catalog-retry'){loadCatalogIndex();return;}
  });
  document.addEventListener('change',event=>{const fields={'catalog-platform':'catalogPlatform','catalog-language':'catalogLanguage','catalog-type':'catalogType','catalog-status':'catalogStatus','catalog-genre':'genre'};if(fields[event.target.id]){state[fields[event.target.id]]=event.target.value;renderBrowseCatalog();}});
  loadCatalogIndex();refreshReleaseFeed();
}
