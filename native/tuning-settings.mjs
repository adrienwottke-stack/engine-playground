/** Bounded workshop parts for the open BMW models, not homologated BMW parts. */
export const DEFAULT_TUNING = Object.freeze({ camshaft: 'standard', flywheel: 'standard', intake: 'standard', exhaust: 'standard', response: 'standard',
  filter:'standard', throttleBody:'standard', runners:'standard', head:'standard', seats:'standard', valves:'standard',
  valveSprings:'standard', retainers:'standard', lifters:'standard', pistons:'standard', rods:'standard',
  exhaustDiameter:'standard', catalyst:'standard', muffler:'standard', ignition:'standard', mixture:'standard', camTiming:'standard', idle:'standard', revLimit:'auto' });
export const TUNING_CHOICES = Object.freeze({ camshaft: ['standard', 'sport', 'supersport', 'race'], flywheel: ['standard', 'light', 'ultralight'], intake: ['standard', 'sport', 'race'], exhaust: ['standard', 'sport', 'race'], response: ['standard', 'comfort', 'sport'],
  filter:['standard','sport'], throttleBody:['standard','large','itb'], runners:['standard','long','short'], head:['standard','ported','race'], seats:['standard','multiangle'], valves:['standard','large'],
  valveSprings:['standard','sport','race'], retainers:['standard','titanium'], lifters:['standard','solid'], pistons:['standard','high','race'], rods:['standard','light'],
  exhaustDiameter:['standard','large','race'], catalyst:['standard','sport','straight'], muffler:['standard','sport','race'], ignition:['standard','torque','race'], mixture:['standard','power'], camTiming:['standard','torque','topend'], idle:['standard','raised','race'], revLimit:['auto','street','race'] });
const CHOICES = TUNING_CHOICES;
export const TUNING_PRESETS = Object.freeze({
  standard: DEFAULT_TUNING,
  comfort: Object.freeze({ ...DEFAULT_TUNING, response: 'comfort' }),
  sport: Object.freeze({ camshaft: 'sport', flywheel: 'light', intake: 'sport', exhaust: 'sport', response: 'sport' }),
});

/** Reject unknown values and keys so no configuration text becomes script text. */
export function validateTuning(raw = DEFAULT_TUNING) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Die Teileauswahl ist ungültig.');
  for (const key of Object.keys(raw)) if (!Object.hasOwn(CHOICES, key)) throw new Error(`Unbekanntes Tuningteil: ${key}`);
  const result = { ...DEFAULT_TUNING, ...raw };
  for (const [key, choices] of Object.entries(CHOICES)) if (!choices.includes(result[key])) throw new Error(`Ungültiges Tuningteil: ${key}`);
  return result;
}

export const tuningKey = raw => {
  const t = validateTuning(raw);
  const keys=Object.keys(DEFAULT_TUNING);
  return keys.slice(5).every(key=>t[key]===DEFAULT_TUNING[key]) ? keys.slice(0,5).map(key=>t[key]).join(':') : 'v2:'+keys.map(key=>t[key]).join(':');
};

/** Decode a confirmed runtime key; missing or extra fields must never default. */
export function tuningFromKey(key) {
  if (typeof key !== 'string') throw new Error('Der Tuning-Schlüssel ist ungültig.');
  const extended=key.startsWith('v2:'),names=Object.keys(DEFAULT_TUNING).slice(0,extended?undefined:5), values=(extended?key.slice(3):key).split(':');
  if (values.length !== names.length) throw new Error('Der Tuning-Schlüssel enthält nicht die erwarteten Teile.');
  return validateTuning(Object.fromEntries(names.map((name, index) => [name, values[index]])));
}

