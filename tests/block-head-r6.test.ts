import test,{after} from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createM54Casting} from '../src/engine-3d-casting';import {CYLINDER_X,assemblyDimensions} from '../src/engine-3d-model';import {copyConfig} from '../src/model';import {disposeSceneResources} from '../src/engine-three-resources';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const mat=()=>new T.MeshStandardMaterial();const materials={cast:mat(),machined:mat(),steel:mat(),black:mat(),rubber:mat(),brass:mat(),cut:mat()};
const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});const dimensions=assemblyDimensions(cfg),portY=226+dimensions.headOffset,camY=279+dimensions.headOffset;
const c=createM54Casting({...dimensions,materials}),root=new T.Group();root.add(c.closed,c.cutHead,c.cutBlock,c.portMounts);root.updateMatrixWorld(true);const head=c.closed.children[1];after(()=>disposeSceneResources(root));

test('R6 retains twelve open head ports and exact machined manifold seating planes',()=>{
  for(const x of CYLINDER_X)for(const side of [-1,1]){
    const axis=new T.Raycaster(new T.Vector3(x,portY,side*130),new T.Vector3(0,0,-side));assert.equal(axis.intersectObject(head,true).length,0,'fixed circular port axis remains drilled through the closed head');
    const land=new T.Raycaster(new T.Vector3(x+25,portY,side*130),new T.Vector3(0,0,-side)).intersectObject(head,true);assert.ok(land.length>0);assert.ok(Math.abs(land[0].point.z-side*78)<.001,'machined port seat meets the existing ±78 interface');
  }
});

test('R6 head and block share an actual section plane with no front deck overhang',()=>{
  assert.equal(c.cutHead.userData.sectionPlaneZ,16);
  for(const part of [c.cutHead,c.cutBlock])part.traverse(o=>{if(!(o instanceof T.Mesh))return;const p=o.geometry.getAttribute('position'),v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);assert.ok(v.z<=16.351,'cut casting cannot retain a near-side wall');}});
  for(const x of CYLINDER_X)for(const y of [dimensions.deck+1.5,portY,245+dimensions.headOffset]){const ray=new T.Raycaster(new T.Vector3(x,y,130),new T.Vector3(0,0,-1),0,113.5);assert.equal(ray.intersectObject(c.cutHead,true).length,0,'observer side is open above the same block section');}
});

test('R6 cam sweep is free and retained bearing-web sections leave the crank axis open',()=>{
  for(const centre of [-23,23])for(let a=0;a<24;a++){
    const angle=a*Math.PI/12,y=camY+22.8*Math.cos(angle),z=centre+22.8*Math.sin(angle);
    assert.equal(new T.Raycaster(new T.Vector3(-305,y,z),new T.Vector3(1,0,0),0,610).intersectObject(head,true).length,0,'carrier feet and gasket rail must clear rotating cam envelope');
  }
  assert.equal(new T.Raycaster(new T.Vector3(360,0,0),new T.Vector3(-1,0,0),0,720).intersectObject(c.cutBlock,true).length,0);
});

test('R6 head batches retain compatible UV and normal attributes without empty mesh leftovers',()=>{
  for(const part of [c.cutHead,head]){
    const batches=new Map<T.Material,T.BufferGeometry[]>();
    for(const o of part.children)if(o instanceof T.Mesh){assert.ok(o.geometry.getAttribute('position').count>0);for(const name of ['normal','uv']){const attribute:T.BufferAttribute|T.InterleavedBufferAttribute=o.geometry.getAttribute(name);assert.ok(attribute,`${o.name}: ${name} missing`);assert.equal(attribute.count,o.geometry.getAttribute('position').count);}const m=o.material as T.Material,list=batches.get(m)??[];list.push(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());batches.set(m,list);}
    assert.ok(batches.size<=3,'head work must keep its original material batch range');
    for(const geometries of batches.values()){const merged=mergeGeometries(geometries);assert.ok(merged,'same-material head surfaces must really merge');merged.dispose();geometries.forEach(g=>g.dispose());}
  }
});
