import test from 'node:test';
import assert from 'node:assert/strict';
import {mechanismPose,assemblyDimensions,valveSpringPose,camProfileRadius,flowActivity,pipeVisibility,combustionAppearance,CYLINDER_X} from '../src/engine-3d-model';
import {copyConfig,TAU} from '../src/model';
import {valveSample} from '../src/native-view';

test('3D piston and crankpin endpoints preserve native rod length for every cylinder and angle',()=>{
  const cfg=copyConfig();cfg.engine.strokeMm=84;
  const state={tdcRad:TAU/3,journalAngles:[0,TAU/3,TAU*2/3,TAU*2/3,TAU/3,0]};
  for(let a=0;a<2*TAU;a+=.049)for(let cylinder=1;cylinder<=6;cylinder++){
    const p=mechanismPose(a,cylinder,cfg,state),distance=Math.hypot(...p.piston.map((v,i)=>v-p.pin[i]));
    assert.ok(Math.abs(distance-cfg.engine.rodMm)<1e-9);assert.equal(p.piston[0],CYLINDER_X[cylinder-1]);
    assert.ok(Math.abs(Math.hypot(p.pin[1],p.pin[2])-42)<1e-9);
  }
});

test('assembly datums follow native geometry throughout the supported dimension ranges',()=>{
  const state={tdcRad:TAU/3,journalAngles:[0,TAU/3,TAU*2/3,TAU*2/3,TAU/3,0]};
  for(const boreMm of [70,84,100])for(const strokeMm of [60,84,105])for(const rodMm of [110,135,170]){
    const cfg=copyConfig();Object.assign(cfg.engine,{boreMm,strokeMm,rodMm});
    const d=assemblyDimensions(cfg);
    assert.equal(d.crankRadius,strokeMm/2);assert.equal(d.boreScale,boreMm/84);
    // The new crown uses the native 31.82 mm compression height. Preserve the
    // existing illustrative 9 mm chamber/valve-seat clearance above that crown.
    const tdc=mechanismPose(state.tdcRad-Math.PI/2,1,cfg,state);
    assert.ok(Math.abs(d.deck-tdc.piston[1]-31.82-9)<1e-10);
    assert.equal(205+d.headOffset,d.deck);
    for(let angle=0;angle<2*TAU;angle+=.16)for(let cylinder=1;cylinder<=6;cylinder++){
      const pose=mechanismPose(angle,cylinder,cfg,state);
      // Transform the actual crankpin's local Y-axis offset by its assembly rotation.
      const meshPin=[CYLINDER_X[cylinder-1],d.crankRadius*Math.cos(pose.rotation),d.crankRadius*Math.sin(pose.rotation)];
      for(let axis=0;axis<3;axis++)assert.ok(Math.abs(meshPin[axis]-pose.pin[axis])<1e-10);
      assert.ok(Math.abs(Math.hypot(...pose.piston.map((v,i)=>v-pose.pin[i]))-rodMm)<1e-9);
    }
  }
});

test('valve retainer motion compresses the spring against a fixed head seat',()=>{
  const closed=valveSpringPose(0);
  assert.equal(closed.length,34);
  for(const lift of [1,4,8,12]){
    const open=valveSpringPose(lift);
    assert.equal(open.bottom,closed.bottom);
    assert.equal(open.top,closed.top-lift);
    assert.equal(open.length,closed.length-lift);
    assert.equal(open.center-open.length/2,open.bottom);
    assert.equal(open.center+open.length/2,open.top);
    // The retainer and upper spring end keep their initial distance as the valve moves.
    assert.equal((260-lift)-open.top,260-closed.top);
  }
  for(const bad of [NaN,Infinity,-Infinity,-8])assert.deepEqual(valveSpringPose(bad),closed);
  assert.ok(valveSpringPose(100).length>0);
});