/** These values alter native gas dynamics / kinematics, never an audio filter. */
export function tuningParameters(raw = DEFAULT_TUNING, engine = 'm54') {
  const t = validateTuning(raw);
  const p = {
    intakeDurationDeg: t.camshaft === 'sport' ? 224 : 210,
    exhaustDurationDeg: t.camshaft === 'sport' ? 220 : 210,
    intakeLiftMm: engine === 'm54' ? (t.camshaft === 'sport' ? 10.4 : 9.7) : (t.camshaft === 'sport' ? 9.8 : 9),
    exhaustLiftMm: t.camshaft === 'sport' ? 9.5 : 9,
    // The source defines combined crankshaft/flywheel inertia. Only its assumed
    // 0.5*m*r^2 flywheel share is reduced; the remaining inertia stays positive.
    flywheelMassKg: t.flywheel === 'light' ? 4.2 : 5.9,
    crankInertiaKgM2: 0.22986844776863666 * 0.9 - (t.flywheel === 'light' ? 0.5 * (5.9 - 4.2) * 0.15 ** 2 : 0),
    intakeCfm: t.intake === 'sport' ? 575 : 500,
    exhaustOutletCfm: t.exhaust === 'sport' ? 1150 : 1000,
    exhaustPrimaryCfm: t.exhaust === 'sport' ? 230 : 200,
    exhaustPrimaryInch: t.exhaust === 'sport' ? 24 : 20,
    throttleGamma: t.response === 'comfort' ? 2.7 : t.response === 'sport' ? 1.45 : 2,
  };
  if(engine!=='m54')return p;
  const cam={standard:[210,210,9.7,9],sport:[224,220,10.4,9.5],supersport:[240,232,10.9,10.4],race:[256,248,11.5,11]}[t.camshaft];
  [p.intakeDurationDeg,p.exhaustDurationDeg,p.intakeLiftMm,p.exhaustLiftMm]=cam;
  p.camLobeGamma={standard:.8,sport:.68,supersport:.64,race:.6}[t.camshaft];
  const mass={standard:5.9,light:4.2,ultralight:3.2}[t.flywheel];
  p.flywheelMassKg=mass;
  // Playable workshop assumption: keep a fixed crank share and remove rim
  // inertia as well as mass in the lightweight flywheels. Previous adapter
  // removed only9% of the combined inertia, barely distinguishable in a blip.
  const stockInertia=.22986844776863666*.9;
  p.crankInertiaKgM2=.07+(stockInertia-.07)*(mass/5.9)*{standard:1,light:.8,ultralight:.6}[t.flywheel]-(t.rods==='light'?.008:0)-(t.pistons==='standard'?0:.003);
  const hardwareGamma={standard:2,large:1.45,itb:1.1}[t.throttleBody];
  p.throttleGamma=hardwareGamma*(t.response==='comfort'?1.35:t.response==='sport'?.725:1);
  p.intakeCfm={standard:500,sport:575,race:650}[t.intake]*(t.filter==='sport'?1.035:1)*{standard:1,large:1.08,itb:1.18}[t.throttleBody];
  p.exhaustPrimaryCfm={standard:200,sport:230,race:265}[t.exhaust];
  p.exhaustPrimaryInch={standard:20,sport:24,race:18}[t.exhaust];
  p.exhaustOutletCfm={standard:1000,sport:1150,race:1200}[t.exhaust]*{standard:1,large:1.12,race:1.22}[t.exhaustDiameter]*{standard:1,sport:1.06,straight:1.1}[t.catalyst]*{standard:1,sport:1.04,race:1.08}[t.muffler];
  p.headFlowScale={standard:1,ported:1.07,race:1.13}[t.head]*(t.seats==='multiangle'?1.025:1)*(t.valves==='large'?1.04:1);
  p.compressionRatio={standard:10.2,high:11.2,race:12}[t.pistons];
  p.chamberCc=(Math.PI/4*84**2*89.6/1000)/(p.compressionRatio-1);
  p.pistonMassG={standard:280,high:265,race:250}[t.pistons];p.rodMassG=t.rods==='light'?260:300;
  p.runnerLengthInch={standard:6,long:9,short:3.5}[t.runners];
  p.runnerCfm=t.throttleBody==='itb'?610:t.throttleBody==='large'?550:500;
  p.plenumL={standard:2,sport:2.3,race:3}[t.intake];
  const camCenters={standard:[110,105],sport:[108,104],supersport:[106,103],race:[104,102]}[t.camshaft];
  p.intakeCenterDeg=camCenters[0]+{standard:0,torque:-6,topend:6}[t.camTiming];
  p.exhaustCenterDeg=camCenters[1]+{standard:0,torque:3,topend:-2}[t.camTiming];
  p.camOverlapAt50Deg=Math.max(0,(p.intakeDurationDeg+p.exhaustDurationDeg)/2-p.intakeCenterDeg-p.exhaustCenterDeg);
  // Bounded cam-matched base calibration. Explicit ignition tunes add to it.
  p.timingMidDeg={standard:30,sport:30,supersport:31,race:32}[t.camshaft]+{standard:0,torque:2,race:3}[t.ignition];
  p.timingTopDeg={standard:30,sport:32,supersport:34,race:36}[t.camshaft]+{standard:0,torque:0,race:4}[t.ignition];
  // Native per-combustion efficiency scatter represents uneven residual-gas
  // burning at low charge motion. The solver attenuates it with turbulence;
  // there is no audio LFO, periodic ignition cut or synthetic RPM movement.
  p.camBurningRandomness={standard:.5,sport:.65,supersport:.82,race:.98}[t.camshaft];
  // Preserve the stock mean low-charge efficiency (0.45) while increasing its
  // cycle-to-cycle spread: A * (1-r/2) = 0.45. This avoids a hidden mean-energy
  // penalty masquerading as a rough idle.
  p.camLowEfficiencyAttenuation=.45/(1-p.camBurningRandomness/2);
  p.camDilutionTolerance={standard:10,sport:12,supersport:16,race:20}[t.camshaft];
  // Intake's 0.8 enrichment factor and fuel's 12.5 stoichiometric O2 ratio
  // give lambda = 0.8 * setting / 12.5. Explicit tune: 0.8512 instead of 0.8.
  // This is not a mass AFR and must not be presented as one.
  p.molecularAfr=t.mixture==='power'?13.3:12.5;
  p.idlePlate={standard:.994,raised:.992,race:.99}[t.idle]-{standard:0,sport:.0002,supersport:.0015,race:.0028}[t.camshaft];
  const capacity=t.valveSprings==='race'&&t.retainers==='titanium'&&t.lifters==='solid'&&t.rods==='light'?7800:t.valveSprings==='sport'||t.valveSprings==='race'?7000:6500;
  p.requestedRedlineRpm=t.revLimit==='street'?7000:t.revLimit==='race'?7600:{standard:6500,sport:6800,supersport:7200,race:7600}[t.camshaft];
  p.valvetrainCapacityRpm=capacity;p.redlineRpm=Math.min(p.requestedRedlineRpm,capacity);
  p.exhaustAudioScale={standard:1,sport:1.12,race:1.27}[t.muffler]*(t.catalyst==='straight'?1.1:1);
  // The source's50L volume and2in section imply about25m of exhaust length.
  // Tuned assemblies instead get an explicit bounded pipe geometry so their
  // pulse delay, attenuation and gas volume actually change with the parts.
  p.exhaustLengthM={standard:3.8,sport:3.2,race:2.5}[t.exhaust]-(t.muffler==='race'?.25:0);
  p.exhaustDiameterMm={standard:50.8,large:60,race:70}[t.exhaustDiameter];
  p.exhaustVelocityDecay=t.muffler==='race'?.2:t.muffler==='sport'?.45:1;
  return p;
}

