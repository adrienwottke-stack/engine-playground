import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54ExhaustManifolds} from '../src/engine-3d-exhaust-manifold';
import {CYLINDER_X} from '../src/engine-3d-model';
import {disposeSceneResources} from '../src/engine-three-resources';

test('R3 head mounts keep six clear inlet bores and supported fasteners at both head offsets',()=>{
 for(const ho of [0,18]){
  const a=createM54ExhaustManifolds(ho,color=>new T.MeshStandardMaterial({color}));
  const scene=new T.Scene();scene.add(...a.groups);scene.updateMatrixWorld(true);
  for(const x of CYLINDER_X){
   const collar=a.closed.getObjectByName(`Integrierter Anschlusskragen ${x}`)!;
   assert.ok(collar);
   const centre=new T.Raycaster(new T.Vector3(x,226+ho,88),new T.Vector3(0,0,1),0,16);
   assert.equal(centre.intersectObject(collar).length,0,'entrance remains an actual bore');
   const lip=new T.Raycaster(new T.Vector3(x+18,226+ho,130),new T.Vector3(0,0,-1),0,45);
   assert.ok(lip.intersectObject(collar).length>0,'collar has a real annular shoulder');
  }
  for(const name of ['1–3','4–6']){
   const rail=a.details.getObjectByName(`Dreifachflansch ${name}`)!;
   const nuts=a.details.children.filter(p=>p.name===`Sechskantmutter ${name}`);
   assert.equal(nuts.length,8);
   for(const nut of nuts){
    const ray=new T.Raycaster(new T.Vector3(nut.position.x+6,nut.position.y,103),new T.Vector3(0,0,-1));
    assert.ok(ray.intersectObject(rail).length>0,'every seat has rail metal beneath it');
   }
  }
  disposeSceneResources(scene);
 }
});
