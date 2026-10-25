import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngineMaterial,workshopReflectionIntensity} from '../src/engine-material-profiles';
import {EngineThree} from '../src/engine-three';

test('existing component signatures produce distinct plausible surfaces and keep colour',()=>{
  const cast=createEngineMaterial(0x74858c,.45,.65),machined=createEngineMaterial(0xbdc9cb,.72,.34),exhaust=createEngineMaterial(0xffffff,.62,.57),plastic=createEngineMaterial(0x24343b,.24,.58),rubber=createEngineMaterial(0x121e23,.03,.83);
  assert.equal(cast.color.getHex(),0x74858c);assert.equal(machined.color.getHex(),0xbdc9cb);
  assert.ok(machined.metalness>.28 && machined.roughness<.4);
  assert.ok(cast.roughness>machined.roughness && cast.metalness>.5);
  assert.ok(exhaust.roughness>=.56 && exhaust.metalness<.8);
  assert.equal(plastic.metalness,0);assert.equal(rubber.metalness,0);
  assert.ok(rubber.roughness>plastic.roughness);
  assert.ok(workshopReflectionIntensity(machined)>workshopReflectionIntensity(rubber));
  assert.equal(new Set([cast,machined,exhaust,plastic,rubber].map(m=>m.userData.engineSurface.profile)).size,5);
});

test('oxidation vertex colours, coloured sections and author-specified dielectrics remain supported',()=>{
  const oxidized=createEngineMaterial(0xffffff,.33,.9),section=createEngineMaterial(0xbd9173,.28,.55),ceramic=createEngineMaterial(0xc4b493,.1,.75);
  oxidized.vertexColors=true;assert.equal(oxidized.roughness,.9);assert.ok(oxidized.metalness<.6);
  assert.equal(section.metalness,.28);assert.equal(section.roughness,.55);assert.equal(ceramic.metalness,.1);
});

test('real EngineThree factory creates profiled surfaces and registers each owned material',()=>{
  // The factory itself needs its ownership list, but no WebGL context or scene.
  const renderer=Object.create(EngineThree.prototype) as any;renderer.materials=[];
  const metal=renderer.mat(0xbdc9cb,.72,.34),rubber=renderer.mat(0x121e23,.03,.83);
  assert.equal(metal.userData.engineSurface.profile,'machined-metal');
  assert.ok(metal.metalness>.5&&metal.roughness<.4);
  assert.equal(rubber.userData.engineSurface.profile,'rubber');assert.equal(rubber.metalness,0);
  assert.deepEqual(renderer.materials,[metal,rubber]);
  metal.dispose();rubber.dispose();
});

test('light, PMREM, ACES exposure and shadow lifecycle are unchanged',()=>{
  const current=readFileSync('src/engine-view-lighting.ts','utf8').replaceAll('\r\n','\n'),before=readFileSync('evidence/detail-light-r3/engine-view-lighting.before.txt','utf8').replaceAll('\r\n','\n');
  const reverted=current.replace("import { workshopReflectionIntensity } from './engine-material-profiles';\n",'').replace('workshopReflectionIntensity(material)','material.metalness > .3 ? 1.05 : .55');
  assert.equal(reverted,before);
});
