import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineDrivePhase, type EngineDrivePhaseInput } from '../src/engine-drive-phase';

const PERIOD = Math.PI * 4, OMEGA = 8000 * Math.PI * 2 / 60;
const phase = (angle: number) => ((angle % PERIOD) + PERIOD) % PERIOD;
const near = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
const input = (angle: number, patch: Partial<EngineDrivePhaseInput> = {}): EngineDrivePhaseInput => ({ phase: phase(angle), omega: OMEGA, elapsed: 1 / 60, slow: false, active: true, ...patch });

test('first observation anchors the displayed phase without inventing prior turns', () => {
  const drive = new EngineDrivePhase();
  near(drive.update(input(10, { elapsed: 1, native: { time: 100, extrapolation: 0 } })), 10);
  near(drive.value, 10);
});

test('native 8000 rpm at 15 fps resolves multiple turns from native time rather than clamped frame dt', () => {
  const drive = new EngineDrivePhase(), start = 2.4, frame = 1 / 15;
  drive.update(input(start, { native: { time: 10, extrapolation: 0 } }));
  for (let index = 1; index <= 30; index++) {
    const expected = start + OMEGA * frame * index;
    // main's elapsed is already capped at .05; native source time still spans
    // the complete 1/15-second interval (nearly nine crank turns at 8000 rpm).
    const result = drive.update(input(expected, { elapsed: .05, native: { time: 10 + frame * index, extrapolation: 0 } }));
    near(result, expected); near(phase(result), phase(expected));
  }
  assert.ok(drive.value > PERIOD * 100);
});

test('fractional 35/24 pulley orientation remains continuous across 720-degree phase wraps', () => {
  const drive = new EngineDrivePhase(), ratio = 35 / 24, start = PERIOD - .1;
  let previous = drive.update(input(start, { native: { time: 0, extrapolation: 0 } })) * ratio;
  for (let index = 1; index <= 20; index++) {
    const actual = start + OMEGA * .01 * index;
    const rotation = drive.update(input(actual, { native: { time: index * .01, extrapolation: 0 } })) * ratio;
    near(rotation - previous, OMEGA * .01 * ratio);
    near(rotation, actual * ratio); previous = rotation;
  }
});

test('an unchanged native sample stops advancing when its existing extrapolation reaches the 100 ms cap', () => {
  const drive = new EngineDrivePhase();
  drive.update(input(1, { native: { time: 5, extrapolation: 0 } }));
  near(drive.update(input(1 + OMEGA * .05, { native: { time: 5, extrapolation: OMEGA * .05 } })), 1 + OMEGA * .05);
  const capped = drive.update(input(1 + OMEGA * .1, { native: { time: 5, extrapolation: OMEGA * .1 } }));
  near(capped, 1 + OMEGA * .1);
  for (let index = 0; index < 60; index++) near(drive.update(input(1 + OMEGA * .1, { elapsed: .05, native: { time: 5, extrapolation: OMEGA * .1 } })), capped);
});

test('native sample replacement removes old extrapolation before adding the new sample travel', () => {
  const drive = new EngineDrivePhase(), initial = 2;
  drive.update(input(initial, { native: { time: 0, extrapolation: 0 } }));
  drive.update(input(initial + OMEGA * .1, { native: { time: 0, extrapolation: OMEGA * .1 } }));
  const nativeTravel = OMEGA * .12, newExtra = OMEGA * .015;
  near(drive.update(input(initial + nativeTravel + newExtra, { native: { time: .12, extrapolation: newExtra } })), initial + nativeTravel + newExtra);
});

test('changing native speed uses the mean sample omega instead of guessing turns from the final speed', () => {
  const drive = new EngineDrivePhase(), initial = 1, oldOmega = 200, newOmega = 1000;
  drive.update(input(initial, { omega: oldOmega, native: { time: 2, extrapolation: 0 } }));
  const nativeTravel = (oldOmega + newOmega) / 2 * .04;
  near(drive.update(input(initial + nativeTravel + 1.5, { omega: newOmega, native: { time: 2.04, extrapolation: 1.5 } })), initial + nativeTravel + 1.5);
  near(drive.update(input(initial + nativeTravel + 2.5, { omega: newOmega, native: { time: 2.04, extrapolation: 2.5 } })), initial + nativeTravel + 2.5);
});

test('integrated path matches the slow speed cap, negative omega and the exact existing dt cap', () => {
  const slowDrive = new EngineDrivePhase(), start = .1, slowStep = -Math.PI * 2 * .05;
  slowDrive.update(input(start, { omega: -OMEGA, slow: true }));
  for (let index = 1; index <= 10; index++) near(slowDrive.update(input(start + slowStep * index, { omega: -OMEGA, elapsed: 1, slow: true })), start + slowStep * index);
  assert.ok(slowDrive.value < 0);
  const normal = new EngineDrivePhase(); normal.update(input(0));
  near(normal.update(input(OMEGA * .05, { elapsed: .3 })), OMEGA * .05);
  near(normal.update(input(OMEGA * .05, { elapsed: -1 })), OMEGA * .05);
});

test('hold, resume and mode changes keep prior turns without catching up paused time', () => {
  const drive = new EngineDrivePhase(); drive.reset(100);
  drive.update(input(100, { native: { time: 1, extrapolation: 0 } }));
  drive.hold(); near(drive.value, 100);
  near(drive.update(input(500, { active: false, native: { time: 10, extrapolation: 0 } })), 100);
  near(drive.update(input(100.3, { elapsed: .5, native: { time: 20, extrapolation: 0 } })), 100.3);
  near(drive.update(input(100.5, { slow: true, elapsed: .5 })), 100.5, 1e-8);
  const slowStep = Math.PI * 2 / 60;
  near(drive.update(input(100.5 + slowStep, { slow: true })), 100.5 + slowStep);
  near(drive.update(input(100.7, { native: { time: 50, extrapolation: 0 } })), 100.7);
});

test('explicit reset and backwards native simulation time start a new reference', () => {
  const drive = new EngineDrivePhase(); near(drive.reset(100), 100);
  drive.update(input(100, { native: { time: 8, extrapolation: 0 } }));
  near(drive.update(input(.4, { native: { time: 0, extrapolation: 0 } })), .4);
  near(drive.update(input(.4 + OMEGA * .01, { native: { time: .01, extrapolation: 0 } })), .4 + OMEGA * .01);
  near(drive.reset(), 0);
  near(drive.update(input(.2, { native: { time: 100, extrapolation: 0 } })), .2);
});

test('a long native gap deliberately reanchors to the nearest phase rather than claiming lost turns', () => {
  const drive = new EngineDrivePhase(); drive.reset(500);
  drive.update(input(500, { native: { time: 1, extrapolation: 0 } }));
  near(drive.update(input(500.3, { native: { time: 2, extrapolation: 0 } })), 500.3);
  near(drive.update(input(500.3 + OMEGA * .01, { native: { time: 2.01, extrapolation: 0 } })), 500.3 + OMEGA * .01);
});

test('nonfinite values hold the last orientation and invalidate the predictor anchor', () => {
  for (const patch of [{ phase: NaN }, { omega: Infinity }, { elapsed: NaN }, { native: { time: NaN, extrapolation: 0 } }, { native: { time: 1, extrapolation: Infinity } }]) {
    const drive = new EngineDrivePhase(); drive.reset(40);
    drive.update(input(40, { native: { time: 1, extrapolation: 0 } }));
    near(drive.update(input(100, patch)), 40);
    near(drive.update(input(40.2, { native: { time: 20, extrapolation: 0 } })), 40.2);
    near(drive.reset(NaN), 40.2);
  }
});