test('radial cam illustration follows native valve lift at half crank speed over a full 720-degree cycle',()=>{
  const curves={samples:[[[0,0],[2,0],[9,0],[1,0],[0,0],[0,8],[0,1],[0,0]],[[7,0],[0,0],[0,0],[0,0],[0,9],[0,1],[0,0],[0,0]]]};
  for(let angle=0;angle<=2*TAU;angle+=.07)for(let cylinder=1;cylinder<=2;cylinder++)for(const type of [0,1] as const){
    const rotation=angle/2,phi=Math.PI-rotation;
    const radius=camProfileRadius(curves,cylinder,type,phi),sample=valveSample({valveCurves:curves},angle,cylinder)!;
    const lift=type===0?sample.intakeLiftMm:sample.exhaustLiftMm;
    const worldBottom=279+radius*Math.cos(phi+rotation),followerTop=267-lift;
    assert.ok(Math.abs(worldBottom-followerTop)<1e-10);
    assert.ok(Math.abs(camProfileRadius(curves,cylinder,type,phi+TAU)-radius)<1e-10);
  }
  // Cylinder 1's intake maximum at 180 crank degrees faces down at 90 cam degrees.
  assert.ok(Math.abs(camProfileRadius(curves,1,0,Math.PI/2)-21)<1e-10);
  assert.ok(Math.abs(camProfileRadius(curves,1,1,Math.PI-TAU*5/8)-20)<1e-10);
  assert.ok(Math.abs(camProfileRadius(curves,2,0,Math.PI)-19)<1e-10);
  assert.equal(camProfileRadius(null,1,0,0),12);
});
test('pipe modes affect only pipes and fluid visibility, never the mechanical assembly',()=>{
  assert.deepEqual(pipeVisibility('solid'),{pipe:true,flow:true,opacity:1});
  assert.deepEqual(pipeVisibility('transparent'),{pipe:true,flow:true,opacity:.16});
  assert.deepEqual(pipeVisibility('flow'),{pipe:false,flow:true,opacity:1});
  assert.deepEqual(pipeVisibility('off'),{pipe:false,flow:false,opacity:1});
});
test('3D flows preserve per-cylinder native signs and do not invent missing gas or fuel',()=>{
  const cfg=copyConfig(),state={rpm:1000,ignition:true,cycles:[{cylinder:1,samples:[[100,300,3,0,-.4,.2,0]]},{cylinder:2,samples:[[100,300,3,0,.8,0,0]]}]};
  assert.equal(flowActivity('air',1,'main',state,cfg,0),-.4);assert.equal(flowActivity('air',2,'main',state,cfg,0),.8);
  assert.equal(flowActivity('fuel',1,'main',state,cfg,0),0);assert.equal(flowActivity('fuel',2,'main',state,cfg,0),.8);
  assert.equal(flowActivity('air',3,'main',state,cfg,0),0);assert.equal(flowActivity('exhaust',1,'main',state,cfg,0),.2);
  assert.equal(flowActivity('fuel',2,'main',{...state,ignition:false},cfg,0),0);
  assert.equal(flowActivity('air',2,'main',{...state,rpm:0},cfg,0),0);assert.equal(flowActivity('air',1,'main',null,cfg,0),0);
});
test('each exhaust collector uses its own signed cylinder flows and the tail combines both banks',()=>{
  const cfg=copyConfig(),rates=[.5,-1,.25,2,-.5,.75];
  const cycles=rates.map((rate,i)=>({cylinder:i+1,samples:[[100,300,0,0,.125,rate,0]]}));
  const state={rpm:1000,ignition:true,cycles};
  for(let i=0;i<rates.length;i++)assert.equal(flowActivity('exhaust',i+1,'main',state,cfg,0),rates[i]);
  const front=flowActivity('exhaust',undefined,'collector-front',state,cfg,0);
  const rear=flowActivity('exhaust',undefined,'collector-rear',state,cfg,0);
  assert.equal(front,-.25);assert.equal(rear,2.25);
  assert.equal(flowActivity('exhaust',undefined,'main',state,cfg,0),front+rear);
  assert.equal(flowActivity('fuel',undefined,'main',{...state,ignition:false},cfg,0),0);
  assert.equal(flowActivity('exhaust',undefined,'collector-rear',{...state,cycles:cycles.slice(0,3)},cfg,0),0);
  assert.equal(flowActivity('exhaust',undefined,'collector-front',{...state,rpm:0},cfg,0),0);
});
test('3D radiator and bypass activity conserve the existing thermal branch flow',()=>{
  const cfg=copyConfig();cfg.cooling.flowLMin=60;
  for(const radiator of [-10,0,20,60,100]){
    const state={radiatorFlowLMin:radiator};
    const a=flowActivity('water',undefined,'radiator',state,cfg,0),b=flowActivity('water',undefined,'bypass',state,cfg,0);
    assert.equal(a+b,60);assert.ok(a>=0&&b>=0);
    assert.equal(flowActivity('water',undefined,'radiator-core',state,cfg,0),a);assert.equal(flowActivity('water',undefined,'radiator-return',state,cfg,0),a);
    assert.equal(flowActivity('water',undefined,'expansion-vent',state,cfg,0),0);
  }
  assert.equal(flowActivity('water',undefined,'main',{thermalHalted:true},cfg,0),0);
});

test('mechanical water pump stops visible circulation when the connected crankshaft is at rest',()=>{
  const cfg=copyConfig();
  for(const branch of ['main','jacket','radiator','radiator-core','radiator-return','bypass']){
    assert.equal(flowActivity('water',undefined,branch,{rpm:0,radiatorFlowLMin:20},cfg,0),0);
  }
  assert.equal(flowActivity('water',undefined,'radiator',{rpm:1000,radiatorFlowLMin:20},cfg,0),20);
});

test('flame growth uses the recorded native burn window including a 720-degree wrap',()=>{
  const rows=Array.from({length:12},(_,i)=>[800,1700,0,0,0,.2,i>=10||i<2?1:0]);
  const state={rpm:900,ignition:true,cycles:[{cylinder:1,samples:rows}]};
  const a=combustionAppearance(state,TAU*2*10.2/12,1),b=combustionAppearance(state,TAU*2*.3/12,1);
  assert.equal(a.burning,true);assert.equal(b.burning,true);assert.ok(b.progress>a.progress);
  assert.equal(combustionAppearance(state,TAU*2*4/12,1).burning,false);
  assert.equal(combustionAppearance(state,0,2).available,false);
  assert.equal(combustionAppearance({...state,ignition:false},0,1).burning,false);
  assert.equal(combustionAppearance({...state,rpm:0},0,1).burning,false);
  assert.equal(combustionAppearance(null,0,1).burning,false);
});
