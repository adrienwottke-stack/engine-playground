import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SOUND,referenceScript} from '../native/reference-settings.mjs';
import {applyM54Tuning,TUNING_PRESETS,tuningParameters} from '../native/tuning-settings.mjs';
import {copyConfig,displacementL} from '../src/model';

const base=readFileSync(new URL('../native/headless/assets/engines/bmw/M54B30.mr',import.meta.url),'utf8');
test('M54 series has its own physical geometry, compression and short6500rpm limiter',()=>{
  assert.equal(DEFAULT_SOUND.preset,'m54');
  const cfg=copyConfig();assert.ok(Math.abs(displacementL(cfg)-2.979255)<1e-6);
  assert.match(base,/name: "BMW M54B30"/);
  assert.match(base,/throw: 89\.6 \* units.mm \/ 2/);
  assert.match(base,/deck_height: \(89\.6 \/ 2 \+ 135\.0 \+ 31\.82\)/);
  const chamber=Number(base.match(/input chamber_volume: ([\d.]+)/)![1]);
  const swept=Math.PI/4*84**2*89.6/1000;
  assert.ok(Math.abs(1+swept/chamber-10.2)<1e-10);
  assert.equal([...base.matchAll(/rev_limit: (\d+) \* units.rpm/g)].length,2);
  for(const limit of base.matchAll(/rev_limit: (\d+) \* units.rpm/g))assert.equal(Number(limit[1]),6500);
  assert.match(base,/limiter_duration: 0\.028 \* units.sec/);
  const host=referenceScript(base,DEFAULT_SOUND,[84,89.6,135]);
  assert.ok(host.startsWith(base));assert.match(host,/set_engine\(M54B30\(\)\)/);
});
test('M54 tuning changes the M54 lobes and keeps engine identity and limiter',()=>{
  assert.equal(applyM54Tuning(base),base);
  const sport=applyM54Tuning(base,TUNING_PRESETS.sport);
  assert.match(sport,/node m54b30_lobe_profile_int[\s\S]*?lift: 10.4 \* units.mm/);
  assert.match(sport,/node m54b30_lobe_profile_exh[\s\S]*?lift: 9.5 \* units.mm/);
  assert.match(sport,/limiter_duration: 0.028/);assert.match(sport,/rev_limit: 6500/);
  assert.equal(tuningParameters().intakeLiftMm,9.7);
  assert.equal(tuningParameters(TUNING_PRESETS.sport).intakeLiftMm,10.4);
  assert.ok(referenceScript(base,DEFAULT_SOUND,[84,89.6,135],TUNING_PRESETS.sport).startsWith(sport));
  assert.throws(()=>applyM54Tuning(base.replace('lift: 9.7','lift: 9.6'),TUNING_PRESETS.sport),/Motorskript/);
});
