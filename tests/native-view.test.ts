import test from 'node:test';
import assert from 'node:assert/strict';
import {copyConfig,TAU} from '../src/model';
import {cycleSample,reuseValveCurves,shaftGeometry,valveSample} from '../src/native-view';

test('repeated serialized snapshots retain cam buffers while a changed native lift is accepted',()=>{
  const first={samples:[[[0,8],[10,0]],[[4,0],[0,2]]]};
  assert.equal(reuseValveCurves(undefined,first),first);
  const snapshot=JSON.parse(JSON.stringify(first));
  assert.notEqual(snapshot,first);assert.equal(reuseValveCurves(first,snapshot),first);
  snapshot.samples[1][1][1]=2.5;
  const changed=reuseValveCurves(first,snapshot);assert.equal(changed,snapshot);
  assert.equal(valveSample({valveCurves:changed},TAU,2)?.exhaustLiftMm,2.5);
  assert.equal(first.samples[1][1][1],2);
  const resized={samples:[[[0,8]]]};assert.equal(reuseValveCurves(first,resized),resized);
});

test('native valve interpolation is periodic, continuous across the 720-degree boundary and cylinder specific',()=>{
  const state={valveCurves:{samples:[[[0,8],[10,0],[0,2],[0,6]],[[5,0],[0,1],[0,8],[10,0]]]}};
  assert.deepEqual(valveSample(state,TAU/4,1),{intakeLiftMm:5,exhaustLiftMm:4});
  assert.deepEqual(valveSample(state,TAU/4,2),{intakeLiftMm:2.5,exhaustLiftMm:.5});
  assert.deepEqual(valveSample(state,-TAU/4,1),{intakeLiftMm:0,exhaustLiftMm:7});
  assert.deepEqual(valveSample(state,TAU*2,1),valveSample(state,0,1));
  for(let angle=-7;angle<19;angle+=.13){
    const a=valveSample(state,angle,1)!,b=valveSample(state,angle+2*TAU,1)!;
    assert.ok(Math.abs(a.intakeLiftMm-b.intakeLiftMm)<1e-10);
    assert.ok(Math.abs(a.exhaustLiftMm-b.exhaustLiftMm)<1e-10);
  }
  assert.equal(valveSample(state,0,3),null);
});

test('real-time and slow views sample native valves at the passed crank angle rather than stale telemetry',()=>{
  const state={
    valveCurves:{samples:[[[0,8],[10,0]]]},
    cylinders:[{pressureKpa:350,gasTemperatureK:500,intakeLiftMm:99,exhaustLiftMm:99,fuelFraction:.03,burning:false}],
    cycle:{cylinder:1,samples:[[700,600,77,77,.2,.3,1],[150,350,77,77,.1,0,0]]}
  };
  const live=cycleSample(state,TAU/2,1,false)!,slow=cycleSample(state,TAU/2,1,true)!;
  assert.equal(live.intakeLiftMm,5);assert.equal(slow.intakeLiftMm,5);
  assert.equal(live.exhaustLiftMm,4);assert.equal(slow.exhaustLiftMm,4);
  assert.equal(live.pressureKpa,350);assert.equal(slow.pressureKpa,700);
});

test('each slow cylinder uses its own captured pressure, burning and gas flows; missing samples stay missing',()=>{
  const state={cycles:[
    {cylinder:1,samples:[[700,600,0,0,.2,.3,1],null]},
    {cylinder:2,samples:[[110,300,3,0,.6,0,0],null]}
  ]};
  assert.equal(cycleSample(state,0,1,true)?.pressureKpa,700);
  assert.equal(cycleSample(state,0,2,true)?.pressureKpa,110);
  assert.equal(cycleSample(state,0,1,true)?.burning,true);
  assert.equal(cycleSample(state,0,2,true)?.burning,false);
  assert.equal(cycleSample(state,0,2,true)?.intakeMolS,.6);
  assert.equal(cycleSample(state,TAU,2,true),null);
  assert.equal(cycleSample(state,0,3,true),null);
});

test('one common crankshaft preserves the native paired journals and connecting-rod length',()=>{
  const config=copyConfig();config.engine.strokeMm=84;
  const state={tdcRad:2*TAU/3,journalAngles:[0,TAU/3,2*TAU/3,2*TAU/3,TAU/3,0]};
  for(let angle=0;angle<2*TAU;angle+=.08){
    for(const [a,b] of [[1,6],[2,5],[3,4]]){
      const first=shaftGeometry(angle,a,config,state),second=shaftGeometry(angle,b,config,state);
      assert.equal(first.pistonY,second.pistonY);
      assert.ok(Math.abs(Math.hypot(first.crankX,first.crankY-first.pistonY)-config.engine.rodMm)<1e-10);
    }
  }
});
