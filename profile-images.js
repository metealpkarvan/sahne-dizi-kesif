/* Prepare a bounded upload from the user's crop, including Safari encoder fallbacks. */
(()=>{'use strict';
async function encode(source,kind='avatar'){
  const maximum=kind==='cover'?480000:230000;
  const longest=kind==='cover'?1440:480;
  let scale=Math.min(1,longest/Math.max(source.width,source.height));
  for(let pass=0;pass<6;pass++,scale*=.78){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(source.width*scale));
    canvas.height=Math.max(1,Math.round(source.height*scale));
    const context=canvas.getContext('2d');
    if(!context)throw Error('Fotoğraf hazırlanamadı. Sayfayı yenileyip yeniden dene.');
    context.drawImage(source,0,0,canvas.width,canvas.height);
    for(const type of ['image/webp','image/jpeg']){
      for(const quality of [.9,.78,.64]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,quality));
        // Safari may silently return PNG when a requested encoder is unsupported.
        if(!blob||blob.type!==type)break;
        if(blob.size<=maximum)return new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(Error('Fotoğraf hazırlanamadı. Yeniden dene.'));
          reader.readAsDataURL(blob);
        });
      }
    }
  }
  throw Error('Bu fotoğraf işlenemedi. JPG, PNG veya WebP olarak yeniden yükle.');
}
window.SahneProfileImages={encode};
})();
