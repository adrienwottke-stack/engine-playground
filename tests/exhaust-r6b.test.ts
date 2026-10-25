import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54ExhaustManifolds as after} from '../src/engine-3d-exhaust-manifold';
import {createM54ExhaustManifolds as before} from '../evidence/exhaust-r6b/frozen-src/engine-3d-exhaust-manifold';
import {disposeSceneResources} from '../src/engine-three-resources';
import {writeFile} from 'node:fs/promises';
const mat=(c:number)=>new T.MeshStandardMaterial({color:c});

test('R6b fan has a measurably flatter cast section while seats and catalysts stay unchanged',async()=>{
 const a=before(0,mat),b=after(0,mat),result:any={sections:[],neckLengths:[]};
 for(const assembly of [a,b]){const scene=new T.Scene();scene.add(...assembly.groups);scene.updateMatrixWorld(true);}
 for(const [label,x] of [['1–3',-80],['4–6',220]] as const){
  const thickness=(assembly:ReturnType<typeof after>)=>{
   const body=assembly.closed.getObjectByName(`Zusammenhängender Dreierkrümmer ${label}`)!;
   const upper=new T.Raycaster(new T.Vector3(x,300,185),new T.Vector3(0,-1,0)).intersectObject(body)[0];
   const lower=new T.Raycaster(new T.Vector3(x,100,185),new T.Vector3(0,1,0)).intersectObject(body)[0];
   assert.ok(upper&&lower);return upper.point.y-lower.point.y;
  };
  const old=thickness(a),current=thickness(b);assert.ok(current<old*.8,'the selected broad face loses at least one fifth of its padded depth');assert.ok(current>23&&current<27,'a real 25-unit cast section remains');result.sections.push({bank:label,before:old,after:current});
 }
 for(const x of [-250,-150,-50,50,150,250]){
  const old=new T.Box3().setFromObject(a.closed.getObjectByName(`Integrierter Anschlusskragen ${x}`)!);
  const current=new T.Box3().setFromObject(b.closed.getObjectByName(`Integrierter Anschlusskragen ${x}`)!);
  assert.ok(current.max.z-current.min.z<=4.01);assert.ok(old.max.z-old.min.z>36);result.neckLengths.push({x,before:old.max.z-old.min.z,after:current.max.z-current.min.z});
  const body=b.closed.getObjectByName(`Zusammenhängender Dreierkrümmer ${x<0?'1–3':'4–6'}`)!;
  for(const z of [94,100,108,115])assert.ok(new T.Raycaster(new T.Vector3(x,300,z),new T.Vector3(0,-1,0)).intersectObject(body).length,'one continuous casting now contains the formerly separate long neck');
 }
 for(const p of a.details.children){const q=b.details.children.find(q=>q.name===p.name&&q.position.equals(p.position)) as T.Mesh;assert.ok(q);assert.deepEqual(q.geometry.getAttribute('position').array,(p as T.Mesh).geometry.getAttribute('position').array,'flanges, supported fasteners and downpipes do not move');}
 for(const p of a.closed.children.filter(p=>!p.name.startsWith('Zusammenhängender')&&!p.name.startsWith('Integrierter'))){const q=b.closed.children.find(q=>q.name===p.name&&q.position.equals(p.position)) as T.Mesh;assert.ok(q);assert.deepEqual(q.geometry.getAttribute('position').array,(p as T.Mesh).geometry.getAttribute('position').array);assert.deepEqual(q.quaternion.toArray(),p.quaternion.toArray());}
 await writeFile('evidence/exhaust-r6b/form-audit.json',JSON.stringify(result,null,2));for(const g of [...a.groups,...b.groups])disposeSceneResources(g);
});
