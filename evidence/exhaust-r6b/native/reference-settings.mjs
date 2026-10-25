// Presets use the MIT-licensed open engine scripts. The Community application is separate.
import { applyM52Tuning, applyM54Tuning, DEFAULT_TUNING, tuningKey, validateTuning } from './tuning-settings.mjs';
export const DEFAULT_SOUND = Object.freeze({preset:'m54',hfGain:.01,noise:1,jitter:.5,convolution:1,impulse:'default_0',idleAssist:false});
export const IMPULSES = Object.freeze(['default_0','sharp_0','mild_exhaust_0','mild_exhaust_0_reverb','minimal_muffling_01']);
export function validateSound(raw = DEFAULT_SOUND) {
  if (!raw || typeof raw !== 'object') throw new Error('Klangeinstellungen fehlen.');
  const s={...DEFAULT_SOUND,...raw};
  if (!['m52','m54','i6'].includes(s.preset)||!IMPULSES.includes(s.impulse)||typeof s.idleAssist!=='boolean') throw new Error('Ungültiges Motor- oder Klangpreset.');
  for (const [key,max] of [['hfGain',.03],['noise',1],['jitter',1],['convolution',1]]) if(typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<0||s[key]>max)throw new Error(`Ungültiger Klangwert: ${key}`);
  return s;
}
export function referenceScript(base, sound, geometry, tuning = DEFAULT_TUNING) {
  const s=validateSound(sound);
  const parts=validateTuning(tuning);
  if(s.preset==='i6' && tuningKey(parts)!==tuningKey(DEFAULT_TUNING))throw new Error('Diese Tuningteile gehören zum BMW M52B28 / M54B30.');
  let script=s.preset==='m54'?applyM54Tuning(base,parts):s.preset==='m52'?applyM52Tuning(base,parts):base;
  if(s.preset==='i6') script=script.replace('bore: 84 * units.mm',`bore: ${geometry[0]} * units.mm`).replace('throw: 89.6 * units.mm / 2',`throw: ${geometry[1]} * units.mm / 2`).replace('length: 135.0 * units.mm',`length: ${geometry[2]} * units.mm`).replace('deck_height: (89.6 / 2 + 135.0 + 31.82) * units.mm',`deck_height: (${geometry[1]} / 2 + ${geometry[2]} + 31.82) * units.mm`);
  // A common leveler largely cancels audio_volume changes. Mufflers therefore
  // select a native exhaust impulse response (filter of computed gas pulses),
  // preserving an explicitly selected sound filter and the unchanged series.
  const impulse=s.preset==='m54'&&s.impulse==='default_0'
    ?parts.muffler==='race'?'minimal_muffling_01':parts.catalyst==='straight'?'sharp_0':parts.muffler==='sport'?'mild_exhaust_0':'default_0'
    :s.impulse;
  script=script.replaceAll('impulse_response: ir_lib.default_0',`impulse_response: ir_lib.${impulse}`);
  if(s.preset!=='i6') script+=`\npublic node main {\n set_engine(${s.preset==='m54'?'M54B30':'M52B28'}())\n set_vehicle(vehicle(mass:1450*units.kg,drag_coefficient:0.3,cross_sectional_area:2.1666667*units.m2,diff_ratio:3.15,tire_radius:0.31*units.m,rolling_resistance:0.012*1450*9.81))\n set_transmission(transmission(max_clutch_torque:420*units.Nm).add_gear(4.2).add_gear(2.5).add_gear(1.65).add_gear(1.2).add_gear(1.0))\n}\n`;
  return script;
}
