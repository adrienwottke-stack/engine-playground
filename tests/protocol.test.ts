import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, validateTelemetry, commandLine } from '../native/protocol.mjs';

const command = { active: true, throttle: 0.5, ignition: true, starter: false, gear: 2, clutch: 0.5, dyno: false, holdRpm: 3000, volume: 0.08, reset: false };
const telemetry = { schemaVersion: 1, source: 'engine-sim-original', timestampMs: 100000, sequence: 1, appliedSequence: 1, simTimeS: 1, rpm: 800, crankAngle: 1, throttle: 0.1, actualThrottle: 0.1, ignition: true, starter: false, gear: 0, clutch: 0, speedMs: 0, dynoEnabled: false, dynoTorqueNm: null, geometry: { cylinderCount: 6, boreMm: 84, strokeMm: 89.6, rodMm: 135 }, engineName: 'Protocol test fixture, not a real simulator' };
test('commands are bounded, allowlisted and serialize to exactly 12 numeric fields', () => {
  assert.equal(commandLine(command, 1, 100000, 0).trim().split(' ').length, 12);
  assert.throws(() => validateCommand({ ...command, throttle: 2 })); assert.throws(() => validateCommand({ ...command, gear: 1.5 }));
  assert.throws(() => validateCommand({ ...command, path: 'anything' })); assert.throws(() => validateCommand({ ...command, volume: NaN }));
});
test('inactive clients request ignition off, zero throttle, no starter and mute', () => {
  const value = validateCommand({ ...command, active: false });
  assert.equal(value.ignition, false); assert.equal(value.throttle, 0); assert.equal(value.volume, 0);
});
test('missing, stale, wrong-source and incomplete telemetry cannot claim a connection', () => {
  assert.throws(() => validateTelemetry(null, 100000)); assert.throws(() => validateTelemetry(telemetry, 102000));
  assert.throws(() => validateTelemetry({ ...telemetry, source: 'demo' }, 100000)); assert.throws(() => validateTelemetry({ ...telemetry, rpm: NaN }, 100000));
  assert.throws(() => validateTelemetry({ ...telemetry, geometry: { ...telemetry.geometry, cylinderCount: 8 } }, 100000));
});
test('unavailable native torque stays null; it is never a fabricated engine torque', () => {
  assert.equal(validateTelemetry(telemetry, 100000).dynoTorqueNm, null);
  assert.throws(() => validateTelemetry({ ...telemetry, dynoTorqueNm: 99 }, 100000));
  assert.equal(validateTelemetry({ ...telemetry, dynoEnabled: true, dynoTorqueNm: 99 }, 100000).dynoTorqueNm, 99);
});
