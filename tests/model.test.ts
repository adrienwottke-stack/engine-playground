import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DEFAULT_CONFIG, copyConfig, validateConfig, rpmToOmega, omegaToRpm, powerKw, pistonGeometry, FIRING_ORDER, TAU, examplePair, runExperiment, timeSeriesCsv, type State } from '../src/model';

function finite(s: State) { for (const [key, value] of Object.entries(s)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} ist ${value}`); }
test('live drivetrain configuration preserves the running state; thermal reset preserves engine and controls', () => {
  const sim = new Simulation(); sim.start(); sim.setControls({throttle:.5,gear:1,clutch:.4}); sim.advance(3);
  const before = sim.snapshot(), controls = {...sim.controls}, next = copyConfig(sim.config);
  next.engine.flywheelKgM2=.8;next.vehicle.massKg=3000;next.vehicle.finalDrive=5;
  sim.setLiveConfig(next); assert.deepEqual(sim.snapshot(),before); assert.deepEqual(sim.controls,controls);
  sim.resetThermal([95,85,70]); assert.equal(sim.state.rpm,before.rpm);assert.equal(sim.state.ignition,true);assert.deepEqual(sim.controls,controls);
  assert.equal(sim.state.coolantC,85);assert.equal(sim.state.thermalTimeS,0);
  sim.thermalStep(.01,25000);assert.ok(Math.abs(sim.state.energyResidualJ)<1e-7);
});
test('a stopped pump stops coolant transport; warm radiator and fan settings change heat loss immediately',()=>{
  const sim=new Simulation();sim.resetThermal([110,100,70]);sim.setCooling({flowLMin:0,radiatorWPerK:0});sim.thermalStep(.001,25000);
  assert.equal(sim.state.coolantRadiatorKw,0);const slow=sim.state.coolantSlopeCS,low=sim.state.heatOutKw;
  sim.setCooling({flowLMin:100,radiatorWPerK:650,fan:3});sim.thermalStep(.001,25000);
  assert.ok(sim.state.coolantRadiatorKw>90);assert.ok(sim.state.coolantSlopeCS<slow);assert.ok(sim.state.heatOutKw>low+30);
  assert.ok(Math.abs(sim.state.energyResidualJ)<1e-7);
});
test('SI conversion: 60 rpm = 2π rad/s, 300 Nm at 3000 rpm = 94.2478 kW', () => {
  assert.ok(Math.abs(rpmToOmega(60) - TAU) < 1e-12);
  assert.ok(Math.abs(omegaToRpm(rpmToOmega(6732.5)) - 6732.5) < 1e-9);
  assert.ok(Math.abs(powerKw(300, 3000) - 94.2477796077) < 1e-8);
});
test('slider-crank has exact rod length, bore-independent stroke and valid six-cylinder phases', () => {
  for (let degree = 0; degree < 720; degree++) for (let cylinder = 1; cylinder <= 6; cylinder++) {
    const g = pistonGeometry(degree * Math.PI / 180, cylinder, 89.6, 135);
    assert.ok(Math.abs(Math.hypot(g.crankX, g.pistonY - g.crankY) - 135) < 1e-10);
    assert.ok(g.travel >= -1e-10 && g.travel <= 89.6 + 1e-10);
  }
  FIRING_ORDER.forEach((cylinder, index) => assert.ok(Math.abs(pistonGeometry(index * TAU / 3, cylinder, 89.6, 135).travel) < 1e-8));
  assert.ok(Math.abs(pistonGeometry(Math.PI, 1, 89.6, 135).travel - 89.6) < 1e-10);
});
test('start, throttle, shaft load, stop and reset act on the running state', () => {
  const sim = new Simulation();
  sim.start(); sim.advance(2);
  assert.equal(sim.state.engineStatus, 'running'); assert.ok(sim.state.rpm > 700 && sim.state.rpm < 1000);
  sim.setControls({ throttle: 0.5 }); sim.advance(1);
  const unloaded = sim.state.rpm; assert.ok(unloaded > 2000);
  sim.setControls({ dynoEnabled: true, dynoNm: 200 }); sim.advance(1);
  assert.ok(sim.state.rpm < unloaded); assert.equal(sim.state.dynoNm, 200);
  assert.ok(Math.abs(sim.state.powerKw - powerKw(sim.state.torqueNm, sim.state.rpm)) < 1e-10);
  sim.stop(); sim.advance(5); assert.equal(sim.state.ignition, false); assert.equal(sim.state.rpm, 0);
  sim.reset(); assert.equal(sim.state.t, 0); assert.equal(sim.state.rpm, 0); assert.equal(sim.state.coolantC, DEFAULT_CONFIG.cooling.ambientC);
});
test('pedal delay follows the exact first-order step response independently of inertia', () => {
  const c = copyConfig(); c.engine.throttleLagS = 0.5;
  const sim = new Simulation(c); sim.setControls({ throttle: 1 }); sim.advance(1);
  assert.ok(Math.abs(sim.state.actualThrottle - (1 - Math.exp(-2))) < 1e-11);
  assert.equal(sim.state.rpm, 0);
});
test('neutral is decoupled; slipping clutch is bounded; locked speeds obey gear kinematics', () => {
  const pair = examplePair('gearing');
  const result = runExperiment('gearing', pair.A, pair.B);
  for (const [data, c] of [[result.A, result.configs.A], [result.B, result.configs.B]] as const) {
    let locked = 0, slip = 0;
    for (const s of data) {
      finite(s);
      if (s.clutchState === 'locked') { locked++; assert.ok(Math.abs(s.rpm - s.wheelRpm * c.vehicle.gears[1] * c.vehicle.finalDrive) < 1e-7); }
      if (s.clutchState === 'slip') { slip++; assert.ok(s.clutchHeatKw >= 0); }
      assert.ok(Math.abs(s.wheelTorqueNm) <= 420 * c.vehicle.gears[1] * c.vehicle.finalDrive + 1e-6);
    }
    assert.ok(locked > 100); assert.ok(slip > 0);
  }
  const neutral = new Simulation(); neutral.start(); neutral.setControls({ throttle: 1, clutch: 1 }); neutral.advance(4);
  assert.equal(neutral.state.speedKmh, 0); assert.equal(neutral.state.wheelTorqueNm, 0); assert.equal(neutral.state.clutchState, 'neutral');
});
test('thermal energy is conserved: injected energy minus ambient losses equals stored heat', () => {
  const c = copyConfig(); c.cooling.heatMode = 'manual'; c.cooling.manualHeatKw = 25;
  const sim = new Simulation(c); sim.advance(60);
  assert.ok(Math.abs(sim.state.energyResidualJ) < 1e-4, `${sim.state.energyResidualJ} J`);
  assert.ok(sim.state.engineC > sim.state.coolantC); assert.ok(sim.state.coolantC > sim.state.radiatorC);
  assert.equal(sim.state.heatInKw, 25);
  const before = sim.snapshot(); sim.setCooling({ fan: 3, radiatorWPerK: 500 });
  assert.equal(sim.state.coolantC, before.coolantC); // Regler never directly assign temperatures.
  sim.advance(10); assert.ok(sim.state.heatOutKw > before.heatOutKw);
  assert.ok(Math.abs(sim.state.energyResidualJ) < 1e-4);
});
test('thermal equilibrium with zero input and ambient initial conditions is exact', () => {
  const sim = new Simulation(); sim.advance(10);
  assert.equal(sim.state.engineC, 22); assert.equal(sim.state.coolantC, 22); assert.equal(sim.state.heatOutKw, 0);
});
test('the reference experiment is exactly reproducible and the heavier flywheel responds more slowly', () => {
  const pair = examplePair('inertia'); const first = runExperiment('inertia', pair.A, pair.B), second = runExperiment('inertia', pair.A, pair.B);
  assert.deepEqual(first, second);
  const rise = (data: State[]) => data.find(s => s.t >= 2 && s.rpm >= 4000)!.t;
  const fall = (data: State[]) => data.find(s => s.t >= 5 && s.rpm <= 2000)!.t;
  assert.ok(rise(first.A) < rise(first.B)); assert.ok(fall(first.A) < fall(first.B));
  assert.equal(first.A[0].rpm, first.B[0].rpm); assert.equal(first.A[0].engineC, first.B[0].engineC);
  assert.ok(timeSeriesCsv(first.A).includes('brake_torque_Nm'));
});
test('A/B normalization prevents unrelated changes in B from confounding inertia and gearing', () => {
  const p = examplePair('inertia'); p.B.vehicle.massKg = 3000; p.B.engine.boreMm = 100; p.B.engine.throttleLagS = 2;
  const r = runExperiment('inertia', p.A, p.B);
  assert.equal(r.configs.A.vehicle.massKg, r.configs.B.vehicle.massKg); assert.equal(r.configs.A.engine.boreMm, r.configs.B.engine.boreMm); assert.equal(r.configs.B.engine.throttleLagS, 0);
});
test('cooling A/B uses identical duration, start temperatures and 25 kW input', () => {
  const p = examplePair('cooling'); p.B.cooling.ambientC = 35;
  const r = runExperiment('cooling', p.A, p.B);
  assert.equal(r.A[0].coolantC, r.B[0].coolantC); assert.equal(r.A.length, r.B.length);
  assert.ok(r.A.slice(1).every(s => s.heatInKw === 25)); assert.ok(r.B.slice(1).every(s => s.heatInKw === 25));
  assert.ok(r.A.at(-1)!.coolantC < r.B.at(-1)!.coolantC);
  assert.ok(Math.abs(r.A.at(-1)!.energyResidualJ) < 0.001); assert.ok(Math.abs(r.B.at(-1)!.energyResidualJ) < 0.001);
});
test('all admitted parameter extremes remain finite under throttle, load, slip and heat', () => {
  for (const high of [false, true]) for (const flow of [0, 100]) for (const lag of [0, 2]) {
    const c = copyConfig(); c.engine = { boreMm: high ? 100 : 70, strokeMm: high ? 105 : 60, rodMm: high ? 110 : 170, flywheelKgM2: high ? 0.04 : 1, throttleLagS: lag };
    c.vehicle.massKg = high ? 400 : 3000; c.vehicle.wheelRadiusM = high ? 0.2 : 0.45; c.vehicle.finalDrive = high ? 5 : 2; c.vehicle.gears = high ? [5, 5, 5, 5, 5] : [0.5, 0.5, 0.5, 0.5, 0.5];
    c.cooling = { ambientC: high ? 45 : -10, coolantL: high ? 2 : 20, specificHeatKjKgK: high ? 2 : 4.2, engineCapacityKjK: high ? 40 : 250, flowLMin: flow, radiatorWPerK: high ? 650 : 0, fan: high ? 3 : 0, roadAir: true, heatMode: 'manual', manualHeatKw: 100 };
    const sim = new Simulation(c); sim.start(); sim.setControls({ throttle: 1, gear: 1, clutch: 0.5, dynoEnabled: true, dynoNm: 200 });
    for (let i = 0; i < 20000; i++) { if (i === 10000) sim.setControls({ clutch: 1, brake: 1 }); sim.step(); if (i % 100 === 0) finite(sim.state); }
    assert.ok(Math.abs(sim.state.energyResidualJ) < 0.001);
  }
});
test('malformed configurations and NaN controls are rejected without poisoning the state', () => {
  const c = copyConfig(); c.engine.flywheelKgM2 = NaN; assert.throws(() => validateConfig(c));
  const sim = new Simulation(); assert.throws(() => sim.setControls({ throttle: NaN })); assert.throws(() => sim.step(1));
  assert.throws(() => sim.setCooling({ coolantL: 15 })); finite(sim.state);
});
