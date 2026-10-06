'use strict';
const cinemaStories = [
  {id:38052,name:'Silo',platform:'Apple TV+',image:'assets/silo.jpg',position:'68% 40%',headline:'Dışarıda<br><em>ne var?</em>',text:'Yeraltında bir hayat. Dışarıya dair tek bir soru. Juliette’in dünyasına gir.',character:'Juliette Nichols'},
  {id:44933,name:'Severance',platform:'Apple TV+',image:'assets/severance.jpg',position:'45% 40%',right:true,headline:'İki hayat.<br><em>Bir sır.</em>',text:'İş ve özel hayatın arasındaki çizgi silinirken, Lumon’un kusursuz düzeni çatırdıyor.',character:'Mark Scout'},
  {id:46562,name:'The Last of Us',platform:'HBO Max',image:'assets/lastofus.jpg',position:'64% 50%',headline:'Dünya değişir.<br><em>Bağlar kalır.</em>',text:'Yıkılmış bir dünyada, iki insanın birbirine tutunduğu bir yolculuk.',character:'Ellie Williams'},
  {id:37336,name:'Shōgun',platform:'Disney+',image:'assets/shogun.jpg',position:'67% 42%',headline:'Bir hamle.<br><em>Bir imparatorluk.</em>',text:'1600 yılının Japonya’sında her ittifak, tarihin yönünü değiştirebilir.',character:'Yoshii Toranaga'}
];
const cinemaMediaByTitle = {'Silo':'silo','Severance':'severance','The Last of Us':'lastofus','Shōgun':'shogun','The Bear':'bear','House of the Dragon':'dragon','Andor':'andor','Stranger Things':'stranger','Wednesday':'wednesday'};
let currentHeroIndex=0,cinemaInitialized=false,cinemaFrame=0,platformGenreKey='';
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');

