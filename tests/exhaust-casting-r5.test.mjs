import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import * as T from 'three';
const root=process.cwd(),out='evidence/exhaust-casting-r5';
const compiled=await build({stdin:{resolveDir:root,loader:'ts',contents:`export {createM54ExhaustManifolds as before} from './${out}/before-manifold.ts';export {createM54ExhaustManifolds as after} from './src/engine-3d-exhaust-manifold.ts';`},bundle:true,write:false,platform:'node',format:'esm',external:['three','three/*'],plugins:[{name:'frozen-reference',setup(b){b.onResolve({filter:/^\.\/(engine-3d-layout|engine-3d-model)$/},args=>({path:path.join(root,out,args.path.includes('layout')?'frozen-layout.ts':'frozen-model.ts')}));b.onLoad({filter:/(before-manifold|frozen-layout|frozen-model)\.ts$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.join(root,'src')}));}}]});
await writeFile(`${out}/geometry-pair.mjs`,compiled.outputFiles[0].text);
const {before,after}=await import(pathToFileURL(path.join(root,out,'geometry-pair.mjs')).href);
const mat=c=>new T.MeshStandardMaterial({color:c});
const dispose=a=>{const gs=new Set(),ms=new Set();for(const g of a.groups)g.traverse(p=>{if(p.isMesh){gs.add(p.geometry);ms.add(p.material)}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose())};
test('R5 preserves precision collars, fasteners, flanges and catalysts exactly',()=>{
 const a=before(0,mat),b=after(0,mat);
 for(const group of ['closed','details','cut'])for(const old of a[group].children){
  if(old.name.startsWith('Zusammenhängender'))continue;
  const current=b[group].children.find(p=>p.name===old.name&&p.position.equals(old.position));assert.ok(current,old.name);
  assert.deepEqual(current.geometry.getAttribute('position').array,old.geometry.getAttribute('position').array,old.name);
  assert.deepEqual(current.position.toArray(),old.position.toArray());assert.deepEqual(current.quaternion.toArray(),old.quaternion.toArray());
 }
 dispose(a);dispose(b);
});
test('R5 keeps the fan silhouette bounded, finite unit normals and a small triangle budget',async()=>{
 const a=before(0,mat),b=after(0,mat),counts=[];
 for(const label of ['1–3','4–6']){
  const old=a.closed.getObjectByName(`Zusammenhängender Dreierkrümmer ${label}`),current=b.closed.getObjectByName(old.name);
  const og=old.geometry,g=current.geometry;og.computeBoundingBox();g.computeBoundingBox();
  for(const key of ['min','max'])for(const axis of ['x','y','z'])assert.ok(Math.abs(og.boundingBox[key][axis]-g.boundingBox[key][axis])<1.5,'accepted overall silhouette stays within 1.5 display units');
  const p=g.getAttribute('position'),n=g.getAttribute('normal');assert.ok(p.count/og.getAttribute('position').count<1.06,'no global tessellation increase');
  for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.01);}
  counts.push({bank:label,beforeTriangles:og.getAttribute('position').count/3,afterTriangles:p.count/3});
 }
 await writeFile(`${out}/geometry-audit.json`,JSON.stringify({counts},null,2));dispose(a);dispose(b);
});
test('R5 reports paired construction cost after warmup',async()=>{
 for(const create of [before,after])dispose(create(0,mat));
 const times={before:[],after:[]};
 for(let i=0;i<5;i++)for(const [name,create] of i%2?[['after',after],['before',before]]:[['before',before],['after',after]]){const t=performance.now(),a=create(0,mat);times[name].push(performance.now()-t);dispose(a);}
 const median=a=>[...a].sort((x,y)=>x-y)[2],report={milliseconds:times,medianBefore:median(times.before),medianAfter:median(times.after)};
 await writeFile(`${out}/construction-cost.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
