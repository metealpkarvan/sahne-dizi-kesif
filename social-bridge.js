'use strict';
(() => {
  let accountId = null, epoch = 0, ready = false, applying = false, loading = false;
  let syncTimer, syncing = false, dirty = false, version = 0, pendingSave = Promise.resolve();
  const guest = {entries: deepCopy(saved), lists: deepCopy(customLists), ratings: deepCopy(ratings)};
  const user = () => window.SahneCommunity?.currentUser;
  const showImage = value => typeof value==='string' && value.startsWith('assets/') ? '/'+value : (typeof value==='string' && /^(https:\/\/|\/assets\/)/.test(value) ? value : null);
  const snapshotShow = s => s && ({id: s.id, name: s.name, image: showImage(s.image?.original || s.image?.medium), hero: showImage(s.backdrop), genres: s.genres || [], year: s.year || null});
  window.SahneStorageKey = kind => accountId ? `sahne-account-${accountId}-${kind}` : `sahne-guest-${kind==='library'?'library-v1':'taste-v1'}`;
  function getShow(id) {
    id = Number(id);
    if (!byId.has(id)) { const row = catalogById.get(id); if (row) materializeCatalogShow(row); }
    return snapshotShow(byId.get(id));
  }
  async function searchShows(q='') {
    await loadCatalogIndex();
    const term=normal(q.trim());
    return browseRows().filter(s=>['Scripted','Animation'].includes(s.type)&&(!term||normal(s.name).includes(term)))
      .sort((a,b)=>(b.weight||0)-(a.weight||0)).slice(0,24).map(materializeCatalogShow).map(snapshotShow);
  }
  function getLibrary() {
    const entries = Object.fromEntries(Object.entries(saved).map(([id,e]) => {
      const copy=deepCopy(e); delete copy.stars;delete copy.rating;if(e.stars)copy.rating=e.stars*2;
      return [id,copy];
    }));
    const ids = new Set([...Object.keys(saved),...Object.keys(ratings)].map(Number));
    return {entries, lists:deepCopy(customLists), ratings:deepCopy(ratings), shows:[...ids].map(id=>snapshotShow(byId.get(id))).filter(Boolean),version};
  }
  function applyLibrary(data) {
    if (!data || typeof data!=='object') return;
    applying=true;
    for(const s of data.shows||[])if(!byId.has(Number(s.id)))rememberTvmazeShow({...s,image:typeof s.image==='string'?{medium:s.image,original:s.image}:s.image,backdrop:s.hero});
    saved=Object.fromEntries(Object.entries(data.entries||{}).map(([id,e])=>{const copy={...e,stars:e.rating?e.rating/2:(e.stars||0)};delete copy.rating;return[id,copy];}));
    ratings={...(data.ratings||{})};customLists=deepCopy(data.lists||[]);version=Number(data.version)||0;
    persist();saveRatings();renderAll();if($('#detail').open&&state.detailId)detailTab(state.detailTab);applying=false;
  }
  function navigate(view='forum',id=null) {
    if($('#detail').open) { restoringNavigation=true; $('#detail').close(); restoringNavigation=false;state.detailId=null; }
    state.communityView=view;state.communityId=id;
    pushNavigation({view:'community',communityView:view,communityId:id,detailId:null});
    setView('community',false);
  }
  window.SahneOpenCommunity = (view,id) => window.SahneCommunity?.open(view||'forum',id);
  async function reloadLibrary() {
    if(!accountId)return;const captured=epoch;
    try {
      const response=await fetch('/api/community?action=library',{credentials:'same-origin'});
      const body=await response.json();if(!response.ok)throw Error(body.error?.message||body.error||'Arşivin yüklenemedi.');
      if(captured!==epoch)return;
      applyLibrary(body.library||body);ready=true;updateAccount();
    }catch(error){if(captured===epoch){ready=false;toast(error.message);updateAccount();}}
  }
  async function onAuth() {
    const id=user()?.id||null;if(id===accountId&&(ready||loading)){updateAccount();return;}
    epoch++;clearTimeout(syncTimer);ready=false;dirty=false;accountId=id;version=0;
    if(id){loading=true;localStorage.setItem('sahne-last-account',id);applyLibrary({entries:{},lists:[],ratings:{}});await reloadLibrary();loading=false;}
    else{applyLibrary(guest);ready=true;}
    updateAccount();
  }
  async function flush() {
    if(!ready||!accountId)return;
    if(syncing){await pendingSave;if(dirty&&ready)return flush();return;}
    if(!dirty)return;
    syncing=true;dirty=false;const captured=epoch,payload=getLibrary();
    pendingSave=new Promise(resolve=>{flush.finish=resolve;});
    try {
      const response=await fetch('/api/community',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'librarySync',...payload})});
      const body=await response.json();if(!response.ok)throw Error(body.error?.message||body.error||'Arşivin hesaba kaydedilemedi.');
      if(captured===epoch)version=Number(body.version||body.library?.version)||version;
    }catch(error){if(captured===epoch){dirty=false;ready=false;toast(error.message+' Arşiv bölümünden yeniden bağlan.');updateAccount();}}
    finally{syncing=false;flush.finish?.();if(accountId&&ready&&dirty)syncTimer=setTimeout(flush,1200);}
  }
  function changed() {
    if(applying)return;
    if(!accountId){guest.entries=deepCopy(saved);guest.lists=deepCopy(customLists);guest.ratings=deepCopy(ratings);return;}
    if(!ready)return;
    dirty=true;clearTimeout(syncTimer);syncTimer=setTimeout(flush,600);
  }
  function updateAccount() {
    const button=$('#account-button'),u=user();
    if(button){button.textContent=u?(u.name||u.username||'Profilim'):'Giriş yap';button.setAttribute('aria-label',u?'Profilini aç':'Giriş yap veya kayıt ol');}
    const note=$('#archive-storage-note');if(!note)return;
    note.innerHTML=u?(ready?'Arşivin hesabına kaydediliyor. Özel günlük notların yalnızca sana görünür.':'Hesabının arşivi yükleniyor. <button class="text-button" data-account-retry>Yeniden dene</button>'):'Arşivin bu cihazda saklanır. <button class="text-button" data-community-profile>Hesap oluşturarak cihazlar arasında taşı.</button>';
    const hasGuest=Object.keys(guest.entries).length||Object.keys(guest.ratings).length||guest.lists.length;
    if(u&&ready&&hasGuest)note.innerHTML+=' <button class="text-button" data-import-guest>Bu cihazdaki eski arşivi hesabıma aktar</button>';
  }
  document.addEventListener('click',async event=>{
    if(event.target.closest('#account-button,[data-community-profile]')){if(user())navigate('profile',user().username);else window.SahneCommunity.authDialog('signup');}
    if(event.target.closest('[data-account-retry]'))reloadLibrary();
    if(event.target.closest('[data-import-guest]')&&accountId&&ready){
      for(const [id,e]of Object.entries(guest.entries))if(!saved[id])saved[id]=deepCopy(e);
      for(const [id,r]of Object.entries(guest.ratings))if(!ratings[id])ratings[id]=r;
      for(const l of guest.lists)if(!customLists.some(x=>x.id===l.id))customLists.push(deepCopy(l));
      guest.entries={};guest.lists=[];guest.ratings={};localStorage.setItem('sahne-guest-library-v1',JSON.stringify({entries:{},lists:[]}));localStorage.setItem('sahne-guest-taste-v1','{}');
      persist();saveRatings();renderAll();updateAccount();toast('Cihaz arşivin hesabına aktarılıyor.');
    }
  });
  window.addEventListener('sahne:library-change',changed);
  window.addEventListener('sahne:auth',onAuth);
  window.addEventListener('sahne:account-library',()=>reloadLibrary());
  window.SahneCommunity.install({mount:$('#community-root'),getShow,searchShows,openDetail:async(id)=>{if(!getShow(id)){await loadCatalogIndex();getShow(id);}openDetail(Number(id));},toast,getLibrary,applyLibrary,navigate,beforeSignOut:flush,beforeAccountWrite:async()=>{await flush();if(!ready||!accountId)throw Error('Hesap arşivin henüz hazır değil. Arşiv bölümünden yeniden bağlan.');}});
  window.SahneCommunity.init().then(()=>{onAuth();if(state.view==='community')window.SahneOpenCommunity(state.communityView,state.communityId);}).catch(()=>updateAccount());
  updateAccount();
})();
