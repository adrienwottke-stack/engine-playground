import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,GridHelper,InstancedMesh,Mesh,MeshBasicMaterial,Texture} from 'three';
import {disposeSceneResources} from '../src/engine-three-resources';

test('scene cleanup includes line helpers and deduplicates cloned resources',()=>{
  const root=new Group(),geometry=new BoxGeometry(),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
  root.add(mesh,mesh.clone(),new GridHelper(10,2));
  const calls=new Map<unknown,number>();
  root.traverse(object=>{
    const item=object as any;
    for(const resource of [item.geometry,...(Array.isArray(item.material)?item.material:item.material?[item.material]:[])].filter(Boolean)){
      if(calls.has(resource))continue;
      calls.set(resource,0);resource.addEventListener('dispose',()=>calls.set(resource,calls.get(resource)!+1));
    }
  });
  disposeSceneResources(root);
  assert.ok(calls.size>=4);for(const count of calls.values())assert.equal(count,1);
});

test('rebuilding an assembly can preserve shared renderer materials',()=>{
  const root=new Group(),material=new MeshBasicMaterial();root.add(new Mesh(new BoxGeometry(),material));
  let disposed=false;material.addEventListener('dispose',()=>disposed=true);
  disposeSceneResources(root,new Set([material]));assert.equal(disposed,false);
  disposeSceneResources(root);assert.equal(disposed,true);
});

test('shared asset textures are released once across material slots and clones',()=>{
 const root=new Group(),texture=new Texture(),material=new MeshBasicMaterial({map:texture});
 const mesh=new Mesh(new BoxGeometry(),material);root.add(mesh,mesh.clone());let disposed=0;
 texture.addEventListener('dispose',()=>disposed++);const result=disposeSceneResources(root);
 assert.equal(result.textures,1);assert.equal(disposed,1);
});

test('assembly replacement releases its owned maps while preserving borrowed lighting textures',()=>{
 const root=new Group(),reflection=new Texture(),owned=new Texture();
 const material=new MeshBasicMaterial({map:owned,envMap:reflection});root.add(new Mesh(new BoxGeometry(),material));
 let lightingDisposed=0,ownedDisposed=0,materialDisposed=0;
 reflection.addEventListener('dispose',()=>lightingDisposed++);owned.addEventListener('dispose',()=>ownedDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
 const result=disposeSceneResources(root,new Set(),new Set([reflection]));
 assert.equal(lightingDisposed,0);assert.equal(ownedDisposed,1);assert.equal(materialDisposed,1);assert.equal(result.textures,1);
});

test('assembly replacement releases each instance buffer while retaining a shared material',()=>{
 const root=new Group(),geometry=new BoxGeometry(),material=new MeshBasicMaterial();
 const first=new InstancedMesh(geometry,material,4),second=new InstancedMesh(geometry,material,6);
 root.add(first,second);let firstReleased=0,secondReleased=0,geometryReleased=0,materialReleased=0;
 first.addEventListener('dispose',()=>firstReleased++);second.addEventListener('dispose',()=>secondReleased++);
 geometry.addEventListener('dispose',()=>geometryReleased++);material.addEventListener('dispose',()=>materialReleased++);
 const result=disposeSceneResources(root,new Set([material]));
 assert.equal(firstReleased,1);assert.equal(secondReleased,1);assert.equal(geometryReleased,1);
 assert.equal(materialReleased,0);assert.equal(result.instances,2);
 material.dispose();
});
