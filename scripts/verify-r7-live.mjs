import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../evidence/r7-live-20261025/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('package/manifest.json',folder),'utf8'));
const origin='https://engine.127.0.0.1.sslip.io';
const files=manifest.files.filter(f=>f.path!=='Dockerfile'),results=[];
for(let i=0;i<files.length;i+=4){
 const batch=await Promise.all(files.slice(i,i+4).map(async item=>{
  const response=await fetch(origin+'/'+item.path+'?release='+manifest.release,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,item.path);
  const sha256=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(sha256,item.sha256,item.path+' bytes differ');return {path:item.path,sha256};
 }));results.push(...batch);
}
for(const [path,expected] of Object.entries(manifest.retainedHashes).filter(([p])=>p.startsWith('/app/dist/'))){
 const response=await fetch(origin+path.slice('/app/dist'.length));assert.equal(response.status,200);
 assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),expected,path+' retained bytes differ');
}
const health=await fetch(origin+'/api/health').then(r=>r.json());
assert.equal(health.release,manifest.release);assert.equal(health.physicalCoreBuilt,true);
await writeFile(new URL('public-bytes.json',folder),JSON.stringify({passed:true,release:manifest.release,checkedAt:new Date().toISOString(),files:results,health,stableAudioAssetsRetained:true},null,2));
console.log(JSON.stringify({passed:true,release:manifest.release,files:results.length,stableAudioAssetsRetained:true}));
