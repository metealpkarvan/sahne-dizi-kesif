/* Older Sahne links open the single account-enabled publication. */
(()=>{'use strict';
  const oldOrigin='https://sahne-dizi-kesif.metealp.chatgpt.site';
  const currentOrigin='https://sahne-dizi-kesif.vercel.app';
  if(location.origin!==oldOrigin)return;
  const legacy=new URLSearchParams(location.search).get('legacy')==='1';
  if(legacy)return; // Keeps device-local archives accessible without clearing or transmitting them.
  const route=/^#(?:main|kesfet|dizi\/[1-9]\d*|platform\/(?:apple|hbo|netflix|disney)|sahne\/(?:katalog|koleksiyonlar|arsiv|platformlar|kayit|giris|forum|profile|activity|topic)(?:\/[^?#\s]*)?)$/.test(location.hash)?location.hash:'';
  location.replace(currentOrigin+'/'+route);
})();
