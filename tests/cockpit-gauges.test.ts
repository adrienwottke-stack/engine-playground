import test from 'node:test';
import assert from 'node:assert/strict';
import { COCKPIT_RPM_LIMIT, COCKPIT_SCALES, cockpitNeedleAngle, cockpitReading, cockpitScaleTicks } from '../src/cockpit-gauges';

test('tachometer uses an accurate 270 degree sweep and enters its red zone at 6500 rpm', () => {
  const scale = COCKPIT_SCALES.rpm;
  assert.equal(cockpitNeedleAngle(0, scale), 135);
  assert.equal(cockpitNeedleAngle(3500, scale), 270);
  assert.equal(cockpitNeedleAngle(7000, scale), 405);
  assert.equal(cockpitNeedleAngle(COCKPIT_RPM_LIMIT, scale), 135 + 6500 / 7000 * 270);
  assert.equal(cockpitReading('rpm', 6499).warning, false);
  assert.equal(cockpitReading('rpm', 6500).warning, true);
  const ticks = cockpitScaleTicks(scale);
  assert.equal(ticks.length, 71);
  assert.deepEqual(ticks.filter(tick => tick.labelled).map(tick => tick.value), [0,1000,2000,3000,4000,5000,6000,7000]);
  assert.equal(ticks.find(tick => tick.value === 6500)?.major, true);
});

test('speedometer uses km/h telemetry independently of engine RPM', () => {
  const scale = COCKPIT_SCALES.speedKmh;
  assert.equal(cockpitNeedleAngle(0, scale), 135);
  assert.equal(cockpitNeedleAngle(130, scale), 270);
  assert.equal(cockpitNeedleAngle(260, scale), 405);
  const speed = cockpitReading('speedKmh', 82.25);
  assert.equal(speed.value, 82.25);
  assert.equal(speed.display, '82');
  assert.equal(speed.range, 'within');
  assert.equal(speed.warning, false);
  assert.deepEqual(cockpitScaleTicks(scale).filter(tick => tick.labelled).map(tick => tick.value), Array.from({ length: 14 }, (_, i) => i * 20));
});

test('missing or invalid telemetry never invents a zero or a moving needle', () => {
  for (const raw of [undefined, null, NaN, Infinity, -Infinity, '6500']) {
    const reading = cockpitReading('rpm', raw);
    assert.equal(reading.available, false);
    assert.equal(reading.value, null);
    assert.equal(reading.angle, null);
    assert.equal(reading.display, '—');
    assert.equal(reading.range, 'missing');
  }
  assert.equal(cockpitReading('rpm', 0).available, true);
  assert.equal(cockpitReading('rpm', 0).display, '0');
});

test('only the graphical needle is limited; real out-of-range values remain visible', () => {
  const high = cockpitReading('rpm', 9200.5);
  assert.equal(high.value, 9200.5);
  assert.equal(high.display, '9.201');
  assert.equal(high.angle, 405);
  assert.equal(high.range, 'above');
  const low = cockpitReading('speedKmh', -14);
  assert.equal(low.value, -14);
  assert.equal(low.display, '-14');
  assert.equal(low.angle, 135);
  assert.equal(low.range, 'below');
  assert.equal(cockpitReading('speedKmh', 460).warning, false);
});
