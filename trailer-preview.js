'use strict';
(() => {
  const cardSelector='.card,.ranking-card,.recommendation,.platform-card,.character-card,.continue-card,.diary-entry,.taste-feedback-posters>button[data-detail]';
  const hover=matchMedia('(hover: hover) and (pointer: fine)'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>',mute:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zm5 4 5 6m0-6-5 6"/></svg>',sound:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'};
  let context={},active=null,pendingCard=null,startTimer,leaveTimer,sequence=0,youtubePromise;
  function youtube(){
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(youtubePromise)return youtubePromise;
    youtubePromise=new Promise((resolve,reject)=>{
      const previous=window.onYouTubeIframeAPIReady;
      const timeout=setTimeout(()=>{youtubePromise=null;reject(Error('Fragman oynatıcısına ulaşılamadı.'));},12000);
      window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);try{previous?.();}catch{}resolve(window.YT);};
      let script=document.querySelector('script[data-sahne-youtube]');
      if(!script){script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.dataset.sahneYoutube='';script.onerror=()=>{clearTimeout(timeout);script.remove();youtubePromise=null;reject(Error('Fragman oynatıcısı yüklenemedi.'));};document.head.append(script);}
    });return youtubePromise;
  }
  function stop(){
    clearTimeout(startTimer);clearTimeout(leaveTimer);sequence++;pendingCard=null;
    const old=active;active=null;if(!old)return;
    old.card?.classList.remove('sahne-preview-active');
    try{old.player?.destroy();}catch{}
    old.panel?.remove();
  }
  function permitted(){return hover.matches&&!reduced.matches&&innerWidth>=640&&!document.hidden&&!document.querySelector('dialog[open]')&&!navigator.connection?.saveData;}
  function cardFor(node){if(!(node instanceof Element))return null;const card=node.closest(cardSelector);return card&&card.closest('#main')?card:null;}
  function idFor(card){return Number(card?.dataset.detail||card?.querySelector('[data-detail]')?.dataset.detail);}
  function position(panel,card){
    const rect=card.getBoundingClientRect(),width=Math.min(440,innerWidth-32),height=panel.offsetHeight||360;
    panel.style.width=width+'px';panel.style.left=Math.max(16,Math.min(innerWidth-width-16,rect.left+rect.width/2-width/2))+'px';
    panel.style.top=Math.max(16,Math.min(innerHeight-height-16,rect.top+(rect.height-height)/2))+'px';
  }
  function status(current,message){if(active!==current)return;current.panel.querySelector('.trailer-preview-status').textContent=message;}
  function blocked(current,message){
    if(active!==current)return;current.panel.classList.add('preview-blocked');status(current,message);
    current.panel.querySelector('[data-preview-play]').hidden=false;
  }
  async function showPreview(card,token){
    const id=idFor(card),show=context.getShow?.(id);if(!show||token!==sequence||!card.isConnected||!permitted())return;
    const panel=document.createElement('aside');panel.className='trailer-preview preview-loading';panel.setAttribute('aria-label',`${show.name} fragman önizlemesi`);
    const genres=(show.genres||[]).slice(0,2).map(g=>context.genreName?.(g)||g).join(' / ');
    const cover=show.backdrop||show.image?.original||show.image?.medium;
    panel.innerHTML=`<div class="trailer-preview-screen">${cover?`<img class="trailer-preview-cover" src="${escape(cover)}" alt="" width="480" height="270">`:''}<div class="trailer-preview-player"></div><span class="trailer-preview-loading" aria-hidden="true"></span><button type="button" class="trailer-preview-play" data-preview-play hidden aria-label="${escape(show.name)} fragmanını oynat">${icons.play}<span>Önizlemeyi oynat</span></button><button type="button" class="trailer-preview-close" data-preview-close aria-label="Önizlemeyi kapat">×</button></div><div class="trailer-preview-copy"><span class="trailer-preview-eyebrow">SAHNE / FRAGMAN ÖNİZLEMESİ</span><h3>${escape(show.name)}</h3><p>${escape([show.year,genres].filter(Boolean).join(' · '))}</p><div class="trailer-preview-actions"><button type="button" class="trailer-preview-detail" data-preview-detail>${icons.play}<span>Diziyi keşfet</span></button><button type="button" class="trailer-preview-sound" data-preview-sound disabled aria-label="Önizlemenin sesini aç" aria-pressed="false">${icons.mute}</button></div><p class="trailer-preview-status" role="status">Fragman bulunuyor…</p><a class="trailer-preview-source" hidden target="_blank" rel="noopener noreferrer">Fragmanı YouTube’da aç</a></div>`;
    window.SahneGallery?.stop();const current={card,panel,id,player:null,muted:true};active=current;pendingCard=null;document.body.append(panel);card.classList.add('sahne-preview-active');position(panel,card);
    const alive=()=>active===current&&card.isConnected&&permitted();
    panel.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));panel.addEventListener('pointerleave',event=>{if(!card.contains(event.relatedTarget))leaveTimer=setTimeout(stop,180);});
    panel.querySelector('[data-preview-close]').addEventListener('click',stop);
    panel.querySelector('[data-preview-detail]').addEventListener('click',()=>{stop();context.openDetail?.(id);});
    panel.querySelector('[data-preview-sound]').addEventListener('click',()=>{
      if(!current.player)return;current.muted=!current.muted;
      if(current.muted)current.player.mute();else{current.player.unMute();current.player.setVolume(50);current.player.playVideo();}
      const button=panel.querySelector('[data-preview-sound]');button.innerHTML=icons[current.muted?'mute':'sound'];button.setAttribute('aria-pressed',String(!current.muted));button.setAttribute('aria-label',current.muted?'Önizlemenin sesini aç':'Önizlemeyi sessize al');status(current,current.muted?'Sessiz önizleme':'Önizleme · ses açık');
    });
    panel.querySelector('[data-preview-play]').addEventListener('click',()=>{current.player?.mute();current.player?.playVideo();});
    try{
      const media=await window.SahneMedia.lookup(id);
      if(!alive()){if(active===current)stop();return;}
      if(!media.trailer){
        panel.classList.remove('preview-loading');
        status(current,media.trailerStatus==='unavailable'?'Fragman kaynağına şu an ulaşılamıyor.':'Bu dizi için oynatılabilir fragman bulunamadı. Görsellerini ayrıntıda keşfet.');
        return;
      }
      const trailer=media.trailer,source=panel.querySelector('.trailer-preview-source');
      source.href=`https://www.youtube.com/watch?v=${trailer.videoId}`;source.hidden=false;
      if(trailer.thumbnail){const image=panel.querySelector('.trailer-preview-cover');if(image)image.src=trailer.thumbnail;}
      status(current,'Sessiz önizleme yükleniyor…');
      const YT=await youtube();if(!alive()){if(active===current)stop();return;}
      const frame=document.createElement('iframe');frame.title=`${show.name} fragman önizlemesi`;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';frame.tabIndex=-1;
      frame.src=`https://www.youtube-nocookie.com/embed/${trailer.videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}&autoplay=1&mute=1&controls=0&playsinline=1&rel=0`;
      panel.querySelector('.trailer-preview-player').append(frame);
      current.player=new YT.Player(frame,{events:{
        onReady:event=>{if(!alive()){if(active===current)stop();else event.target.destroy();return;}panel.querySelector('[data-preview-sound]').disabled=false;event.target.mute();event.target.playVideo();},
        onStateChange:event=>{
          if(active!==current)return;
          if(event.data===1){panel.classList.remove('preview-loading');panel.classList.add('preview-playing');panel.classList.remove('preview-blocked');panel.querySelector('[data-preview-play]').hidden=true;status(current,current.muted?'Sessiz önizleme':'Önizleme · ses açık');}
          else if(event.data===0){event.target.seekTo(0,true);event.target.playVideo();}
        },
        onAutoplayBlocked:()=>{panel.classList.remove('preview-loading');blocked(current,'Önizlemeyi başlatmak için oynat düğmesine dokun.');},
        onError:()=>{panel.classList.remove('preview-loading');blocked(current,'Bu fragman burada oynatılamıyor; YouTube bağlantısını kullanabilirsin.');panel.querySelector('[data-preview-play]').hidden=true;}
      }});
    }catch{if(active===current){panel.classList.remove('preview-loading');status(current,'Fragman şu an yüklenemedi. Kartın üzerine yeniden gelerek tekrar deneyebilirsin.');}}
  }
  function begin(card){
    clearTimeout(leaveTimer);
    if(!card||!permitted()||active?.card===card)return;
    stop();pendingCard=card;const token=sequence;startTimer=setTimeout(()=>showPreview(card,token),650);
  }
  document.addEventListener('pointerover',event=>{if(event.pointerType&&event.pointerType!=='mouse')return;const card=cardFor(event.target);if(card&&!card.contains(event.relatedTarget))begin(card);});
  document.addEventListener('pointerout',event=>{
    const card=cardFor(event.target);if(!card||card.contains(event.relatedTarget)||active?.panel?.contains(event.relatedTarget))return;
    clearTimeout(startTimer);sequence++;if(pendingCard===card)pendingCard=null;if(active?.card===card)leaveTimer=setTimeout(stop,180);
  });
  document.addEventListener('focusin',event=>{if(event.target.matches?.('.poster-open,.ranking-poster-link,.card-title,.ranking-card-title'))begin(cardFor(event.target));});
  document.addEventListener('focusout',event=>{const card=cardFor(event.target);if(card&&pendingCard===card&&!card.contains(event.relatedTarget)){stop();return;}if(active&&!active.card.contains(event.relatedTarget)&&!active.panel.contains(event.relatedTarget))leaveTimer=setTimeout(stop,180);});
  document.addEventListener('pointerdown',event=>{if(active&&!active.panel.contains(event.target)&&!active.card.contains(event.target))stop();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(active||pendingCard)){stop();event.preventDefault();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('sahne:deliberate-video',stop);
  window.addEventListener('scroll',event=>{if(!active||!active.panel.contains(event.target))stop();},true);
  window.addEventListener('resize',stop);window.addEventListener('popstate',stop);window.addEventListener('pagehide',stop);hover.addEventListener('change',stop);reduced.addEventListener('change',stop);
  new MutationObserver(()=>{const card=active?.card||pendingCard;if(card&&(!card.isConnected||!permitted()))stop();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.SahneMedia.stopPreview=stop;
  window.SahnePreview={install:options=>{context=options;},stop};
})();
