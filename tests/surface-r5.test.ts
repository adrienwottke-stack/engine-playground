import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {createEngineMaterial} from '../src/engine-material-profiles';
import {cloneEngineMaterialWithSurface,installEngineSurfaceDetail} from '../src/engine-material-surfaces';
import {disposeSceneResources} from '../src/engine-three-resources';

const shader = () => ({ vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader, uniforms: {} });

test('R4 profile colours, reflection and numeric material ranges remain exactly unchanged',()=>{
  const current=readFileSync('src/engine-material-profiles.ts','utf8').replaceAll('\r\n','\n');
  const before=readFileSync('evidence/surface-r5/engine-material-profiles.before.txt','utf8').replaceAll('\r\n','\n');
  const reverted=current.replace("import {installEngineSurfaceDetail} from './engine-material-surfaces';\n",'').replace('return installEngineSurfaceDetail(material);','return material;');
  assert.equal(reverted,before);
});

test('R5 extends actual installed PBR shader slots for three materials and distinct program keys',()=>{
  const keys=new Set<string>();
  for(const kind of ['cast-aluminium','machined-metal','black-plastic'] as const){
    const material=createEngineMaterial(0x888888,.5,.6,kind),source=shader();
    material.onBeforeCompile(source as any,{} as T.WebGLRenderer);
    assert.match(source.vertexShader,/vEngineSurfacePosition = position/);
    assert.match(source.fragmentShader,/engineSurfaceNormal\(-vViewPosition/);
    assert.match(source.fragmentShader,/smoothstep\(\.28, \.95/);
    assert.doesNotMatch(source.fragmentShader,/uniform sampler2D engine/);
    assert.equal(Object.keys(source.uniforms).length,0);keys.add(material.customProgramCacheKey());
    const hook=material.onBeforeCompile;installEngineSurfaceDetail(material);assert.equal(material.onBeforeCompile,hook);
  }
  assert.equal(keys.size,3);
  assert.match(T.ShaderChunk.normal_fragment_maps,/faceDirection/);
  assert.match(T.ShaderChunk.roughnessmap_fragment,/float roughnessFactor = roughness/);
});

test('clone helper reinstalls lost hooks, preserves external normal maps, opacity and key',()=>{
  const original=createEngineMaterial(0x888888,.5,.6,'cast-aluminium');original.transparent=true;original.opacity=.28;
  const plain=original.clone();assert.notEqual(plain.onBeforeCompile,original.onBeforeCompile);
  const clone=cloneEngineMaterialWithSurface(original),source=shader();clone.onBeforeCompile(source as any,{} as T.WebGLRenderer);
  assert.match(source.fragmentShader,/engineSurfaceHeight/);assert.equal(clone.opacity,.28);assert.equal(clone.transparent,true);
  assert.equal(clone.customProgramCacheKey(),original.customProgramCacheKey());
  const normal=new T.Texture();original.normalMap=normal;
  const mapped=cloneEngineMaterialWithSurface(original),mappedShader=shader();mapped.onBeforeCompile(mappedShader as any,{} as T.WebGLRenderer);
  assert.equal(mapped.normalMap,normal);assert.equal(original.normalMap,normal);assert.equal(mappedShader.fragmentShader,T.ShaderLib.standard.fragmentShader);
});

test('zero hidden texture resources: partial rebuild preserves borrowed normal map and final dispose frees once',()=>{
  const original=createEngineMaterial(0x999999,.7,.34,'machined-metal'),normal=new T.Texture();original.normalMap=normal;
  const clone=cloneEngineMaterialWithSurface(original),root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(),clone));
  assert.deepEqual(Object.values(clone).filter(v=>v instanceof T.Texture),[normal]);
  let count=0;normal.addEventListener('dispose',()=>count++);
  const partial=disposeSceneResources(root,new Set(),new Set([normal]));assert.equal(partial.textures,0);assert.equal(count,0);
  const final=new T.Group();final.add(new T.Mesh(new T.BoxGeometry(),original));disposeSceneResources(final);assert.equal(count,1);
});
