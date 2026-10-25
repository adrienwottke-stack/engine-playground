import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_TUNING, TUNING_PRESETS, applyM52Tuning, tuningKey, tuningFromKey, tuningParameters, validateTuning } from '../native/tuning-settings.mjs';
import { DEFAULT_SOUND, referenceScript } from '../native/reference-settings.mjs';
// @ts-expect-error The native server runtime is intentionally untyped JavaScript.
import { PhysicalCore } from '../native/core-runtime.mjs';
import { previewTuningCurve, torquePowerKw, validateMeasuredComparison } from '../src/tuning-model';
import { copyConfig } from '../src/model';

const original = readFileSync(new URL('../native/headless/assets/engines/bmw/M52B28.mr', import.meta.url), 'utf8');

test('parts selection defaults to series and rejects arbitrary script input, arrays and unknown keys', () => {
  assert.deepEqual(validateTuning(), DEFAULT_TUNING);
  assert.deepEqual(validateTuning({ camshaft: 'sport' }), { ...DEFAULT_TUNING, camshaft: 'sport' });
  for (const raw of [null, false, [], 'sport', { camshaft: 'bad) set_engine()' }, { flywheel: -1 }, { intake: true }, { response: 'turbo' }, { preset: 'sport' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => validateTuning(raw));
  const choice = validateTuning(TUNING_PRESETS.sport); choice.camshaft = 'standard';
  assert.equal(TUNING_PRESETS.sport.camshaft, 'sport', 'callers do not mutate shared presets');
  assert.notEqual(tuningKey(TUNING_PRESETS.standard), tuningKey(TUNING_PRESETS.comfort));
  assert.notEqual(tuningKey(TUNING_PRESETS.comfort), tuningKey(TUNING_PRESETS.sport));
});

test('confirmed tuning keys decode exactly five validated fields without filling missing parts', () => {
  for (const camshaft of ['standard', 'sport']) for (const flywheel of ['standard', 'light']) for (const intake of ['standard', 'sport']) for (const exhaust of ['standard', 'sport']) for (const response of ['standard', 'comfort', 'sport']) {
    const selection = validateTuning({ camshaft, flywheel, intake, exhaust, response });
    assert.deepEqual(tuningFromKey(tuningKey(selection)), selection);
  }
  for (const key of [undefined, null, 0, [], {}, '', 'standard', 'standard:standard:standard:standard', `${tuningKey()}:standard`, 'standard:standard:standard:standard:', ':standard:standard:standard:standard', 'sport:light:sport:sport:unknown', 'sport:light:sport:sport: sport', 'sport:light:sport:sport:main()']) assert.throws(() => tuningFromKey(key));
});

test('return to series preserves every original engine byte and existing reference host wrapper', () => {
  assert.equal(applyM52Tuning(original), original);
  assert.equal(applyM52Tuning(original, TUNING_PRESETS.standard), original);
  assert.equal(referenceScript(original, {...DEFAULT_SOUND, preset: 'm52'}, [84, 84, 135], DEFAULT_TUNING), referenceScript(original, {...DEFAULT_SOUND, preset: 'm52'}, [84, 84, 135]));
  assert.ok(referenceScript(original, {...DEFAULT_SOUND, preset: 'm52'}, [84, 84, 135]).startsWith(original));
});

test('sport cams change the active intake and exhaust profiles while preserving firing order and unused lobe', () => {
  const script = applyM52Tuning(original, { ...DEFAULT_TUNING, camshaft: 'sport' });
  assert.match(script, /node m52b28_lobe_profile_int\s*\{[\s\S]*?duration_at_50_thou: 224 \* units.deg,[\s\S]*?lift: 9.8 \* units.mm/);
  assert.match(script, /node m52b28_lobe_profile_exh\s*\{[\s\S]*?duration_at_50_thou: 220 \* units.deg,[\s\S]*?lift: 9.5 \* units.mm/);
  assert.match(script, /lobe_profile: m52b28_lobe_profile_int\(\)/);
  assert.match(script, /ex_lobe_profile: m52b28_lobe_profile_exh\(\)/);
  assert.match(script, /harmonic_cam_lobe lobe\([\s\S]*?duration_at_50_thou: 256/);
  const firing = (source: string) => [...source.matchAll(/connect_wire\([^\n]+/g)].map(match => match[0]);
  assert.deepEqual(firing(script), firing(original));
  assert.throws(() => applyM52Tuning(original.replace('duration_at_50_thou: 210', 'duration_at_50_thou: 211'), { ...DEFAULT_TUNING, camshaft: 'sport' }), /Motorskript/);
});

test('light flywheel reduces the native script inertia by only its assumed disk mass share', () => {
  const series = tuningParameters(DEFAULT_TUNING,'m52'), light = tuningParameters({ ...DEFAULT_TUNING, flywheel: 'light' },'m52');
  const expectedReduction = .5 * (5.9 - 4.2) * .15 ** 2;
  assert.ok(Math.abs(series.crankInertiaKgM2 - light.crankInertiaKgM2 - expectedReduction) < 1e-12);
  assert.ok(light.crankInertiaKgM2 > 0 && light.crankInertiaKgM2 < series.crankInertiaKgM2);
  const script = applyM52Tuning(original, { ...DEFAULT_TUNING, flywheel: 'light' });
  assert.match(script, /flywheel_mass: 4.2 \* units.kg/);
  assert.ok(script.includes(`moment_of_inertia: ${light.crankInertiaKgM2}`));
  // Same torque acts through alpha=T/J: lower inertia shortens the ideal
  // acceleration interval without adding work or changing stationary power.
  const accelerate = (inertia: number) => inertia * (6000 - 1000) * (Math.PI / 30) / 100;
  assert.ok(accelerate(light.crankInertiaKgM2) < accelerate(series.crankInertiaKgM2));
  assert.deepEqual(previewTuningCurve({ ...DEFAULT_TUNING, flywheel: 'light' }), previewTuningCurve());
});

test('intake, exhaust and comfort pedal change real physical script inputs without replacing audio samples', () => {
  const script = applyM52Tuning(original, TUNING_PRESETS.sport);
  for (const parameter of ['carburetor_cfm: 575', 'outlet_flow_rate: k_carb(1150)', 'primary_flow_rate: k_carb(230)', 'primary_tube_length: 24 * units.inch', 'throttle_gamma: 1.45']) assert.ok(script.includes(parameter), parameter);
  assert.equal((script.match(/impulse_response: ir_lib.default_0/g) ?? []).length, 2);
  const comfort = applyM52Tuning(original, TUNING_PRESETS.comfort);
  assert.match(comfort, /throttle_gamma: 2.7/);
  assert.match(comfort, /flywheel_mass: 5.9/);
  const opening = (pedal: number, gamma: number) => pedal ** gamma;
  assert.ok(opening(.5, tuningParameters(TUNING_PRESETS.comfort).throttleGamma) < opening(.5, tuningParameters().throttleGamma));
  assert.ok(opening(.5, tuningParameters(TUNING_PRESETS.sport).throttleGamma) > opening(.5, tuningParameters().throttleGamma));
  assert.deepEqual(previewTuningCurve(TUNING_PRESETS.comfort), previewTuningCurve(), 'pedal mapping does not add stationary full-load power');
  assert.throws(() => referenceScript(original, { ...DEFAULT_SOUND, preset: 'i6' }, [84, 84, 135], TUNING_PRESETS.sport), /M52B28/);
});

test('power units are mechanical kW and both series and tuned previews remain finite with no flywheel gain', () => {
  assert.ok(Math.abs(torquePowerKw(100, 6000) - 62.83185307179586) < 1e-10);
  const series = previewTuningCurve(), sport = previewTuningCurve(TUNING_PRESETS.sport);
  for (const point of [...series, ...sport]) {
    assert.ok(Number.isFinite(point.torqueNm) && point.torqueNm > 0 && point.torqueNm < 500);
    assert.ok(Math.abs(point.powerKw - torquePowerKw(point.torqueNm, point.rpm)) < 1e-12);
  }
  assert.equal(series[0].rpm, 1000); assert.equal(series.at(-1)!.rpm, 6500);
  assert.ok(sport[0].torqueNm < series[0].torqueNm, 'preview explicitly models low RPM cam tradeoff');
  assert.ok(sport.at(-1)!.torqueNm > series.at(-1)!.torqueNm, 'preview places more of the filling change at high RPM');
  assert.deepEqual(previewTuningCurve({ ...TUNING_PRESETS.sport, flywheel: 'standard', response: 'standard' }), sport);
});

test('recorded curve callback rejects wrong power units, unsorted data and missing provenance', () => {
  const curve = previewTuningCurve();
  const measurement = { selection: validateTuning(), baseline: curve, selected: curve, sourceLabel: 'Native steady-state sweep, example fixture' };
  assert.deepEqual(validateMeasuredComparison(measurement), measurement);
  assert.throws(() => validateMeasuredComparison({ ...measurement, sourceLabel: '' }), /Herkunft/);
  assert.throws(() => validateMeasuredComparison({ ...measurement, baseline: [...curve].reverse() }), /Werte|Einheiten/);
  assert.throws(() => validateMeasuredComparison({ ...measurement, selected: curve.map(row => ({ ...row, powerKw: row.powerKw * 1.35962 })) }), /Werte|Einheiten/);
  assert.throws(() => validateMeasuredComparison({ ...measurement, selected: curve.slice(0, 2) }), /unvollständig/);
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'engine-tuning-'));
  const sourceDirectory = join(directory, 'assets/engines/bmw'); mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, 'M52B28.mr'), original);
  const assetsDirectory = join(directory, 'runtime'); mkdirSync(assetsDirectory);
  const writes: string[] = [], core: any = Object.create(PhysicalCore.prototype);
  Object.assign(core, {
    directory, assetsDirectory, buffer: Buffer.alloc(0), sequence: 100, resetId: 0, geometry: [84, 84, 135],
    tuning: validateTuning(), sound: { ...DEFAULT_SOUND, preset: 'm52' },
    scriptKey: JSON.stringify(['m52', 'default_0', tuningKey(DEFAULT_TUNING)]),
    bootTuning: { key: tuningKey(DEFAULT_TUNING), scriptKey: JSON.stringify(['m52', 'default_0', tuningKey(DEFAULT_TUNING)]) },
    confirmedTuningKey: null, confirmedTuningSequence: null, confirmedScriptKey: null, pendingTuning: null,
    clients: new Set(), stateClients: new Set(), state: null, reason: '', start() {},
    child: { stdin: { writable: true, write: (data: string) => writes.push(data) } },
  });
  const config = copyConfig(); config.sound.preset = 'm52';
  const command = { config, active: true, ignition: false, starter: false, reset: false, controls: { throttle: 0, gear: 0, clutch: 0, dynoEnabled: false, dynoNm: 40, brake: 0 } };
  return { core, command, writes, close: () => rmSync(directory, { recursive: true, force: true }) };
}

function telemetry(sequence: number, ageMs = 0) {
  const state: any = { source: 'ange-physical', schemaVersion: 2, timestampMs: Date.now() - ageMs, sequence, cylinders: Array.from({ length: 6 }, () => ({ pressureKpa: 100, gasTemperatureK: 300, intakeLiftMm: 0, exhaustLiftMm: 0, fuelFraction: 0 })) };
  for (const key of ['t', 'rpm', 'omega', 'crankAngle', 'actualThrottle', 'speedKmh', 'wheelRpm', 'totalRatio', 'torqueNm', 'powerKw', 'wheelTorqueNm', 'slipRpm', 'clutchHeatKw', 'estimatedHeatKw', 'manifoldKpa']) state[key] = 0;
  const body = Buffer.from(JSON.stringify(state)), header = Buffer.alloc(8); header.writeUInt32LE(1); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('initial series selection is confirmed only after fresh valid native telemetry, without an initial browser command', async () => {
  const f = fixture();
  try {
    assert.equal(f.core.snapshot().tuningKey, null);
    assert.equal(f.core.confirmedTuningKey, null);
    f.core.parse(telemetry(0, 2500));
    assert.equal(f.core.confirmedTuningKey, null, 'stale telemetry cannot confirm the initial script');
    const invalid = telemetry(0), body = Buffer.from(invalid.subarray(8).toString('utf8').replace('"rpm":0', '"rpm":null'));
    const header = Buffer.alloc(8); header.writeUInt32LE(1); header.writeUInt32LE(body.length, 4);
    f.core.parse(Buffer.concat([header, body]));
    assert.equal(f.core.confirmedTuningKey, null, 'invalid telemetry cannot confirm the initial script');
    f.core.parse(telemetry(0));
    assert.equal(f.core.snapshot().tuningKey, tuningKey(DEFAULT_TUNING));
    assert.equal(f.core.snapshot().tuningSequence, 0);
    assert.equal(f.writes.length, 0);
    f.command.config.tuning = validateTuning(TUNING_PRESETS.sport);
    const sport = await f.core.command(f.command);
    f.core.parse(telemetry(sport.sequence - 1));
    assert.equal(f.core.snapshot().tuningKey, tuningKey(DEFAULT_TUNING), 'an unconfirmed reload keeps the last confirmed series selection');
    f.core.parse(telemetry(sport.sequence));
    assert.equal(f.core.snapshot().tuningKey, tuningKey(TUNING_PRESETS.sport));
  } finally { f.close(); }
});

test('queued tuning stays unconfirmed until the matching fresh native sequence, and retries do not move the goalpost', async () => {
  const f = fixture();
  try {
    const first = await f.core.command(f.command);
    assert.equal(first.accepted, true); assert.equal(first.tuningKey, tuningKey(DEFAULT_TUNING));
    assert.equal(f.core.snapshot().tuningKey, null);
    f.core.parse(telemetry(first.sequence - 1)); assert.equal(f.core.snapshot().tuningKey, null);
    f.core.parse(telemetry(first.sequence, 2500)); assert.equal(f.core.snapshot().tuningKey, null);
    const second = await f.core.command(f.command);
    f.core.parse(telemetry(first.sequence));
    assert.equal(f.core.snapshot().tuningKey, tuningKey(DEFAULT_TUNING));
    assert.equal(f.core.snapshot().tuningSequence, first.sequence);
    f.core.parse(telemetry(second.sequence)); assert.equal(f.core.snapshot().tuningSequence, second.sequence);
    f.command.config.tuning = validateTuning(TUNING_PRESETS.sport);
    const sport = await f.core.command(f.command);
    assert.equal(f.core.snapshot().tuningKey, tuningKey(DEFAULT_TUNING), 'HTTP acceptance alone is no successful install');
    assert.equal(f.core.snapshot().tuningSequence, null, 'an old confirmed key cannot confirm a pending reload or rollback');
    assert.equal(f.core.resetId, 1);
    assert.match(readFileSync(join(f.core.assetsDirectory, 'runtime_i6.mr'), 'utf8'), /lift: 9.8 \* units.mm/);
    f.core.parse(telemetry(sport.sequence)); assert.equal(f.core.snapshot().tuningKey, tuningKey(TUNING_PRESETS.sport));
    const repeat = await f.core.command(f.command); assert.equal(f.core.resetId, 1, 'normal controls do not reload the script');
    f.core.parse(telemetry(repeat.sequence)); assert.equal(f.core.snapshot().tuningSequence, repeat.sequence);
    f.command.config.tuning = validateTuning(); const series = await f.core.command(f.command);
    assert.equal(f.core.snapshot().tuningSequence, null, 'series rollback waits for its own native acknowledgement');
    assert.equal(f.core.resetId, 2); assert.ok(readFileSync(join(f.core.assetsDirectory, 'runtime_i6.mr'), 'utf8').startsWith(original));
    f.core.parse(telemetry(series.sequence)); assert.equal(f.core.snapshot().tuningKey, tuningKey(DEFAULT_TUNING));
  } finally { f.close(); }
});

test('tuning refuses installation with ignition, starter, throttle or closed clutch', async () => {
  for (const patch of [{ ignition: true }, { starter: true }, { throttle: .1 }, { clutch: 1 }]) {
    const f = fixture();
    try {
      f.command.config.tuning = validateTuning(TUNING_PRESETS.sport);
      if ('ignition' in patch) f.command.ignition = patch.ignition!;
      if ('starter' in patch) f.command.starter = patch.starter!;
      if ('throttle' in patch) f.command.controls.throttle = patch.throttle!;
      if ('clutch' in patch) f.command.controls.clutch = patch.clutch!;
      await assert.rejects(() => f.core.command(f.command), /Motor stoppen/);
      assert.equal(f.writes.length, 0); assert.equal(f.core.resetId, 0);
    } finally { f.close(); }
  }
});
