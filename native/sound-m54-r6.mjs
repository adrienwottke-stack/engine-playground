// Local R6 listening candidate. No sample playback, added oscillator, or new buffer.
// Apply after referenceScript(), since the existing tuning matcher owns .5/1.0.
export const M54_R6_SOUND = Object.freeze({
  preset: 'm54', hfGain: .003, noise: .18, jitter: .12,
  convolution: 1, impulse: 'default_0', idleAssist: false,
});

export function balancedM54Exhaust(script) {
  if (!/name:\s*"BMW M54B30"/.test(script)) throw Error('M54B30 script required.');
  const banks = [0, 1].map(i => {
    const pattern = new RegExp(`(exhaust_system exhaust${i}\\(es_params, audio_volume: )([0-9.eE+-]+)(, impulse_response:)`);
    const match = script.match(pattern);
    if (!match || !Number.isFinite(+match[2]) || +match[2] <= 0) throw Error(`Missing positive exhaust${i} gain.`);
    return { pattern, gain: +match[2] };
  });
  // Preserve total gain, avoiding a louder-is-better A/B and preserving tuning scale.
  const commonGain = (banks[0].gain + banks[1].gain) / 2;
  return banks.reduce((text, { pattern }) => text.replace(pattern, `$1${commonGain}$3`), script);
}

export const M54_FIRING_ORDER = Object.freeze([1, 5, 3, 6, 2, 4]);
export function firingFrequency(rpm) { return rpm / 20; } // 6 firings / 2 revolutions
export function pulseBankSequence() { return M54_FIRING_ORDER.map(c => c <= 3 ? 0 : 1); }

// Ideal equal-spacing diagnostic only, not an engine sound generator.
export function idealPulseOrderAmplitude(order, gains = [.5, 1]) {
  const sequence = pulseBankSequence();
  let re = 0, im = 0;
  for (let i = 0; i < 6; i++) {
    const angle = -2 * Math.PI * order * (i * 120 / 360);
    re += gains[sequence[i]] * Math.cos(angle);
    im += gains[sequence[i]] * Math.sin(angle);
  }
  return Math.hypot(re, im) / 6;
}
