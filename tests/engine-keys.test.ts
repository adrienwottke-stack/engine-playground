import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineKeys, advanceVisualAngle, shiftGear } from '../src/engine-keys';
import { Simulation } from '../src/model';

test('A toggles once per press; S requests the starter independently of ignition', () => {
  const keys = new EngineKeys();
  assert.equal(keys.down('KeyA'), 'ignition'); assert.equal(keys.down('KeyA'), null);
  assert.equal(keys.starter, false); keys.up('KeyA'); assert.equal(keys.down('KeyA'), 'ignition');
  keys.down('KeyS'); assert.equal(keys.starter, true); keys.up('KeyS'); assert.equal(keys.starter, false);
});
test('Q/W/E/R hold 1/10/20/100 percent and return to zero on release', () => {
  const keys = new EngineKeys();
  for (const [code, value] of [['KeyQ',.01],['KeyW',.1],['KeyE',.2],['KeyR',1]] as const) {
    keys.down(code); assert.equal(keys.throttle,value); keys.up(code); assert.equal(keys.throttle,0);
  }
  keys.down('KeyE'); keys.down('KeyR'); assert.equal(keys.throttle,1);
  keys.up('KeyR'); assert.equal(keys.throttle,.2); keys.up('KeyE'); assert.equal(keys.throttle,0);
});
test('loss of focus clears all held requests, including a repeated ignition key', () => {
  const keys = new EngineKeys(); keys.down('KeyA'); keys.down('KeyS'); keys.down('KeyR');
  keys.release(); assert.equal(keys.starter,false); assert.equal(keys.throttle,0);
  assert.equal(keys.down('KeyA'),'ignition');
});
test('arrows shift once until released, with or without Shift', () => {
  const keys = new EngineKeys();
  assert.equal(keys.down('ArrowUp', true), 'gear-up');
  assert.equal(keys.down('ArrowUp', true), null);
  assert.equal(keys.down('ShiftLeft'), 'clutch');
  assert.equal(keys.up('ShiftLeft'), true);
  assert.equal(keys.down('ArrowUp', false), null);
  assert.equal(keys.up('ArrowUp'), false);
  assert.equal(keys.down('ArrowDown', true), 'gear-down');
  assert.equal(keys.down('ArrowDown', true), null);
  keys.up('ArrowDown');
  assert.equal(keys.down('ArrowDown', true), 'gear-down');
});
test('both Shift keys hold the clutch open until the final one is released', () => {
  const keys = new EngineKeys();
  assert.equal(keys.clutchHeld, false);
  assert.equal(keys.down('ShiftLeft'), 'clutch'); assert.equal(keys.clutchHeld, true);
  assert.equal(keys.down('ShiftLeft'), null);
  assert.equal(keys.down('ShiftRight'), 'clutch'); assert.equal(keys.clutchHeld, true);
  assert.equal(keys.up('ShiftLeft'), true); assert.equal(keys.clutchHeld, true);
  assert.equal(keys.up('ShiftRight'), true); assert.equal(keys.clutchHeld, false);
});
test('pressing or releasing Shift while an arrow repeats does not shift again', () => {
  const keys = new EngineKeys();
  assert.equal(keys.down('ArrowUp'), 'gear-up');
  keys.down('ShiftLeft');
  assert.equal(keys.down('ArrowUp', true), null);
  keys.up('ShiftLeft');
  assert.equal(keys.down('ArrowUp'), null);
  keys.up('ArrowUp'); assert.equal(keys.down('ArrowUp'), 'gear-up');
});
test('shifting and releasing its modifiers leave held throttle and starter intact', () => {
  const keys = new EngineKeys(); keys.down('KeyR'); keys.down('KeyS'); keys.down('ShiftRight');
  assert.equal(keys.down('ArrowUp', true), 'gear-up');
  assert.equal(keys.up('ArrowUp'), false); assert.equal(keys.up('ShiftRight'), true);
  assert.equal(keys.throttle, 1); assert.equal(keys.starter, true);
  keys.release();
  assert.equal(keys.throttle, 0); assert.equal(keys.starter, false);
  assert.equal(keys.down('ArrowUp', true), 'gear-up');
});
test('loss of focus also clears a held clutch and rearms the shift keys', () => {
  const keys = new EngineKeys(); keys.down('ShiftLeft'); keys.down('ShiftRight'); keys.down('ArrowDown');
  assert.equal(keys.release(), true); assert.equal(keys.clutchHeld, false);
  assert.equal(keys.down('ArrowDown'), 'gear-down');
  assert.equal(keys.release(), false);
});
test('gear shifts include neutral and stop at the transmission boundaries', () => {
  let gear = 0;
  for (let i = 0; i < 7; i++) gear = shiftGear(gear, 'gear-up');
  assert.equal(gear, 5);
  assert.equal(shiftGear(0, 'gear-up'), 1);
  assert.equal(shiftGear(1, 'gear-down'), 0);
  for (let i = 0; i < 7; i++) gear = shiftGear(gear, 'gear-down');
  assert.equal(gear, 0);
});
test('4200 RPM advances between 10-Hz telemetry updates instead of freezing', () => {
  const omega = 4200 * Math.PI * 2 / 60;
  const first = advanceVisualAngle(0,omega,1/60,false);
  const second = advanceVisualAngle(first,omega,1/60,false);
  assert.ok(Math.abs(first-Math.PI*7/3) < 1e-10);
  assert.ok(Math.abs(first-second) > .1);
  assert.ok(Math.abs(advanceVisualAngle(0,omega,1/60,true)-Math.PI/30) < 1e-10);
});
test('demo ignition does not automatically crank; held starter can crank with ignition off', () => {
  const sim = new Simulation(); sim.setIgnition(true); for(let i=0;i<100;i++)sim.step();
  assert.equal(sim.state.rpm,0); sim.setIgnition(false); sim.setStarter(true);
  for(let i=0;i<100;i++)sim.step(); assert.ok(sim.state.rpm>0); assert.equal(sim.state.ignition,false);
  sim.setStarter(false); sim.step(); assert.equal(sim.state.starter,false);
});
