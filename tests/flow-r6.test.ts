import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createEngineFlowView} from '../src/engine-flow-view';
import {copyConfig,TAU} from '../src/model';
import type {ViewState} from '../src/drawing';
import {writeNativeFlowPulses,FLOW_PULSE_TRAVEL_PER_CYCLE} from '../src/engine-flow-pulses';
import {flowChamberState,createChamberVolumeGeometry,updateChamberVolumeColours} from '../src/engine-flow-chamber';
import {mechanismPose} from '../src/engine-3d-model';
import {PISTON_SPEC} from '../src/piston-spec';

function state():ViewState {
  return {rpm:900,ignition:true,cycles:Array.from({length:6},(_,i)=>({cylinder:i+1,samples:[[130,450,6,0,.3,0,0]]})),valveCurves:{samples:Array.from({length:6},()=>[[6,0]])}};
}
test('flow layer owns six cylinders and 24 valves; no missing telemetry creates activity',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg);view.setVisible(true);view.update(null,cfg,TAU,1);
 const d=view.diagnostics();assert.equal(d.cylinders,6);assert.equal(d.valves,24);assert.equal(d.available,false);assert.ok(d.routes.every(r=>r.rate===0));assert.ok(d.sprayActivity.every(x=>x===0));
 let points=0;view.root.traverse(o=>{if(o instanceof T.Points)points++;});assert.equal(points,0);view.dispose();
});
test('port spray ends outside bores and needs ignition, positive intake AND inlet lift',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),s=state();view.update(s,cfg,0,1);
 assert.ok(view.diagnostics().sprayTargets.every(({nozzle,end})=>nozzle[2]===-95&&end[2]===-55&&end[2]<-cfg.engine.boreMm/2));assert.ok(view.diagnostics().sprayActivity.every(x=>x>0));
 for(const mutate of [(s:ViewState)=>{s.ignition=false;},(s:ViewState)=>{s.rpm=0;},(s:ViewState)=>{s.valveCurves!.samples.forEach(c=>c[0][0]=0);},(s:ViewState)=>{s.cycles!.forEach(c=>c.samples[0]![4]=-.3);}]){const value=state();mutate(value);view.update(value,cfg,0,2);assert.ok(view.diagnostics().sprayActivity.every(x=>x===0));}
 view.update(s,cfg,0,3,0,{fuel:'off'});assert.ok(view.diagnostics().sprayActivity.every(x=>x===0));view.dispose();
});
test('native signed flow reverses bands and preserves unwrapped drive angle',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),s=state();view.update(s,cfg,0,1,100*TAU);view.update(s,cfg,0,1.05,100*TAU+.1);
 const a=view.diagnostics().routes.find(r=>r.medium==='air'&&r.cylinder===1)!;assert.ok(a.rate>0);const positivePhase=a.phase;
 s.cycles!.forEach(c=>c.samples[0]![4]=-.3);view.update(s,cfg,0,1.1,100*TAU+.2);
 const b=view.diagnostics().routes.find(r=>r.medium==='air'&&r.cylinder===1)!;assert.ok(b.rate<0);assert.ok(Math.abs(b.phase)<1e-8||b.phase<positivePhase);assert.equal(view.diagnostics().driveAngle,100*TAU+.2);view.dispose();
});
test('one-cylinder telemetry does not imply availability or heat in other cylinders',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),s=state();s.cycles=s.cycles!.slice(0,1);view.update(s,cfg,0,1);assert.ok(view.diagnostics().sprayActivity.slice(1).every(x=>x===0));assert.ok(view.diagnostics().routes.filter(r=>r.cylinder&&r.cylinder!==1).every(r=>r.rate===0));view.dispose();
});
test('repeated updates retain geometry/material identities; disposal releases owned resources once',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),s=state(),resources=new Set<T.BufferGeometry|T.Material|T.InstancedMesh>(),counts=new Map<object,number>();
 view.root.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);resources.add(o.material as T.Material);if(o instanceof T.InstancedMesh)resources.add(o);}});
 for(const r of resources){counts.set(r,0);(r as {addEventListener(type:'dispose',fn:()=>void):void}).addEventListener('dispose',()=>{counts.set(r,counts.get(r)!+1);});}
 const geometryCount=view.diagnostics().geometries;for(let i=0;i<100;i++)view.update(s,cfg,i*.03,i*.01);
 const after=new Set<object>();view.root.traverse(o=>{if(o instanceof T.Mesh){after.add(o.geometry);after.add(o.material);if(o instanceof T.InstancedMesh)after.add(o);}});
 assert.deepEqual(after,resources);assert.equal(view.diagnostics().geometries,geometryCount);view.dispose();view.dispose();for(const n of counts.values())assert.equal(n,1);assert.equal(view.root.children.length,0);assert.equal(view.diagnostics().disposed,true);
});

