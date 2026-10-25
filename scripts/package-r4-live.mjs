// Package the reviewed R4 snapshot, never the concurrently edited R5 sources.
import assert from 'node:assert/strict';
import {cp, mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const project=resolve(import.meta.dirname,'..');
const target=resolve(project,'evidence/r4-live-20261025/package');
const preview=resolve(target,'automation-preview');
await mkdir(target,{recursive:true});
await cp(resolve(project,'evidence/detail-r5-integration/before-dist/automation-preview'),preview,{recursive:true});
const html=resolve(preview,'index.html');
await writeFile(html,(await readFile(html,'utf8')).replace('<html lang="de">','<html lang="de" data-hosted-audio="true">'));
const entry=resolve(preview,'assets/index-DXc9f5oQ.js');
const js=await readFile(entry,'utf8');
const incorrect='Audioreserve 180–250 ms';
assert.equal(js.split(incorrect).length,2,'Expected exactly one old audio label');
const footer='Engine Playground · Simulation';
assert.equal(js.split(footer).length,2,'Expected exactly one visible footer label');
await writeFile(entry,js.replace(incorrect,'Ton ca. 1,2 s verzögert').replace(footer,footer+' · Server 4.000 Hz · Ton ca. 1,2 s verzögert'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest={release:'r4-audio03-20261025',visualSnapshot:'detail-r5-integration/before-dist/automation-preview',changes:['Enable hosted audio before first telemetry','Correct audio delay label to 1.2 seconds'],files:[]};
async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,item.name);if(item.isDirectory())await walk(path);else manifest.files.push({path:path.slice(target.length+1).replaceAll('\\','/'),sha256:hash(await readFile(path))});}}
await walk(preview);
await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(resolve(target,'Dockerfile'),'FROM engine-playground:audio03-20261025\nCOPY automation-preview /app/dist/automation-preview\n');
console.log(JSON.stringify({target,files:manifest.files.length,release:manifest.release}));
