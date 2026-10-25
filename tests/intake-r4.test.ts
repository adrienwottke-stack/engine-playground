import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createM54Intake} from '../src/engine-3d-intake';
import {createM54Intake as before} from './intake-r4-before';
const mat=(color:number,metalness?:number,roughness?:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
test('R4 collector and existing primitive details retain compatible attributes for central material batching',()=>{
 const m=createM54Intake(0,mat);for(const group of [m.closed,m.cut,m.details]){
  const batches=new Map<T.Material,T.BufferGeometry[]>();group.traverse(p=>{if(p instanceof T.Mesh){const material=p.material as T.Material,list=batches.get(material)??[];list.push(p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone());batches.set(material,list);}});
  for(const geometries of batches.values()){const combined=mergeGeometries(geometries);assert.ok(combined,'all intake meshes can be batched without missing UV/normal attributes');assert.ok(Array.from(combined.getAttribute('position').array).every(Number.isFinite));combined.dispose();geometries.forEach(g=>g.dispose());}
 }
});
test('R4 collector has a hollow varying shell with narrower ends and outward exterior normals',()=>{
 const m=createM54Intake(0,mat),s=m.closed.getObjectByName('Breiter Kunststoffsammler') as T.Mesh;
 const a=s.geometry.getAttribute('position'),normals=s.geometry.getAttribute('normal'),stride=49,layer=97*stride;
 assert.ok(a.count>=layer*2+4,'R6 adds real connection rims without removing the varying wall layers');assert.equal(s.userData.wallThickness,3);
 const width=(i:number)=>Math.max(...Array.from({length:49},(_,j)=>a.getZ(i*stride+j)))-Math.min(...Array.from({length:49},(_,j)=>a.getZ(i*stride+j)));
 assert.ok(width(0)<width(48)*.4);assert.ok(width(96)<width(48)*.4);
 const bottom=(i:number)=>Math.min(...Array.from({length:49},(_,j)=>a.getY(i*stride+j)));
 assert.ok(Math.abs(bottom(17)-bottom(32))>10,'lower contour varies between chambers and bridges');
 for(let i=8;i<89;i+=5){assert.ok(normals.getY(i*stride)>.5,'upper exterior normals point out');for(const j of [0,12,24,36]){const p=new T.Vector3().fromBufferAttribute(a,i*stride+j),q=new T.Vector3().fromBufferAttribute(a,layer+i*stride+j);assert.ok(p.distanceTo(q)>=2.99);}}
 m.closed.updateMatrixWorld(true);const capProbe=new T.Raycaster(new T.Vector3(330,178,-202),new T.Vector3(-1,0,0));assert.ok(capProbe.intersectObject(s).some(hit=>hit.point.x>292),'end wall closes its centre');
 const cut=m.cut.getObjectByName('Sammlerboden im Schnitt') as T.Mesh;assert.ok(cut.geometry.getAttribute('position').count>=layer*2+4,'cut wall keeps both layers; its trimmed port rims may differ from the closed shell');
 assert.ok(cut.geometry.getAttribute('position').getY(0)<a.getY(0),'cut shell opens the upper half');
});
test('intake preserves fixed R3 interfaces and visible MAF/boot for every variant',()=>{
 for(const intake of ['standard','sport','race'] as const){const old=before(11,mat,{intake}),m=createM54Intake(11,mat,{intake});
  assert.deepEqual(m.variant,old.variant);assert.deepEqual(m.throttle.position.toArray(),old.throttle.position.toArray());
  for(const name of ['Offener Saugrohrflansch','Ovaler Kopfanschlusskragen','Elektronisches Drosselgehäuse','Heißfilm-Luftmassenmesser','Gebogener Ansaugfaltenbalg','Offener Drossel-Montageflansch']){
   const oldMeshes=old.details.children.filter(p=>p.name===name) as T.Mesh[],meshes=m.details.children.filter(p=>p.name===name) as T.Mesh[];assert.equal(meshes.length,oldMeshes.length);
   meshes.forEach((p,i)=>{assert.deepEqual(p.position.toArray(),oldMeshes[i].position.toArray());assert.deepEqual(Array.from(p.geometry.getAttribute('position').array),Array.from(oldMeshes[i].geometry.getAttribute('position').array));});
  }
  // R6 intentionally reshapes this loft. Its axial mouth and all six open
  // downstream routes are independently checked by intake-r6.test.ts.
  assert.deepEqual(m.disa.position.toArray(),old.disa.position.toArray());
 }
});