test('pulse packets start at recorded flow onset and keep their source through collector/main/tail junctions',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),packets=Array.from({length:6},()=>new T.Vector4());
 const samples=Array.from({length:144},(_,i)=>[100,700,0,0,i>=72&&i<106?.4:0,i>=30&&i<64?.6:0,0]);
 const s:ViewState={rpm:900,ignition:true,cycles:[{cylinder:1,samples}]};
 writeNativeFlowPulses(packets,s,TAU,'air');assert.equal(packets[0].x,0);assert.ok(packets[0].z>0);assert.ok(packets.slice(1).every(p=>p.z===0));
 writeNativeFlowPulses(packets,s,TAU+.2,'air');assert.ok(Math.abs(packets[0].x-.2/(TAU*2)*FLOW_PULSE_TRAVEL_PER_CYCLE)<1e-8);
 const forward=packets[0].x;writeNativeFlowPulses(packets,s,TAU*3+.2,'air');assert.ok(Math.abs(packets[0].x-forward)<1e-8);
 samples.forEach(row=>row[4]=0);writeNativeFlowPulses(packets,s,TAU+.2,'air');assert.equal(packets[0].z,0,'in-place telemetry revisions must not retain an old event');
 view.update(s,cfg,TAU,1);const routes=view.diagnostics().routes;
 for(const cylinder of [1,2,3,4,5,6]){
  const i=cylinder-1,suffix=cylinder<=3?'front':'rear',header=routes.find(r=>r.medium==='exhaust'&&r.cylinder===cylinder&&r.branch==='header')!;
  const bank=routes.filter(r=>r.medium==='exhaust'&&r.branch?.endsWith(suffix)&&!r.cylinder);let previous=header;
  for(const branch of ['collector-','main-','tail-']){const current=bank.find(r=>r.branch===branch+suffix)!;assert.ok(Math.abs(previous.offsets[i]+previous.length-current.offsets[i])<1e-7);previous=current;}
  const air=routes.find(r=>r.medium==='air'&&r.cylinder===cylinder&&r.branch==='runner')!,head=routes.find(r=>r.medium==='air'&&r.cylinder===cylinder&&r.branch==='head-intake-left')!;
  assert.ok(Math.abs(air.offsets[i]+air.length-head.offsets[i])<1e-7);
 }
 assert.equal(view.diagnostics().mechanics.mainJournals,7);assert.equal(view.diagnostics().mechanics.crankCheeks,12);view.dispose();
});

test('constant, missing or halted telemetry cannot create periodic pulse packets',()=>{
 const packets=Array.from({length:6},()=>new T.Vector4());
 const constant:ViewState={rpm:900,cycles:[{cylinder:1,samples:Array.from({length:72},()=>[100,500,0,0,.5,.5,0])}]};
 for(const s of [null,constant,{...constant,rpm:0}])for(const medium of ['air','exhaust'] as const){writeNativeFlowPulses(packets,s,50,medium);assert.ok(packets.every(p=>p.z===0));}
});

