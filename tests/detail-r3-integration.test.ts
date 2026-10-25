import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Block} from '../src/engine-3d-block';
import {createM54Casting} from '../src/engine-3d-casting';
import {createEngineMaterial} from '../src/engine-material-profiles';
import {disposeSceneResources} from '../src/engine-three-resources';

test('closed and cut block use the casting surface profile without losing vertex grain',()=>{
  for(const cutaway of [false,true]){
    const block=createM54Block({deck:190,boreScale:1,cutaway,materials:{machined:createEngineMaterial(0xbdc9cb,.72,.34),steel:createEngineMaterial(0x77858c,.72,.4),black:createEngineMaterial(0x24343b,.24,.58)}});
    const cast:T.Mesh[]=[];
    block.traverse(p=>{if(p instanceof T.Mesh&&(p.material as T.Material).userData.engineSurface?.profile==='cast-aluminium')cast.push(p);});
    assert.ok(cast.length>0,'both presentations contain the profiled casting');
    for(const part of cast){
      const material=part.material as T.MeshStandardMaterial;
      assert.equal(material.vertexColors,true);assert.ok(part.geometry.getAttribute('color'));
      assert.ok(material.metalness>.5&&material.roughness>=.6,'casting remains a rough metal');
      assert.equal(material.envMapIntensity,material.userData.engineSurface.reflection);
    }
    disposeSceneResources(block);
  }
});

test('casting retains six inlet flanges without duplicating the manifold exhaust mounts',()=>{
  const mat=()=>new T.MeshStandardMaterial();
  const casting=createM54Casting({deck:190,headOffset:0,boreScale:1,materials:{cast:mat(),machined:mat(),steel:mat(),black:mat(),rubber:mat(),brass:mat(),cut:mat()}});
  assert.equal(casting.portMounts.children.filter(p=>p.name==='Verschraubter Ansaugflansch').length,6);
  assert.equal(casting.portMounts.children.filter(p=>p.name==='Verschraubter Abgaskruemmerflansch').length,0);
  const scene=new T.Scene();scene.add(...casting.groups);disposeSceneResources(scene);
});
