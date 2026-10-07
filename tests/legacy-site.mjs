import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../legacy-site.js',import.meta.url),'utf8');
function redirected({origin='https://sahne-dizi-kesif.metealp.chatgpt.site',search='',hash=''}={}){
  let target=null;vm.runInNewContext(source,{URLSearchParams,location:{origin,search,hash,replace:url=>{target=url;}}});return target;
}
test('old public links open the real account-enabled publication and preserve series/forum routes',()=>{
  for(const hash of ['','#dizi/38052','#sahne/forum','#sahne/profile/sahne_test','#sahne/topic/abc-123','#sahne/kayit','#sahne/giris','#kesfet'])
    assert.equal(redirected({hash}),'https://sahne-dizi-kesif.vercel.app/'+hash);
});
test('old device archives remain accessible without a redirect',()=>assert.equal(redirected({search:'?legacy=1',hash:'#sahne/arsiv'}),null));
test('development and canonical publication cannot enter a redirect loop',()=>{
  for(const origin of ['http://localhost:4182','http://localhost:4183','https://sahne-dizi-kesif.vercel.app'])assert.equal(redirected({origin}),null);
});
test('arbitrary query strings and malformed routes are not passed to the new destination',()=>{
  assert.equal(redirected({search:'?token=private',hash:'#https://unrelated.example'}),'https://sahne-dizi-kesif.vercel.app/');
});