/** Compatibility rules are workshop assumptions, not a strength/valve-float solver. */
export function tuningRequirements(raw=DEFAULT_TUNING){
  const t=validateTuning(raw),missing=[];
  const need=(key,value,label)=>{if(t[key]!==value)missing.push({key,value,label});};
  if(t.camshaft==='supersport'&&t.valveSprings==='standard')need('valveSprings','sport','Verstärkte Ventilfedern');
  if(t.camshaft==='race'||t.revLimit==='race'){
    need('valveSprings','race','Racing-Ventilfedern');need('retainers','titanium','Titan-Federteller');need('lifters','solid','Mechanischer Ventiltrieb');need('rods','light','Leichte Schmiedepleuel');
  }
  if(t.revLimit==='street'&&t.valveSprings==='standard')need('valveSprings','sport','Verstärkte Ventilfedern');
  return missing;
}
export function completeTuningSupport(raw=DEFAULT_TUNING){
  const t=validateTuning(raw),p=tuningParameters(t);
  if(p.requestedRedlineRpm>7000){t.valveSprings='race';t.retainers='titanium';t.lifters='solid';t.rods='light';}
  else if(p.requestedRedlineRpm>6500&&t.valveSprings==='standard')t.valveSprings='sport';
  for(const {key,value}of tuningRequirements(t))t[key]=value;
  return t;
}