test('chamber volume follows the moving crown while its roof and native valve seats stay fixed',()=>{
 const cfg=copyConfig(),view=createEngineFlowView(cfg),s=state();
 for(const angle of [0,.4,Math.PI,TAU,TAU*2-.01]){
  view.update(s,cfg,angle,angle+1);const d=view.diagnostics();
  for(const c of d.chambers){const pose=mechanismPose(angle,c.cylinder,cfg,s);assert.ok(Math.abs(c.bottom-pose.piston[1]-PISTON_SPEC.compressionHeightMm)<1e-8);assert.ok(Math.abs(c.top-d.dimensions.deck)<1e-8);assert.ok(c.top>c.bottom);}
 }
 view.dispose();
});

test('valve curtains require matching native lift AND signed flow; ignition gates the flame window',()=>{
 const s=state();assert.ok(flowChamberState(s,0,1).intakeGate>0);assert.equal(flowChamberState(s,0,1).exhaustGate,0);
 s.valveCurves!.samples[0][0][0]=0;assert.equal(flowChamberState(s,0,1).intakeGate,0);
 s.cycles![0].samples[0]=[1800,1700,0,7,0,.4,1];s.valveCurves!.samples[0][0]=[0,7];
 const firing=flowChamberState(s,0,1);assert.equal(firing.burning,true);assert.equal(firing.stage,3);assert.ok(firing.exhaustGate>0);
 s.ignition=false;assert.equal(flowChamberState(s,0,1).burning,false);assert.equal(flowChamberState(s,0,1).progress,0);
 s.cycles![0].samples[0]![5]=-.4;assert.equal(flowChamberState(s,0,1).exhaustGate,0);
 s.rpm=0;assert.equal(flowChamberState(s,0,1).exhaustGate,0);assert.equal(flowChamberState(s,0,1).stage,0);
 assert.equal(flowChamberState(null,0,1).active,false);
});

test('the exhaust packet carries temperature from the recorded origin after the valve has closed',()=>{
 const packets=Array.from({length:6},()=>new T.Vector4()),heat=Array<number>(6).fill(0);
 const rows=Array.from({length:144},(_,i)=>[100,i>=36&&i<45?1350:350,0,0,0,i>=36&&i<45?.5:0,0]);
 const s:ViewState={rpm:900,cycles:[{cylinder:1,samples:rows}]};writeNativeFlowPulses(packets,s,TAU*1.5,'exhaust',heat);
 assert.ok(packets[0].x>0);assert.ok(packets[0].z>0);assert.ok(Math.abs(heat[0]-.5)<1e-8);assert.ok(heat.slice(1).every(x=>x===0));
 s.rpm=0;writeNativeFlowPulses(packets,s,TAU*1.5,'exhaust',heat);assert.ok(heat.every(x=>x===0));
});

test('interior density samples stay inside the bore and the native burn window changes their actual RGBA buffer',()=>{
 const geometry=createChamberVolumeGeometry(0),position=geometry.getAttribute('position'),colours=geometry.getAttribute('color');
 for(let i=0;i<position.count;i++){assert.ok(Math.hypot(position.getX(i),position.getZ(i))<=1.000001);assert.ok(Math.abs(position.getY(i))<=.500001);}
 const rows=Array.from({length:144},(_,i)=>[i<9?2100:100,i<9?1750:320,i>=72&&i<108?6:0,0,i>=72&&i<108?.4:0,0,i<9?1:0]);
 const native:ViewState={rpm:900,ignition:true,cycles:[{cylinder:1,samples:rows}]};
 updateChamberVolumeColours(geometry,flowChamberState(native,TAU+.3,1));let coldRed=0;for(let i=0;i<colours.count;i++)coldRed+=colours.getX(i);
 updateChamberVolumeColours(geometry,flowChamberState(native,35/360*TAU,1));let hotRed=0;for(let i=0;i<colours.count;i++)hotRed+=colours.getX(i);
 assert.ok(hotRed>coldRed*3);assert.equal(geometry.getAttribute('color'),colours);
 for(const value of colours.array)assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
 native.ignition=false;updateChamberVolumeColours(geometry,flowChamberState(native,35/360*TAU,1));let offRed=0;for(let i=0;i<colours.count;i++)offRed+=colours.getX(i);assert.ok(offRed<hotRed);geometry.dispose();
});
