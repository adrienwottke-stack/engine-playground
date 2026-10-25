import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balancedM54Exhaust, firingFrequency, idealPulseOrderAmplitude, pulseBankSequence } from '../native/sound-m54-r6.mjs';
import { referenceScript, DEFAULT_SOUND } from '../native/reference-settings.mjs';
import { validateTuning } from '../native/tuning-settings.mjs';
const original = readFileSync(new URL('../native/headless/assets/engines/bmw/M54B30.mr', import.meta.url), 'utf8');

test('M54 firing alternates between OEM cylinder groups, 3 pulses per revolution', () => {
  assert.deepEqual(pulseBankSequence(), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual([700, 1000, 3000, 6000].map(firingFrequency), [35, 50, 150, 300]);
});
test('equal bank gain removes artificial 1.5 order in ideal pulses without losing order 3', () => {
  assert.ok(idealPulseOrderAmplitude(1.5) > .24);
  assert.ok(idealPulseOrderAmplitude(1.5, [.75, .75]) < 1e-14);
  assert.ok(Math.abs(idealPulseOrderAmplitude(3) - idealPulseOrderAmplitude(3, [.75, .75])) < 1e-14);
});
test('only two bank gains change; physics, firing and filtering remain byte-identical', () => {
  const after = balancedM54Exhaust(original);
  const normalize = s => s.replace(/audio_volume: [0-9.eE+-]+/g, 'audio_volume: GAIN');
  assert.equal(normalize(original), normalize(after));
  assert.equal((after.match(/audio_volume: 0.75,/g) || []).length, 2);
  assert.equal(balancedM54Exhaust(after), after);
});
test('balancing works after existing series and race tuning without changing total gain or IR', () => {
  for (const selection of [{}, { exhaust: 'race', catalyst: 'straight', muffler: 'race' }]) {
    const before = referenceScript(original, DEFAULT_SOUND, [84, 89.6, 135], validateTuning(selection));
    const after = balancedM54Exhaust(before);
    const gains = s => [...s.matchAll(/audio_volume: ([0-9.eE+-]+),/g)].map(m => +m[1]);
    const a = gains(before), b = gains(after);
    assert.equal(a.length, 2); assert.equal(b[0], b[1]);
    assert.ok(Math.abs(a[0] + a[1] - b[0] - b[1]) < 1e-12);
    assert.deepEqual(after.match(/impulse_response:[^\n]+/g), before.match(/impulse_response:[^\n]+/g));
  }
});
test('unrecognized/missing bank definitions fail instead of silently altering another engine', () => {
  assert.throws(() => balancedM54Exhaust(original.replace('BMW M54B30', 'BMW M52B28')));
  assert.throws(() => balancedM54Exhaust(original.replace('exhaust0', 'removed0')));
});