function replaceOne(script, pattern, replacement, label) {
  const matches = script.match(pattern);
  if (!matches || matches.length !== 1) throw new Error(`Das Motorskript passt nicht zum Tuningteil: ${label}`);
  return script.replace(pattern, replacement);
}

/** Default selection returns the source byte-for-byte. Fail closed on source drift. */
function applyEngineTuning(base, raw, engine) {
  const t = validateTuning(raw), p = tuningParameters(t, engine);
  if(engine==='m54')return applyExpandedM54(base,t,p);
  if(Object.keys(DEFAULT_TUNING).slice(5).some(k=>t[k]!==DEFAULT_TUNING[k])||!['standard','sport'].includes(t.camshaft)||!['standard','light'].includes(t.flywheel)||!['standard','sport'].includes(t.intake)||!['standard','sport'].includes(t.exhaust))throw new Error('Die erweiterten Saugerteile gehören zum M54B30.');
  const prefix = engine === 'm54' ? 'm54b30' : 'm52b28';
  const stockLift = engine === 'm54' ? '9\\.7' : '9\\.0';
  let script = base;
  if (t.camshaft === 'sport') {
    for (const [node, duration, lift] of [['int', p.intakeDurationDeg, p.intakeLiftMm], ['exh', p.exhaustDurationDeg, p.exhaustLiftMm]]) {
      const pattern = new RegExp(`(public node ${prefix}_lobe_profile_${node} \\{[\\s\\S]*?duration_at_50_thou: )210( \\* units\\.deg,[\\s\\S]*?lift: )${node === 'int' ? stockLift : '9\\.0'}( \\* units\\.mm,)`, 'g');
      script = replaceOne(script, pattern, `$1${duration}$2${lift}$3`, `Nockenwelle ${node}`);
    }
  }
  if (t.flywheel === 'light') {
    script = replaceOne(script, /flywheel_mass: 5\.9 \* units\.kg/g, `flywheel_mass: ${p.flywheelMassKg} * units.kg`, 'Schwungradmasse');
    script = replaceOne(script, /moment_of_inertia: 0\.22986844776863666 \* 0\.9/g, `moment_of_inertia: ${p.crankInertiaKgM2}`, 'Schwungradträgheit');
  }
  if (t.intake === 'sport') script = replaceOne(script, /carburetor_cfm: 500\.0/g, `carburetor_cfm: ${p.intakeCfm}`, 'Ansaugung');
  if (t.exhaust === 'sport') {
    script = replaceOne(script, /outlet_flow_rate: k_carb\(1000\.0\)/g, `outlet_flow_rate: k_carb(${p.exhaustOutletCfm})`, 'Abgasaustritt');
    script = replaceOne(script, /primary_flow_rate: k_carb\(200\.0\)/g, `primary_flow_rate: k_carb(${p.exhaustPrimaryCfm})`, 'Krümmerdurchfluss');
    script = replaceOne(script, /primary_tube_length: 20\.0 \* units\.inch/g, `primary_tube_length: ${p.exhaustPrimaryInch} * units.inch`, 'Krümmerlänge');
  }
  if (t.response !== 'standard') {
    // The engine's direct_throttle_linkage computes 1-pedal^gamma, which
    // Engine::setThrottle passes into the physical intake plate position.
    script = replaceOne(script, /throttle_gamma: 2\.0/g, `throttle_gamma: ${p.throttleGamma}`, 'Gasannahme');
  }
  return script;
}
export const applyM52Tuning = (base, raw = DEFAULT_TUNING) => applyEngineTuning(base, raw, 'm52');
export const applyM54Tuning = (base, raw = DEFAULT_TUNING) => applyEngineTuning(base, raw, 'm54');