function platformShows(key='all'){return platformBrowseShows(key);}
function platformBrand(key,name) {return '<span class="platform-wordmark wordmark-'+esc(key)+'">'+esc(name)+'</span>';}
function renderPlatformWorlds() {
  const root=$('#platform-worlds');if(!root)return;
  root.innerHTML=PLATFORM_DATA.platforms.map((p,i)=>'<button class="platform-world platform-world-'+esc(p.key)+'" data-platform="'+esc(p.key)+'" aria-label="'+esc(p.name)+' dizi seçkisini aç"><img src="'+esc(p.scene)+'" alt="" loading="lazy" width="700" height="900"><span class="world-index">0'+(i+1)+'</span><span class="world-copy">'+platformBrand(p.key,p.name)+'<span>'+esc(p.tagline)+'</span><small>'+platformShows(p.key).length.toLocaleString('tr-TR')+' dizi</small><span class="world-enter">Seçkiyi aç</span></span></button>').join('');
}
function renderCinemaHero() {
  $('#hero-media').innerHTML=cinemaStories.map((story,i)=>'<img class="hero-image '+(!i?'active':'')+'" src="'+story.image+'" alt="'+esc(story.name+' — '+story.character)+'" '+(!i?'fetchpriority="high"':'loading="lazy"')+' width="2200" height="1468" style="object-position:'+story.position+'">').join('');
  $('#hero-story-switch').innerHTML=cinemaStories.map((s,i)=>'<button data-hero-story="'+i+'" class="'+(!i?'active':'')+'" aria-label="'+esc(s.name)+' sahnesine geç" aria-pressed="'+(!i)+'"><img src="'+s.image+'" alt="" width="72" height="48"><span><small>0'+(i+1)+'</small>'+esc(s.name)+'</span></button>').join('');
  setHeroStory(0);
}
function setHeroStory(index) {
  if(index<0||index>=cinemaStories.length)return;
  currentHeroIndex=index;const story=cinemaStories[index],show=byId.get(story.id);
  $('#cinema-hero').classList.toggle('copy-right',!!story.right);
  $$('#hero-media .hero-image').forEach((image,i)=>{image.classList.toggle('active',i===index);image.setAttribute('aria-hidden',String(i!==index));});
  $$('#hero-story-switch button').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));});
  $('#hero-eyebrow').textContent=story.name.toLocaleUpperCase('tr')+' / '+story.platform.toLocaleUpperCase('tr');
  $('#cinema-title').innerHTML=story.headline;$('#hero-description').textContent=story.text;
  $('#hero-series-name').textContent=story.name;
  $('#hero-meta').textContent=[show?.year,show?.genres?.slice(0,2).map(g=>names[g]||g).join(' / '),show?.rating?show.rating.toFixed(1)+' TVmaze':''].filter(Boolean).join(' · ');
  $('#hero-detail').dataset.detail=String(story.id);$('#hero-save').dataset.homeSave=String(story.id);
  refreshHomeArchiveButtons();
}
function refreshHomeArchiveButtons() {
  $$('[data-home-save]').forEach(button=>{const savedNow=getStatus(Number(button.dataset.homeSave))==='planned';button.innerHTML='<span aria-hidden="true">'+(savedNow?'✓':'＋')+'</span> '+(savedNow?'Listemde':'Sonra izle');button.setAttribute('aria-pressed',String(savedNow));});
  const total=$('#catalog-total');if(total)total.textContent=CATALOG_BOOTSTRAP.seriesTotal.toLocaleString('tr-TR');
}
function renderStoryScroll() {
  const stories=cinemaStories.slice(1);
  $('#story-chapter-controls').innerHTML=stories.map((s,i)=>'<button data-story-chapter="'+i+'" aria-label="'+esc(s.name)+' kaydırma bölümüne git" class="'+(!i?'active':'')+'">0'+(i+1)+' <span>'+esc(s.name)+'</span></button>').join('');
  $('#story-scenes').innerHTML=stories.map((s,i)=>'<article class="story-scene '+(!i?'active':'')+(s.right?' story-copy-right':'')+'" aria-hidden="'+(motionPreference.matches?'false':String(!!i))+'" '+(!motionPreference.matches&&i?'inert':'')+'><img class="story-scene-image" src="'+s.image+'" alt="'+esc(s.name+' — '+s.character)+'" loading="lazy" width="2200" height="1468" style="object-position:'+s.position+'"><div class="story-scene-shade"></div><div class="story-scene-copy"><span class="eyebrow">'+esc(s.platform.toLocaleUpperCase('tr'))+' / '+esc(s.name.toLocaleUpperCase('tr'))+'</span><h2>'+s.headline+'</h2><p>'+esc(s.text)+'</p><div class="story-scene-actions"><button class="cinema-button light" data-detail="'+s.id+'">Hikâyeyi keşfet</button><button class="cinema-button glass" data-home-save="'+s.id+'">＋ Sonra izle</button></div></div><span class="story-character">'+esc(s.character)+'<small>'+esc(s.name)+'</small></span></article>').join('');
}
function renderCharacterCards() {
  const definitions=[['Silo','Juliette Nichols','silo','68% 40%'],['The Bear','Carmy Berzatto','bear','55% 35%'],['Wednesday','Wednesday Addams','wednesday','50% 40%'],['Andor','Cassian Andor','andor','50% 40%']];
  $('#character-cards').innerHTML=definitions.map(([title,character,image,position])=>{const s=tasteCatalog().find(show=>show.name===title);return s?'<button class="character-card" data-detail="'+s.id+'" aria-label="'+esc(character+' — '+title)+' ayrıntıları"><img src="assets/'+image+'.jpg" alt="'+esc(character)+'" loading="lazy" width="700" height="1000" style="object-position:'+position+'"><span class="character-copy"><small>'+esc(title)+'</small><strong>'+esc(character)+'</strong><span>Hikâyesini keşfet</span></span></button>':'';}).join('');
}
function openPlatform(key) {
  if(key!=='all'&&!PLATFORM_DATA.platforms.some(p=>p.key===key))return;
  if(state.view!=='platforms'||state.platform!==key)pushNavigation({view:'platforms',platform:key});
  state.platform=key;state.platformQuery='';state.platformGenre='all';state.platformStatus='all';platformPage=1;
  $('#platform-search').value='';setView('platforms',false);renderPlatformPage();
}
function renderPlatformPage() {
  const key=state.platform||'all',selected=PLATFORM_DATA.platforms.find(p=>p.key===key),hero=$('#platform-page-hero');if(!hero)return;
  if(hero.dataset.platform!==key+(catalogIndex?'full':'seed')){
    hero.dataset.platform=key+(catalogIndex?'full':'seed');hero.innerHTML='<img src="'+(selected?.scene||'assets/silo.jpg')+'" alt="" width="2200" height="1468"><div class="platform-page-shade"></div><div class="platform-page-copy"><span class="eyebrow">ÖZGÜN YAPIMLAR VE STÜDYO SEÇKİSİ</span><h1>'+(selected?platformBrand(selected.key,selected.name):'Her platform.<br><em>Başka bir dünya.</em>')+'</h1><p>'+esc(selected?.tagline||'Apple TV+, HBO Max, Netflix ve Disney+ dünyalarını keşfet.')+'</p><span class="platform-hero-count">'+platformShows(key).length+' dizi seçkide</span></div>';
  }
  $('#platform-tabs').innerHTML=[{key:'all',name:'Tüm platformlar'},...PLATFORM_DATA.platforms].map(p=>'<button data-platform="'+esc(p.key)+'" class="'+(key===p.key?'active':'')+'" aria-pressed="'+(key===p.key)+'">'+esc(p.name)+'</button>').join('');
  if(platformGenreKey!==key+(catalogIndex?'full':'seed')){
    platformGenreKey=key+(catalogIndex?'full':'seed');const genres=[...new Set(platformShows(key).flatMap(s=>s.genres))].sort((a,b)=>(names[a]||a).localeCompare(names[b]||b,'tr'));
    $('#platform-genre').innerHTML='<option value="all">Tüm türler</option>'+genres.map(g=>'<option value="'+esc(g)+'">'+esc(names[g]||g)+'</option>').join('');
  }
  const tabs=$('#platform-tabs'),active=tabs.querySelector('.active');if(active)tabs.scrollLeft=Math.max(0,active.offsetLeft-tabs.offsetLeft-tabs.clientWidth/2+active.offsetWidth/2);
  $('#platform-genre').value=state.platformGenre||'all';renderPlatformCatalog();
}
function renderPlatformCatalog(){renderPlatformBrowse();}
function scheduleCinemaFrame() {if(!cinemaFrame)cinemaFrame=requestAnimationFrame(updateCinemaScroll);}
function updateCinemaScroll() {
  cinemaFrame=0;const reduced=motionPreference.matches;
  document.body.classList.toggle('motion-reduced',reduced);$('.header').classList.toggle('header-scrolled',window.scrollY>30||state.view!=='discover');
  if(state.view!=='discover')return;
  const hero=$('#cinema-hero'),heroRect=hero.getBoundingClientRect(),heroTravel=Math.max(0,-heroRect.top);
  if(heroRect.bottom>0&&!reduced){
    $('#hero-media').style.transform='translate3d(0,'+(heroTravel*.26)+'px,0)';
    $('.cinema-hero-copy').style.transform='translate3d(0,'+(-heroTravel*.11)+'px,0)';
    $('.cinema-hero-copy').style.opacity=String(Math.max(0,1-heroTravel/heroRect.height*1.1));
    $('.hero-bottom-line').style.transform='scaleX('+Math.min(1,heroTravel/heroRect.height)+')';
  }else if(reduced){$('#hero-media').style.transform='';$('.cinema-hero-copy').style.transform='';$('.cinema-hero-copy').style.opacity='';}
  const root=$('#story-scroll'),rect=root.getBoundingClientRect(),viewport=window.innerHeight;
  if(reduced){$$('.story-scene').forEach(p=>{p.setAttribute('aria-hidden','false');p.inert=false;});return;}
  if(rect.top<viewport&&rect.bottom>0){
    const progress=Math.min(1,Math.max(0,-rect.top/Math.max(1,root.offsetHeight-viewport))),chapter=Math.min(2,Math.floor(progress*3));
    $$('.story-scene').forEach((panel,i)=>{panel.classList.toggle('active',i===chapter);panel.setAttribute('aria-hidden',String(i!==chapter));panel.inert=i!==chapter;panel.querySelector('img').style.transform='translate3d(0,'+((progress*3-i-.5)*-45)+'px,0) scale(1.075)';});
    $$('#story-chapter-controls button').forEach((b,i)=>{b.classList.toggle('active',i===chapter);b.setAttribute('aria-pressed',String(i===chapter));});
    $('#chapter-progress').style.transform='scaleX('+progress+')';
  }
}
function goToStoryChapter(index) {
  if(motionPreference.matches){$$('.story-scene')[index]?.scrollIntoView({behavior:'auto',block:'start'});return;}
  const root=$('#story-scroll'),distance=Math.max(0,root.offsetHeight-window.innerHeight);
  window.scrollTo({top:root.getBoundingClientRect().top+window.scrollY+distance*(index+.12)/3,behavior:motionPreference.matches?'auto':'smooth'});
}
function renderHomeExperience() {
  if(cinemaInitialized)return;cinemaInitialized=true;
  renderCinemaHero();renderStoryScroll();renderPlatformWorlds();renderCharacterCards();renderPlatformPage();refreshHomeArchiveButtons();
  document.addEventListener('input',event=>{if(event.target.id==='platform-search'){state.platformQuery=event.target.value;renderPlatformCatalog();}});
  document.addEventListener('change',event=>{if(event.target.id==='platform-genre'){state.platformGenre=event.target.value;renderPlatformCatalog();}if(event.target.id==='platform-sort')renderPlatformCatalog();});
  window.addEventListener('scroll',scheduleCinemaFrame,{passive:true});window.addEventListener('resize',scheduleCinemaFrame,{passive:true});motionPreference.addEventListener('change',scheduleCinemaFrame);
  if('IntersectionObserver' in window&&!motionPreference.matches){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.06});document.documentElement.classList.add('cinema-motion');$$('.reveal').forEach(node=>observer.observe(node));}
  scheduleCinemaFrame();
}
