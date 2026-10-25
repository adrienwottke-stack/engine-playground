import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Casting} from '../src/engine-3d-casting';
import {createM54TimingDrive} from '../src/engine-3d-timing';
import {disposeSceneResources} from '../src/engine-three-resources';

test('closed timing wall sits ahead of the moving chains and leaves the water-pump shaft open',()=>{
 for(const headOffset of [0,18]){
  const mat=()=>new T.MeshStandardMaterial(),casting=createM54Casting({deck:190,headOffset,boreScale:1,materials:{cast:mat(),machined:mat(),steel:mat(),black:mat(),rubber:mat(),brass:mat(),cut:mat()}});
  const timing=createM54TimingDrive(headOffset,mat),scene=new T.Scene();scene.add(casting.closed,casting.cutBlock,casting.cutHead,casting.portMounts,timing.root);scene.updateMatrixWorld(true);
  const wall=casting.closed.getObjectByName('Geschlossene Steuertrieb Frontwand') as T.Mesh;
  const rim=casting.closed.getObjectByName('Hohler Steuertrieb Gehaeuserand') as T.Mesh;
  assert.ok(wall&&rim);const bounds=new T.Box3().setFromObject(wall);
  for(const chain of timing.chain){chain.links.geometry.computeBoundingBox();const frontOfChain=chain.curve.getPointAt(0).x+chain.links.geometry.boundingBox!.min.x;assert.ok(bounds.max.x<frontOfChain-1,'solid front wall must not occupy the chain plates');}
  const pumpRay=new T.Raycaster(new T.Vector3(-390,63,-30),new T.Vector3(1,0,0));
  assert.equal(pumpRay.intersectObject(wall).length,0,'pump shaft passes through an actual mounting aperture');
  const insideRay=new T.Raycaster(new T.Vector3(-341,120,0),new T.Vector3(1,0,0),0,25);
  assert.equal(insideRay.intersectObject(rim).length,0,'perimeter is hollow around the timing drive');
  disposeSceneResources(scene);
 }
});
