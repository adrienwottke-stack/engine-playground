import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Block} from '../src/engine-3d-block';
import {assemblyDimensions,CYLINDER_X} from '../src/engine-3d-model';
import {copyConfig} from '../src/model';
import {disposeSceneResources} from '../src/engine-three-resources';

function sample(){
  const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});const dimensions=assemblyDimensions(cfg);
  const root=createM54Block({...dimensions,materials:{machined:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),black:new T.MeshStandardMaterial()}});root.updateMatrixWorld(true);return {root,...dimensions};
}

test('bare M54 block has six real open bores and an open crankshaft axis',()=>{
  const {root,deck}=sample();
  for(const x of CYLINDER_X){
    const bore=new T.Raycaster(new T.Vector3(x,deck+30,0),new T.Vector3(0,-1,0),0,deck-70);
    assert.equal(bore.intersectObject(root,true).length,0,'each cylinder remains open to its lower barrel');
    const deckRay=new T.Raycaster(new T.Vector3(x,deck+30,48),new T.Vector3(0,-1,0),0,40);
    assert.ok(deckRay.intersectObject(root,true).length>0,'machined material surrounds each liner');
  }
  const crank=new T.Raycaster(new T.Vector3(360,0,0),new T.Vector3(-1,0,0),0,720);
  assert.equal(crank.intersectObject(root,true).length,0,'end faces and all main webs clear the crank datum');disposeSceneResources(root);
});

test('sensor mounting holes are recessed behind the real raised cast annuli',()=>{
  const {root,deck}=sample();
  for(const x of [-155,154]){
    const centre=new T.Raycaster(new T.Vector3(x,deck-62,-145),new T.Vector3(0,0,1)).intersectObject(root,true);
    const rim=new T.Raycaster(new T.Vector3(x+10,deck-62,-145),new T.Vector3(0,0,1)).intersectObject(root,true);
    assert.ok(centre.length>0&&rim.length>0);assert.ok(centre[0].point.z-rim[0].point.z>6,'the bore is a real recess, not a dark disc pasted over a cylinder');
  }
  disposeSceneResources(root);
});

test('casting detail remains finite, depth-tested and material-batched',()=>{
  const {root}=sample();let meshes=0,vertices=0;
  root.traverse(object=>{
    if(!(object instanceof T.Mesh))return;meshes++;const p=object.geometry.getAttribute('position');vertices+=p.count;
    for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
    assert.equal((object.material as T.Material).depthTest,true);
  });
  assert.ok(meshes<=6,'static foundry detail must not create hundreds of draw calls');assert.ok(vertices>10000);const bounds=new T.Box3().setFromObject(root);assert.ok(bounds.min.x<-300&&bounds.max.x>300&&bounds.min.y<-45);disposeSceneResources(root);
});
