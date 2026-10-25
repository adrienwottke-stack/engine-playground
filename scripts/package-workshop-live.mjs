// Called only after owners released R5, the shared checks and preview build pass.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const project=resolve(import.meta.dirname,'..');
const target=resolve(project,'evidence/r5b-live-20261025/package');
const preview=resolve(target,'automation-preview');
await mkdir(target,{recursive:true});
await cp(resolve(project,'dist/automation-preview'),preview,{recursive:true});
const html=(await readFile(resolve(preview,'index.html'),'utf8')).replace('<html lang="de">','<html lang="de" data-hosted-audio="true">');
assert.ok(html.includes('data-hosted-audio="true"')&&html.includes('/automation-preview/assets/'));
await writeFile(resolve(preview,'index.html'),html);
await writeFile(resolve(target,'index.html'),html);
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest={release:'r5b-audio03-20261025',visualBuild:'dist/automation-preview',mainPageUpdated:true,files:[],backendFiles:[]};
async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,item.name);if(item.isDirectory())await walk(path);else manifest.files.push({path:path.slice(target.length+1).replaceAll('\\','/'),sha256:hash(await readFile(path))});}}
await walk(preview);
manifest.files.push({path:'index.html',sha256:hash(html)});
for(const path of ['server.mjs','native/core-runtime.mjs','native/reference-settings.mjs','native/tuning-settings.mjs','native/control-lease.mjs','native/protocol.mjs','native/headless/assets','native/headless/es']){
 await mkdir(resolve(target,path,'..'),{recursive:true});
 await cp(resolve(project,path),resolve(target,path),{recursive:true});
}
async function backendWalk(path){for(const item of await readdir(path,{withFileTypes:true})){const child=resolve(path,item.name);if(item.isDirectory())await backendWalk(child);else manifest.backendFiles.push({path:child.slice(target.length+1).replaceAll('\\','/'),sha256:hash(await readFile(child))});}}
await backendWalk(resolve(target,'native'));
manifest.backendFiles.push({path:'server.mjs',sha256:hash(await readFile(resolve(target,'server.mjs')))});
await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(resolve(target,'Dockerfile'),'FROM engine-playground:audio03-20261025\nCOPY automation-preview /app/dist/automation-preview\nCOPY index.html /app/dist/index.html\nCOPY server.mjs /app/server.mjs\nCOPY native /app/native\n');
console.log(JSON.stringify({target,files:manifest.files.length,release:manifest.release}));
