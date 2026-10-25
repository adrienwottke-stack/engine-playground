import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepare} from '../public/native-render-prewarm.js';

function setup(fail=false){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial();
 const mesh=new T.InstancedMesh(geometry,material,2);mesh.visible=false;scene.add(mesh,new T.DirectionalLight());
 const host={dataset:{}},canvas={style:{visibility:'visible'},closest:()=>host};
 let width=390,height=844,ratio=1.5,geometryDisposed=0,materialDisposed=0,originalDisposed=0,draws=[];
 geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);mesh.addEventListener('dispose',()=>originalDisposed++);
 const renderer={domElement:canvas,getSize:v=>v.set(width,height),getPixelRatio:()=>ratio,setPixelRatio:v=>ratio=v,setSize:(w,h)=>{width=w;height=h;},
  async compileAsync(warm){assert.equal(warm.children.filter(c=>c.isLight).length,1);},
  render(warm){assert.equal(width,8);assert.equal(height,8);assert.equal(canvas.style.visibility,'hidden');for(const object of warm.children.filter(c=>c.isMesh)){assert.notEqual(object,mesh);assert.equal(object.material,material);assert.equal(object.geometry,geometry);assert.equal(object.visible,true);draws.push(object);}if(fail)throw Error('GPU unavailable');}
 };
 return {engine:{scene,camera,renderer},host,mesh,inspect:()=>({width,height,ratio,visibility:canvas.style.visibility,geometryDisposed,materialDisposed,originalDisposed,draws})};
}

test('first-use graphics warming includes hidden instances and preserves the real scene and its shared resources',async()=>{
 const x=setup();await prepare(x.engine);const r=x.inspect();
 assert.equal(x.host.dataset.audioWarm,'ready');assert.equal(r.draws.length,1);assert.equal(x.mesh.visible,false);
 assert.equal(r.width,390);assert.equal(r.height,844);assert.equal(r.ratio,1.5);assert.equal(r.visibility,'visible');
 assert.equal(r.geometryDisposed,0);assert.equal(r.materialDisposed,0);assert.equal(r.originalDisposed,0);
 assert.equal(x.engine.scene.children.length,2);
});

test('a failed warm draw restores the real canvas and never disposes its original geometry or material',async()=>{
 const x=setup(true);await assert.rejects(prepare(x.engine),/GPU unavailable/);const r=x.inspect();
 assert.equal(r.width,390);assert.equal(r.height,844);assert.equal(r.ratio,1.5);assert.equal(r.visibility,'visible');
 assert.equal(r.geometryDisposed,0);assert.equal(r.materialDisposed,0);assert.equal(r.originalDisposed,0);assert.equal(x.mesh.visible,false);
});
