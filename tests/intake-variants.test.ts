import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Intake,m54IntakeVariant} from '../src/engine-3d-intake';
import {disposeSceneResources} from '../src/engine-three-resources';
import {DEFAULT_TUNING} from '../native/tuning-settings.mjs';

const mat=(color:number,metalness?:number,roughness?:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
test('confirmed intake variants enlarge the collector while keeping mounting and throttle interfaces fixed',()=>{
  const original=JSON.stringify(DEFAULT_TUNING),models=['standard','sport','race'].map(intake=>createM54Intake(9,mat,{...DEFAULT_TUNING,intake:intake as 'standard'|'sport'|'race'}));
  const bounds=models.map(m=>{const s=new T.Scene();s.add(m.closed,m.cut,m.details,m.throttle);s.updateMatrixWorld(true);return new T.Box3().setFromObject(m.closed.getObjectByName('Breiter Kunststoffsammler')!);});
  assert.ok(bounds[1].min.z<bounds[0].min.z);assert.ok(bounds[2].min.z<bounds[1].min.z);
  for(let i=0;i<models.length;i++){
    const model=models[i],stock=models[0];assert.equal(bounds[i].max.z,bounds[0].max.z);
    assert.deepEqual(model.throttle.position.toArray(),stock.throttle.position.toArray());
    const faces=model.details.children.filter(p=>p.name==='Offener Saugrohrflansch');assert.equal(faces.length,6);
    assert.deepEqual(faces.map(p=>p.position.toArray()),stock.details.children.filter(p=>p.name==='Offener Saugrohrflansch').map(p=>p.position.toArray()));
    const plate=model.disa.getObjectByName('DISA Flanschplatte')!;const center=plate.getWorldPosition(new T.Vector3());
    assert.equal(center.z-bounds[i].min.z,-4,'DISA keeps the same seating distance from the enlarged shell');
    assert.deepEqual(model.variant.unsupportedKeys,[]);
  }
  assert.equal(JSON.stringify(DEFAULT_TUNING),original,'geometry never changes the native selection');
  for(const m of models)disposeSceneResources(m.closed.parent as T.Scene);
});
test('unimplemented intake options are explicitly reported rather than pretending to show them',()=>{
  assert.deepEqual(m54IntakeVariant({throttleBody:'itb',runners:'short',filter:'sport'}).unsupportedKeys,['throttleBody','runners','filter']);
  assert.equal(m54IntakeVariant().extraDepth,0);
});
