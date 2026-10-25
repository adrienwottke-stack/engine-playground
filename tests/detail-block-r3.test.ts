import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Block} from '../src/engine-3d-block';
import {assemblyDimensions,CYLINDER_X} from '../src/engine-3d-model';
import {copyConfig} from '../src/model';
import {disposeSceneResources} from '../src/engine-three-resources';

test('shared cut casting opens all six piston sightlines and the entire crank axis',()=>{
  const dimensions=assemblyDimensions(copyConfig());
  const materials={machined:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),black:new T.MeshStandardMaterial()};
  const cut=createM54Block({...dimensions,cutaway:true,materials});cut.updateMatrixWorld(true);
  for(const x of CYLINDER_X){
    const hits=new T.Raycaster(new T.Vector3(x,145,220),new T.Vector3(0,0,-1)).intersectObject(cut,true);
    assert.ok(hits.length>0);assert.ok(hits[0].point.z<0,'near jacket and liner must both be removed');
  }
  assert.equal(new T.Raycaster(new T.Vector3(360,0,0),new T.Vector3(-1,0,0),0,720).intersectObject(cut,true).length,0);
  let meshes=0;cut.traverse(o=>{if(o instanceof T.Mesh){meshes++;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));}});
  assert.ok(meshes<=5,'section lips must be batched');disposeSceneResources(cut);
});

test('cut retains the same photographed far-side casting surface as closed',()=>{
  const d=assemblyDimensions(copyConfig()),materials={machined:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),black:new T.MeshStandardMaterial()};
  const closed=createM54Block({...d,materials}),cut=createM54Block({...d,materials,cutaway:true});
  closed.updateMatrixWorld(true);cut.updateMatrixWorld(true);
  for(const [x,y] of [[-207,-31],[-155,d.deck-62],[154,d.deck-62],[113,-34],[-270,121]]){
    const ray=new T.Raycaster(new T.Vector3(x,y,-200),new T.Vector3(0,0,1));
    const a=ray.intersectObject(closed,true),b=ray.intersectObject(cut,true);assert.ok(a.length&&b.length);assert.ok(a[0].point.distanceTo(b[0].point)<.001);
  }
  disposeSceneResources(closed);disposeSceneResources(cut);
});

test('photo feedback creates deep skirt pockets and an actually open front deck gallery',()=>{
  const d=assemblyDimensions(copyConfig()),root=createM54Block({...d,materials:{machined:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),black:new T.MeshStandardMaterial()}});root.updateMatrixWorld(true);
  const hit=(x:number,y:number)=>new T.Raycaster(new T.Vector3(x,y,-200),new T.Vector3(0,0,1)).intersectObject(root,true)[0];
  const pocket=hit(-132,-23),rib=hit(-160,-23);assert.ok(pocket&&rib);assert.ok(pocket.point.z-rib.point.z>20,'pocket backing must sit behind the cast grid');
  const gallery=new T.Raycaster(new T.Vector3(-271,d.deck+20,-89),new T.Vector3(0,-1,0),0,100).intersectObject(root,true);assert.equal(gallery.length,0,'the new top gallery must not be a solid blister');
  disposeSceneResources(root);
});
