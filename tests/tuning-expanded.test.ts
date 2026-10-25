import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_TUNING,TUNING_CHOICES,validateTuning,tuningKey,tuningFromKey,tuningParameters,completeTuningSupport,tuningRequirements,applyM54Tuning} from '../native/tuning-settings.mjs';
import {TUNING_CATALOG,choosePart} from '../src/tuning-catalog';
import {previewTuningCurve,tuningTraits} from '../src/tuning-model';
import {DEFAULT_SOUND,referenceScript} from '../native/reference-settings.mjs';
const base=readFileSync(new URL('../native/headless/assets/engines/bmw/M54B30.mr',import.meta.url),'utf8');
test('every catalog option roundtrips without key collision, unsafe strings or missing fields',()=>{
 const keys=new Set<string>();let count=0;
 for(const slot of TUNING_CATALOG)for(const part of slot.options){
  assert.ok((TUNING_CHOICES[slot.key] as readonly string[]).includes(part.value));
  const choice=choosePart(DEFAULT_TUNING,slot.key,part.value),key=tuningKey(choice);
  assert.deepEqual(tuningFromKey(key),choice);
  if(part.value!==DEFAULT_TUNING[slot.key]){assert.ok(!keys.has(key));keys.add(key);count++;}
  const curve=previewTuningCurve(choice);assert.ok(curve.every(p=>Object.values(p).every(Number.isFinite)));
  assert.equal(curve.at(-1)!.rpm,tuningParameters(choice).redlineRpm);
 }
 assert.ok(count>=35);assert.equal(TUNING_CATALOG.length,23);
 const extended=tuningKey(choosePart(DEFAULT_TUNING,'head','ported'));assert.match(extended,/^v2:/);
 for(const key of [extended+':standard',extended.slice(0,extended.lastIndexOf(':')),'v3:'+extended.slice(3)])assert.throws(()=>tuningFromKey(key));
 assert.throws(()=>validateTuning({head:'race); main()'}));
});
test('racing cams require explicit support and then change both native limiter sites and redline',()=>{
 const racing=choosePart(DEFAULT_TUNING,'camshaft','race');assert.ok(tuningRequirements(racing).length>=4);
 assert.throws(()=>applyM54Tuning(base,racing),/Benötigt/);
 const supported=completeTuningSupport(racing),p=tuningParameters(supported),script=applyM54Tuning(base,supported);
 assert.equal(tuningRequirements(supported).length,0);assert.equal(p.redlineRpm,7600);
 assert.equal((script.match(/rev_limit: 7600 \* units.rpm/g)||[]).length,2);assert.match(script,/redline: 7600/);assert.match(script,/lift: 11.5/);
 const removeSupport={...supported,retainers:'standard'};assert.throws(()=>applyM54Tuning(base,removeSupport),/Titan/);
 const sport=completeTuningSupport({camshaft:'sport'});assert.equal(tuningParameters(sport).redlineRpm,6800);
 assert.equal(tuningParameters({camshaft:'sport'}).redlineRpm,6500);
});
test('every supported catalog option produces compilable-shaped native script and preserves firing order',()=>{
 const firing=(s:string)=>[...s.matchAll(/connect_wire\([^\n]+/g)].map(m=>m[0]);
 for(const slot of TUNING_CATALOG)for(const part of slot.options){
  const choice=completeTuningSupport(choosePart(DEFAULT_TUNING,slot.key,part.value));
  const script=applyM54Tuning(base,choice);assert.deepEqual(firing(script),firing(base));
  assert.doesNotMatch(script,/NaN|undefined|Infinity/);assert.match(script,/name: "BMW M54B30"/);
 }
 assert.equal(applyM54Tuning(base),base);
});
test('separate ITB volumes, head flows, compression, phases, fuel and masses reach native parameters',()=>{
 const t=validateTuning({throttleBody:'itb',runners:'short',head:'race',seats:'multiangle',valves:'large',pistons:'race',rods:'light',ignition:'race',mixture:'power',camTiming:'topend',idle:'raised',muffler:'race'});
 const script=applyM54Tuning(base,t),p=tuningParameters(t);
 assert.equal((script.match(/intake intake\d\(/g)||[]).length,6);
 for(let i=0;i<6;i++)assert.ok(script.includes(`intake: intake${i},`));
 for(const token of ['runner_length: 3.5','molecular_afr: 13.3','idle_throttle_plate_position: 0.992','mass: 250 * units.g','mass: 260 * units.g','input intake_lobe_center: 116','add_sample(6000 * units.rpm, 34'])assert.ok(script.includes(token),token);
 assert.ok(p.headFlowScale>1.2);assert.ok(Math.abs(1+(Math.PI/4*84**2*89.6/1000)/p.chamberCc-12)<1e-9);
});
test('flywheels and rods change reaction without inventing stationary power; tradeoffs are explicit',()=>{
 for(const flywheel of ['light','ultralight']){
  assert.deepEqual(previewTuningCurve({flywheel}),previewTuningCurve());
  assert.ok(tuningTraits({flywheel}).response>tuningTraits().response);
  assert.ok(tuningTraits({flywheel}).comfort<tuningTraits().comfort);
 }
 assert.deepEqual(previewTuningCurve({rods:'light'}),previewTuningCurve());
 const race=tuningTraits(completeTuningSupport({camshaft:'race'}));assert.ok(race.highRpm>tuningTraits().highRpm);assert.ok(race.comfort<tuningTraits().comfort);
});

test('response parts reach native inertia, linkage and per-cylinder volume, without free stationary power',()=>{
 const series=tuningParameters(),light=tuningParameters({flywheel:'light'}),ultralight=tuningParameters({flywheel:'ultralight'}),itb=tuningParameters({throttleBody:'itb'});
 assert.ok(light.crankInertiaKgM2<series.crankInertiaKgM2*.75);
 assert.ok(ultralight.crankInertiaKgM2<series.crankInertiaKgM2*.6);
 assert.ok(ultralight.crankInertiaKgM2>.07);
 assert.ok(Math.pow(.25,itb.throttleGamma)>Math.pow(.25,series.throttleGamma)*3);
 const script=applyM54Tuning(base,{throttleBody:'itb'});
 assert.match(script,/throttle_gamma: 1.1/);
 assert.equal((script.match(/plenum_volume: 0.065 \* units.L/g)||[]).length,6);
 assert.deepEqual(previewTuningCurve({flywheel:'ultralight'}),previewTuningCurve());
});
test('exhaust parts change native gas geometry and convolution response despite the common audio leveler',()=>{
 const tuned=referenceScript(base,DEFAULT_SOUND,[84,89.6,135],{exhaust:'race',muffler:'race',catalyst:'straight'} as any);
 assert.match(tuned,/length: 2.25 \* units.m/);assert.match(tuned,/velocity_decay: 0.2/);
 assert.equal((tuned.match(/impulse_response: ir_lib.minimal_muffling_01/g)||[]).length,2);
 const manual=referenceScript(base,{...DEFAULT_SOUND,impulse:'sharp_0'},[84,89.6,135],{muffler:'race'} as any);
 assert.equal((manual.match(/impulse_response: ir_lib.sharp_0/g)||[]).length,2);
 assert.ok(referenceScript(base,DEFAULT_SOUND,[84,89.6,135]).startsWith(base));
});

test('cam stages change native flanks, overlap and low-charge scatter while preserving mean combustion efficiency',()=>{
 const stages=['standard','sport','supersport','race'].map(camshaft=>tuningParameters({camshaft}));
 for(let i=1;i<stages.length;i++){
  assert.ok(stages[i].camOverlapAt50Deg>stages[i-1].camOverlapAt50Deg);
  assert.ok(stages[i].camLobeGamma<stages[i-1].camLobeGamma);
  assert.ok(stages[i].camBurningRandomness>stages[i-1].camBurningRandomness);
  assert.ok(Math.abs(stages[i].camLowEfficiencyAttenuation*(1-stages[i].camBurningRandomness/2)-.45)<1e-12);
 }
 const race=completeTuningSupport({camshaft:'race'}),script=applyM54Tuning(base,race);
 assert.match(script,/duration_at_50_thou: 256/);assert.match(script,/gamma: 0.6/);
 assert.match(script,/input intake_lobe_center: 104/);assert.match(script,/input exhaust_lobe_center: 102/);
 assert.match(script,/burning_efficiency_randomness: 0.98/);assert.match(script,/max_dilution_effect: 20/);
 assert.match(script,/add_sample\(6000 \* units.rpm, 36 \* units.deg\)/);
 assert.ok(stages[3].idlePlate<stages[0].idlePlate);
 assert.equal(applyM54Tuning(base),base);
});
