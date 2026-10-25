import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,copyConfig,THERMAL_LIMITS} from '../src/model';
function integrate(sim:Simulation,seconds:number,watts:number,dt=.02,speed=0){for(let i=0;i<Math.round(seconds/dt);i++)sim.thermalStep(dt,watts,speed);return sim.state;}

test('cold thermostat recirculates through bypass; radiator branch opens progressively',()=>{
 const sim=new Simulation();sim.thermalStep(.001,25000);assert.equal(sim.state.thermostatOpen,0);assert.equal(sim.state.radiatorFlowLMin,0);assert.equal(sim.state.coolantRadiatorKw,0);
 sim.resetThermal([105,95,70]);sim.thermalStep(.001,25000);assert.ok(sim.state.thermostatOpen>0&&sim.state.thermostatOpen<1);assert.ok(sim.state.radiatorFlowLMin>0&&sim.state.radiatorFlowLMin<sim.config.cooling.flowLMin);
 sim.resetThermal([115,110,80]);sim.thermalStep(.001,25000);assert.equal(sim.state.thermostatOpen,1);
});

test('25kW cold start reaches a stable operating temperature for one hour, with conserved energy',()=>{
 const sim=new Simulation();integrate(sim,2400,25000);const before=sim.snapshot();integrate(sim,1200,25000);const s=sim.state;
 assert.ok(s.coolantC>90&&s.coolantC<105);assert.ok(Math.abs(s.coolantC-before.coolantC)<.05);assert.equal(s.thermalStatus,'normal');assert.equal(s.thermalHalted,false);
 assert.ok(s.engineC>s.coolantC&&s.coolantC>s.radiatorC);assert.ok(s.fanDuty>0&&s.fanDuty<1);assert.ok(Math.abs(s.energyResidualJ)<.001);assert.ok(Math.abs(s.heatOutKw-25)<.01);
});

test('automatic fan keeps a stationary60kW load below110C; zero heat stays at ambient',()=>{
 const hot=new Simulation();integrate(hot,1800,60000);assert.equal(hot.state.thermalHalted,false);assert.ok(hot.state.coolantC>95&&hot.state.coolantC<110);assert.ok(hot.state.fanDuty>.7);
 const cold=new Simulation();integrate(cold,300,0);assert.equal(cold.state.coolantC,22);assert.equal(cold.state.engineC,22);assert.equal(cold.state.energyResidualJ,0);
});

test('fan and road air have causal effects; fan failure in stationary25kW operation reaches the limit',()=>{
 const off=new Simulation();off.setCooling({fan:0});integrate(off,1800,25000);assert.equal(off.state.thermalHalted,true);
 const full=new Simulation();full.setCooling({fan:3});integrate(full,1800,25000);assert.equal(full.state.thermalHalted,false);assert.ok(full.state.coolantC<off.state.coolantC-10);
 const moving=new Simulation();moving.setCooling({fan:0});integrate(moving,1800,25000,.02,100/3.6);assert.equal(moving.state.thermalHalted,false);assert.ok(moving.state.coolantC<105);
});

test('pump or radiator failure terminates at the first physical model boundary without losing energy',()=>{
 for(const fault of [{flowLMin:0},{radiatorWPerK:0}]){
  const sim=new Simulation();sim.setCooling(fault);sim.resetThermal([105,95,70]);integrate(sim,120,100000);
  const s=sim.state;assert.equal(s.thermalStatus,'limit');assert.equal(s.thermalHalted,true);assert.ok(s.coolantC<=THERMAL_LIMITS.coolantC+1e-8);assert.ok(s.engineC<=THERMAL_LIMITS.engineC+1e-8);assert.ok(s.thermalTimeS<120);assert.ok(Math.abs(s.energyResidualJ)<.001);
  const stopped=sim.snapshot();integrate(sim,120,100000);assert.deepEqual(sim.snapshot(),stopped);
  sim.resetThermal();assert.equal(sim.state.thermalHalted,false);assert.equal(sim.state.thermalTimeS,0);assert.equal(sim.state.coolantC,sim.config.cooling.ambientC);
 }
});

test('thermal time acceleration changes elapsed time, not the predicted temperature trajectory',()=>{
 const fine=new Simulation(),fast=new Simulation();integrate(fine,600,25000,.001);integrate(fast,600,25000,.03);
 for(const key of ['engineC','coolantC','radiatorC'] as const)assert.ok(Math.abs(fine.state[key]-fast.state[key])<.05,key);
 assert.ok(Math.abs(fast.state.energyResidualJ)<.001);assert.ok(Math.abs(fine.state.energyResidualJ)<.001);
});

test('invalid time steps or heat input cannot poison the cooling state',()=>{
 const sim=new Simulation(),before=sim.snapshot();for(const [dt,q]of[[NaN,1],[0,1],[2,1],[.01,NaN],[.01,-1]])assert.throws(()=>sim.thermalStep(dt,q));assert.deepEqual(sim.snapshot(),before);
});

test('a cooling comparison ends a failed branch at its actual limit time instead of extrapolating to1200s',async()=>{
 const {runExperiment,examplePair}=await import('../src/model');const pair=examplePair('cooling');pair.B.cooling.flowLMin=0;
 const result=runExperiment('cooling',pair.A,pair.B),a=result.A.at(-1)!,b=result.B.at(-1)!;
 assert.equal(a.thermalHalted,false);assert.ok(Math.abs(a.t-1200)<1e-6);assert.equal(b.thermalHalted,true);assert.ok(b.t<1200);assert.equal(b.t,b.thermalTimeS);assert.ok(result.B.slice(1,-1).every(s=>s.heatInKw===25));assert.ok(Math.abs(b.energyResidualJ)<.001);
});

test('thermal CSV records limit status and has matching header/data column counts',async()=>{
 const {timeSeriesCsv}=await import('../src/model');const sim=new Simulation();sim.setCooling({flowLMin:0});sim.resetThermal([105,95,70]);integrate(sim,120,100000);
 const csv=timeSeriesCsv([sim.snapshot()]),lines=csv.trim().split('\n');assert.ok(lines[0].endsWith('thermal_status,thermal_halted'));assert.ok(lines[1].endsWith('limit,true'));assert.equal(lines[0].split(',').length,lines[1].split(',').length);
});