function applyExpandedM54(base,t,p){
  if(tuningKey(t)===tuningKey(DEFAULT_TUNING))return base;
  const missing=tuningRequirements(t);if(missing.length)throw new Error('Benötigt: '+missing.map(x=>x.label).join(', '));
  let script=base;
  const replace=(pattern,value,label)=>{script=replaceOne(script,pattern,value,label);};
  if(t.camshaft!=='standard')for(const [node,duration,lift,stockLift]of [['int',p.intakeDurationDeg,p.intakeLiftMm,'9\\.7'],['exh',p.exhaustDurationDeg,p.exhaustLiftMm,'9\\.0']]){
    replace(new RegExp(`(public node m54b30_lobe_profile_${node} \\{[\\s\\S]*?duration_at_50_thou: )210( \\* units\\.deg,[\\s\\S]*?lift: )${stockLift}( \\* units\\.mm,)`,'g'),`$1${duration}$2${lift}$3`,'Nockenwelle '+node);
    replace(new RegExp(`(public node m54b30_lobe_profile_${node} \\{[\\s\\S]*?gamma: )0\\.8(,)`,'g'),`$1${p.camLobeGamma}$2`,'Nockenflanke '+node);
  }
  if(t.camshaft!=='standard')replace(/max_turbulence_effect: 4\.0/g,`max_turbulence_effect: 4.0,\n            burning_efficiency_randomness: ${p.camBurningRandomness},\n            low_efficiency_attenuation: ${p.camLowEfficiencyAttenuation},\n            max_dilution_effect: ${p.camDilutionTolerance}`,'Nockenabhängige Restgasverbrennung');
  if(t.flywheel!=='standard')replace(/flywheel_mass: 5\.9 \* units\.kg/g,`flywheel_mass: ${p.flywheelMassKg} * units.kg`,'Schwungrad');
  if(t.flywheel!=='standard'||t.rods!=='standard'||t.pistons!=='standard')replace(/moment_of_inertia: 0\.22986844776863666 \* 0\.9/g,`moment_of_inertia: ${p.crankInertiaKgM2}`,'Drehträgheit');
  if(t.pistons!=='standard'){
    replace(/input chamber_volume: 53\.97201542473289 \* units\.cc/g,`input chamber_volume: ${p.chamberCc} * units.cc`,'Verdichtung');
    replace(/mass: 280 \* units\.g/g,`mass: ${p.pistonMassG} * units.g`,'Kolben');
  }
  if(t.rods!=='standard')replace(/mass: 300\.0 \* units\.g/g,`mass: ${p.rodMassG} * units.g`,'Pleuel');
  if(p.headFlowScale!==1)replace(/input flow_attenuation: 1\.0;/g,`input flow_attenuation: ${p.headFlowScale};`,'Kopf und Ventile');
  if(p.intakeCenterDeg!==110||p.exhaustCenterDeg!==105){
    replace(/input intake_lobe_center: lobe_separation;/g,`input intake_lobe_center: ${p.intakeCenterDeg} * units.deg;`,'Einlassphase');
    replace(/input exhaust_lobe_center: 105\.0 \* units\.deg;/g,`input exhaust_lobe_center: ${p.exhaustCenterDeg} * units.deg;`,'Auslassphase');
  }
  const expandedIntake=['filter','throttleBody','runners','mixture','idle'].some(k=>t[k]!==DEFAULT_TUNING[k])||t.intake==='race'||p.idlePlate!==.994;
  if(expandedIntake){
    const itb=t.throttleBody==='itb',n=itb?6:1;
    const inlet=Array.from({length:n},(_,i)=>`intake intake${itb?i:''}(\n        plenum_volume: ${itb?.065:p.plenumL} * units.L,\n        plenum_cross_section_area: ${itb?17:100} * units.cm2,\n        intake_flow_rate: k_carb(${p.intakeCfm/n}),\n        idle_flow_rate: k_carb(${.1/n}),\n        idle_throttle_plate_position: ${p.idlePlate},\n        molecular_afr: ${p.molecularAfr},\n        runner_flow_rate: k_carb(${p.runnerCfm}),\n        runner_length: ${p.runnerLengthInch} * units.inch,\n        velocity_decay: 0.1\n    )`).join('\n    ');
    replace(/performer_rpm_intake intake\([\s\S]*?\n    \)/g,inlet,'Ansaugtrakt');
    if(itb){let count=0;script=script.replace(/intake: intake,/g,()=>`intake: intake${count++},`);if(count!==6)throw new Error('Das Motorskript passt nicht zu sechs Einzeldrosseln.');}
  }else if(t.intake==='sport')replace(/carburetor_cfm: 500\.0/g,`carburetor_cfm: ${p.intakeCfm}`,'Ansaugung');
  if(p.exhaustPrimaryCfm!==200)replace(/primary_flow_rate: k_carb\(200\.0\)/g,`primary_flow_rate: k_carb(${p.exhaustPrimaryCfm})`,'Krümmer');
  if(p.exhaustPrimaryInch!==20)replace(/primary_tube_length: 20\.0 \* units\.inch/g,`primary_tube_length: ${p.exhaustPrimaryInch} * units.inch`,'Krümmerlänge');
  if(p.exhaustOutletCfm!==1000)replace(/outlet_flow_rate: k_carb\(1000\.0\)/g,`outlet_flow_rate: k_carb(${p.exhaustOutletCfm})`,'Abgasdurchlass');
  if(['exhaust','exhaustDiameter','muffler','catalyst'].some(k=>t[k]!=='standard')){
    replace(/volume: 50\.0 \* units\.L/g,`volume: 50.0 * units.L,\n        length: ${p.exhaustLengthM} * units.m,\n        collector_cross_section_area: circle_area(${p.exhaustDiameterMm} * units.mm)`,'Abgasgeometrie');
    if(p.exhaustVelocityDecay!==1)replace(/velocity_decay: 1\.0, \/\/0\.5/g,`velocity_decay: ${p.exhaustVelocityDecay},`,'Abgasdämpfung');
  }
  if(p.exhaustAudioScale!==1){
    replace(/audio_volume: 0\.5,/g,`audio_volume: ${.5*p.exhaustAudioScale},`,'Schalldämpfer vorn');
    replace(/audio_volume: 1\.0,/g,`audio_volume: ${p.exhaustAudioScale},`,'Schalldämpfer hinten');
  }
  if(p.throttleGamma!==2)replace(/throttle_gamma: 2\.0/g,`throttle_gamma: ${p.throttleGamma}`,'Gasannahme');
  if(p.timingMidDeg!==30||p.timingTopDeg!==30)for(const rpm of [2000,3000,4000,5000,6000,7000])replace(new RegExp(`(add_sample\\(${rpm} \\* units.rpm, )30( \\* units.deg\\))`,'g'),`$1${rpm<5000?p.timingMidDeg:p.timingTopDeg}$2`,'Zündwinkel '+rpm);
  if(p.redlineRpm!==6500){
    replace(/redline: 6500 \* units\.rpm/g,`redline: ${p.redlineRpm} * units.rpm`,'Drehzahlbereich');
    const limits=script.match(/rev_limit: 6500 \* units\.rpm/g);if(limits?.length!==2)throw new Error('Das Motorskript passt nicht zum Begrenzer.');
    script=script.replaceAll('rev_limit: 6500 * units.rpm',`rev_limit: ${p.redlineRpm} * units.rpm`);
  }
  return script;
}
