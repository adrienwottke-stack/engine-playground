import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../evidence/r5b-live-20261025/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('package/manifest.json',folder),'utf8'));
const origin='https://engine.127.0.0.1.sslip.io';
const results=[];
for(let i=0;i<manifest.files.length;i+=5){
 const batch=await Promise.all(manifest.files.slice(i,i+5).map(async item=>{
  const response=await fetch(origin+'/'+item.path+'?release='+manifest.release);
  assert.equal(response.status,200,item.path);
  const sha256=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(sha256,item.sha256,item.path+' bytes differ');
  return {path:item.path,sha256};
 }));results.push(...batch);
}
const health=await fetch(origin+'/api/health').then(r=>r.json());
assert.equal(health.release,manifest.release);assert.equal(health.physicalCoreBuilt,true);
await writeFile(new URL('public-bytes.json',folder),JSON.stringify({passed:true,release:manifest.release,checkedAt:new Date().toISOString(),files:results,health},null,2));
console.log(JSON.stringify({passed:true,release:manifest.release,files:results.length}));
