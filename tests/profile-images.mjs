import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const code=await readFile(new URL('../profile-images.js',import.meta.url),'utf8');
function encoder(makeBlob){
  const calls=[],window={};
  const document={createElement(){const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(done,type,quality){calls.push({width:canvas.width,height:canvas.height,type,quality});done(makeBlob(canvas,type,quality));}};return canvas;}};
  class FileReader{readAsDataURL(blob){this.result=`data:${blob.type};base64,${Buffer.alloc(blob.size).toString('base64')}`;this.onload();}}
  vm.runInNewContext(code,{window,document,FileReader,Error,Promise});
  return {encode:window.SahneProfileImages.encode,calls};
}
test('Detailed avatars reduce encoder quality to fit the validated upload budget',async()=>{
  const {encode,calls}=encoder((canvas,type,quality)=>({type,size:quality>.8?300000:210000}));
  const result=await encode({width:2400,height:2400});
  assert.equal(Buffer.from(result.split(',')[1],'base64').length,210000);
  assert.equal(calls[0].width,480);assert.equal(calls.length,2);
});
test('Unsupported WebP encoders fall back to JPEG instead of oversized PNG',async()=>{
  const {encode,calls}=encoder((canvas,type)=>({type:type==='image/webp'?'image/png':type,size:type==='image/webp'?900000:220000}));
  assert.match(await encode({width:480,height:480}),/^data:image\/jpeg;/);
  assert.deepEqual(calls.map(c=>c.type),['image/webp','image/jpeg']);
});
test('Covers preserve their landscape crop and resize automatically under the server budget',async()=>{
  const {encode,calls}=encoder((canvas,type)=>({type,size:canvas.width>1100?700000:400000}));
  const result=await encode({width:2880,height:960},'cover');
  assert.equal(Buffer.from(result.split(',')[1],'base64').length,400000);
  assert.equal(calls[0].width,1440);assert.equal(calls[0].height,480);
  assert.ok(calls.at(-1).width<1100);assert.ok(Math.abs(calls.at(-1).width/calls.at(-1).height-3)<.02);
});
test('Failed image encoders stop with a recoverable error',async()=>{
  const {encode,calls}=encoder(()=>null);
  await assert.rejects(encode({width:480,height:480}),/işlenemedi/);
  assert.equal(calls.length,12);
});
