import {validateSound,DEFAULT_SOUND,type SoundSettings} from '../native/reference-settings.mjs';
import {validateTuning,DEFAULT_TUNING,type TuningSelection} from '../native/tuning-settings.mjs';
/** Deterministic educational model. No BMW measurements or native Engine Simulator data. */
export const TAU = Math.PI * 2;
export const STEP = 0.001;
export const FIRING_ORDER = [1, 5, 3, 6, 2, 4] as const;
export const rpmToOmega = (rpm: number) => rpm * TAU / 60;
export const omegaToRpm = (omega: number) => omega * 60 / TAU;
export const powerKw = (torqueNm: number, rpm: number) => torqueNm * rpmToOmega(rpm) / 1000;
export const mod = (x: number, n: number) => ((x % n) + n) % n;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface Config {
  sound:SoundSettings;
  tuning:TuningSelection;
  engine: { boreMm: number; strokeMm: number; rodMm: number; flywheelKgM2: number; throttleLagS: number };
  vehicle: { massKg: number; finalDrive: number; wheelRadiusM: number; gears: number[]; dragAreaM2: number; rollingCoefficient: number };
  cooling: { ambientC: number; coolantL: number; specificHeatKjKgK: number; engineCapacityKjK: number; flowLMin: number; radiatorWPerK: number; fan: number; roadAir: boolean; heatMode: 'estimated' | 'manual'; manualHeatKw: number };
}

export const DEFAULT_CONFIG: Config = {
  sound:{...DEFAULT_SOUND},
  tuning:{...DEFAULT_TUNING},
  engine: { boreMm: 84, strokeMm: 89.6, rodMm: 135, flywheelKgM2: 0.18, throttleLagS: 0 },
  vehicle: { massKg: 1450, finalDrive: 3.15, wheelRadiusM: 0.31, gears: [4.2, 2.5, 1.65, 1.2, 1], dragAreaM2: 0.65, rollingCoefficient: 0.012 },
  cooling: { ambientC: 22, coolantL: 9, specificHeatKjKgK: 3.8, engineCapacityKjK: 90, flowLMin: 45, radiatorWPerK: 1200, fan: 1, roadAir: true, heatMode: 'estimated', manualHeatKw: 25 }
};
export const copyConfig = (c: Config = DEFAULT_CONFIG): Config => structuredClone(c);

export function validateConfig(raw: unknown): Config {
  if (!raw || typeof raw !== 'object') throw new Error('Die Konfiguration ist kein Objekt.');
  const x = raw as Config;
  const num = (v: unknown, lo: number, hi: number, name: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name}: zulässig sind ${lo} bis ${hi}.`);
    return v;
  };
  if (!x.engine || !x.vehicle || !x.cooling) throw new Error('Motor, Fahrzeug und Kühlung müssen enthalten sein.');
  const e = x.engine, v = x.vehicle, c = x.cooling;
  if (!Array.isArray(v.gears) || v.gears.length !== 5) throw new Error('Genau fünf Vorwärtsgänge sind erforderlich.');
  if (typeof c.roadAir !== 'boolean' || !['manual', 'estimated'].includes(c.heatMode)) throw new Error('Ungültiger Kühlungsmodus.');
  if (!Number.isInteger(c.fan)) throw new Error('Die Lüfterstufe muss ganzzahlig sein.');
  return {
    sound:validateSound(x.sound),
    tuning:validateTuning(x.tuning),
    engine: { boreMm: num(e.boreMm, 70, 100, 'Bohrung'), strokeMm: num(e.strokeMm, 60, 105, 'Hub'), rodMm: num(e.rodMm, 110, 170, 'Pleuel'), flywheelKgM2: num(e.flywheelKgM2, 0.04, 1, 'Schwungrad'), throttleLagS: num(e.throttleLagS, 0, 2, 'Gasverzögerung') },
    vehicle: { massKg: num(v.massKg, 400, 3000, 'Masse'), finalDrive: num(v.finalDrive, 2, 5, 'Achsübersetzung'), wheelRadiusM: num(v.wheelRadiusM, 0.2, 0.45, 'Radradius'), gears: v.gears.map(g => num(g, 0.5, 5, 'Gangübersetzung')), dragAreaM2: num(v.dragAreaM2, 0, 1.5, 'Luftwiderstandsfläche'), rollingCoefficient: num(v.rollingCoefficient, 0, 0.04, 'Rollwiderstand') },
    cooling: { ambientC: num(c.ambientC, -10, 45, 'Umgebung'), coolantL: num(c.coolantL, 2, 20, 'Kühlmittelmenge'), specificHeatKjKgK: num(c.specificHeatKjKgK, 2, 4.2, 'Wärmekapazität'), engineCapacityKjK: num(c.engineCapacityKjK, 40, 250, 'Motorwärmekapazität'), flowLMin: num(c.flowLMin, 0, 100, 'Durchfluss'), radiatorWPerK: num(c.radiatorWPerK, 0, 3000, 'Kühler-Wärmeübergang'), fan: num(c.fan, 0, 3, 'Lüfter'), roadAir: c.roadAir, heatMode: c.heatMode, manualHeatKw: num(c.manualHeatKw, 0, 100, 'Wärmeeintrag') }
  };
}

export const displacementL = (config: Config) => 6 * Math.PI / 4 * (config.engine.boreMm / 1000) ** 2 * (config.engine.strokeMm / 1000) * 1000;
export const engineInertia = (config: Config) => 0.12 + config.engine.flywheelKgM2;

export interface PistonGeometry { phase: number; crankX: number; crankY: number; pistonY: number; travel: number; stroke: number; stage: number }
/** Angle 0 = cylinder 1 firing TDC. Firing order defines the 720 degree cycle. */
export function pistonGeometry(angle: number, cylinder: number, strokeMm: number, rodMm: number): PistonGeometry {
  const index = FIRING_ORDER.indexOf(cylinder as typeof FIRING_ORDER[number]);
  const phase = mod(angle - index * TAU / 3, TAU * 2);
  const r = strokeMm / 2, theta = mod(phase, TAU);
  const crankX = r * Math.sin(theta), crankY = -r * Math.cos(theta);
  const pistonY = crankY - Math.sqrt(rodMm ** 2 - crankX ** 2);
  const travel = pistonY + rodMm + r;
  return { phase, crankX, crankY, pistonY, travel, stroke: strokeMm, stage: Math.min(3, Math.floor(phase / Math.PI)) };
}

export interface Controls { throttle: number; gear: number; clutch: number; dynoEnabled: boolean; dynoNm: number; brake: number }
export interface State {
  t: number; omega: number; crankAngle: number; velocity: number; pedal: number; actualThrottle: number;
  ignition: boolean; starter: boolean; engineStatus: 'stopped' | 'cranking' | 'running' | 'coasting' | 'stalled';
  rpm: number; torqueNm: number; powerKw: number; dynoNm: number; wheelTorqueNm: number; speedKmh: number; wheelRpm: number;
  gear: number; clutch: number; clutchState: 'neutral' | 'open' | 'slip' | 'locked'; slipRpm: number; clutchHeatKw: number;
  engineC: number; coolantC: number; radiatorC: number; heatInKw: number; heatOutKw: number; engineCoolantKw: number;
  energyInJ: number; energyOutJ: number; energyResidualJ: number; storedEnergyJ: number; simPaused: boolean;
  thermalTimeS: number; coolantRadiatorKw: number; radiatorAmbientKw: number; coolantSlopeCS: number;
  thermostatOpen: number; radiatorFlowLMin: number; fanDuty: number; thermalHalted: boolean; thermalStatus: 'cold' | 'normal' | 'hot' | 'limit';
}
export const THERMAL_LIMITS = Object.freeze({coolantC:120,engineC:160,thermostatStartC:88,thermostatFullC:108});
// Assumed 50/50 coolant density1.05kg/L. All fluid belongs to one of the two
// coolant lumps (65% jacket,35% radiator/return); radiator metal adds5kJ/K.
const thermalCapacities = (c: Config) => {const fluid=c.cooling.coolantL*1.05*c.cooling.specificHeatKjKgK*1000;return [c.cooling.engineCapacityKjK*1000,fluid*.65,fluid*.35+5000];};

export class Simulation {
  config: Config;
  controls: Controls = { throttle: 0, gear: 0, clutch: 0, dynoEnabled: false, dynoNm: 40, brake: 0 };
  state!: State;
  private starterUntil = 0;
  private manualStarter = false;
  private initialEnergy = 0;

  constructor(config: Config = DEFAULT_CONFIG, initialC?: number) {
    this.config = validateConfig(config);
    this.reset(initialC);
  }
  reset(initialC = this.config.cooling.ambientC) {
    this.controls = { throttle: 0, gear: 0, clutch: 0, dynoEnabled: false, dynoNm: 40, brake: 0 };
    this.starterUntil = 0;
    this.manualStarter = false;
    this.state = { t: 0, omega: 0, crankAngle: 0, velocity: 0, pedal: 0, actualThrottle: 0, ignition: false, starter: false, engineStatus: 'stopped', rpm: 0, torqueNm: 0, powerKw: 0, dynoNm: 0, wheelTorqueNm: 0, speedKmh: 0, wheelRpm: 0, gear: 0, clutch: 0, clutchState: 'neutral', slipRpm: 0, clutchHeatKw: 0, engineC: initialC, coolantC: initialC, radiatorC: initialC, heatInKw: 0, heatOutKw: 0, engineCoolantKw: 0, energyInJ: 0, energyOutJ: 0, energyResidualJ: 0, storedEnergyJ: 0, simPaused: false, thermalTimeS: 0, coolantRadiatorKw: 0, radiatorAmbientKw: 0, coolantSlopeCS: 0,thermostatOpen:0,radiatorFlowLMin:0,fanDuty:0,thermalHalted:false,thermalStatus:'cold' };
    this.initialEnergy = this.thermalEnergy();
    this.state.storedEnergyJ = this.initialEnergy;
  }
  start() { this.state.ignition = true; this.starterUntil = this.state.t + 0.8; }
  stop() { this.state.ignition = false; this.starterUntil = 0; this.manualStarter = false; this.controls.throttle = 0; }
  setIgnition(value: boolean) { this.state.ignition = value; this.starterUntil = 0; }
  setStarter(value: boolean) { this.manualStarter = value; }
  setLiveConfig(config: Config) {
    const next = validateConfig(config);
    const changedCapacity = thermalCapacities(this.config).some((v, i) => v !== thermalCapacities(next)[i]);
    this.config = next;
    if (changedCapacity) this.resetThermal(next.cooling.ambientC);
  }
  resetThermal(initial: number | number[] = this.config.cooling.ambientC) {
    const values = Array.isArray(initial) ? initial : [initial, initial, initial];
    if (values.length !== 3 || values.some((v,i) => !Number.isFinite(v) || v < -20 || v > (i===0?THERMAL_LIMITS.engineC:THERMAL_LIMITS.coolantC))) throw new Error('Ungültige Anfangstemperatur.');
    [this.state.engineC, this.state.coolantC, this.state.radiatorC] = values;
    Object.assign(this.state, { thermalTimeS: 0, energyInJ: 0, energyOutJ: 0, energyResidualJ: 0, heatInKw: 0, heatOutKw: 0, engineCoolantKw: 0, coolantRadiatorKw: 0, radiatorAmbientKw: 0, coolantSlopeCS: 0,thermostatOpen:0,radiatorFlowLMin:0,fanDuty:0,thermalHalted:false,thermalStatus:values[1]<80?'cold':'normal' });
    this.initialEnergy = this.thermalEnergy(); this.state.storedEnergyJ = this.initialEnergy;
  }
  setControls(patch: Partial<Controls>) {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'dynoEnabled') { if (typeof value !== 'boolean') throw new Error('Ungültiger Lastzustand.'); }
      else if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Ungültiger Bedienwert.');
    }
    const c = this.controls;
    if (patch.throttle !== undefined) c.throttle = clamp(patch.throttle, 0, 1);
    if (patch.gear !== undefined) { if (!Number.isInteger(patch.gear)) throw new Error('Ungültiger Gang.'); c.gear = clamp(patch.gear, 0, 5); }
    if (patch.clutch !== undefined) c.clutch = clamp(patch.clutch, 0, 1);
    if (patch.dynoEnabled !== undefined) c.dynoEnabled = patch.dynoEnabled;
    if (patch.dynoNm !== undefined) c.dynoNm = clamp(patch.dynoNm, 0, 200);
    if (patch.brake !== undefined) c.brake = clamp(patch.brake, 0, 1);
  }
  /** Capacity changes require reset. Conductance, fan and ambient changes can continue live. */
  setCooling(patch: Partial<Config['cooling']>) {
    const next = validateConfig({ ...this.config, cooling: { ...this.config.cooling, ...patch } });
    const a = thermalCapacities(this.config), b = thermalCapacities(next);
    if (a.some((v, i) => v !== b[i])) throw new Error('Wärmekapazitäten bitte mit „Übernehmen & zurücksetzen“ ändern.');
    this.config = next;
  }
  thermalEnergy() {
    const [ce, cc, cr] = thermalCapacities(this.config), s = this.state;
    return ce * s.engineC + cc * s.coolantC + cr * s.radiatorC;
  }
  step(dt = STEP) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.01) throw new Error('Zeitschritt außerhalb von (0; 0,01] s.');
    const s = this.state, c = this.controls, cfg = this.config;
    s.t += dt;
    s.pedal = c.throttle;
    const lag = cfg.engine.throttleLagS;
    s.actualThrottle = lag === 0 ? c.throttle : c.throttle + (s.actualThrottle - c.throttle) * Math.exp(-dt / lag);
    const omega0 = s.omega;
    const rpm = omegaToRpm(s.omega);
    const inertia = engineInertia(cfg);
    const friction = s.omega > 0 ? 14 + 0.012 * s.omega + 0.00004 * s.omega ** 2 : 0;
    const fullBrake = (displacementL(cfg) / 3) * (210 + 70 * Math.exp(-(((rpm - 4000) / 2000) ** 2)));
    const limit = clamp((6800 - rpm) / 250, 0, 1);
    const combustible = s.ignition && s.omega > rpmToOmega(150);
    const idleTorque = clamp(friction + (rpmToOmega(850) - s.omega) * 0.7, 0, 90);
    const drive = combustible ? Math.max((fullBrake + friction) * s.actualThrottle, idleTorque) * limit : 0;
    s.starter = (this.manualStarter || (s.ignition && s.t < this.starterUntil)) && rpm < 700;
    const starterTorque = s.starter ? 100 * clamp(1 - rpm / 900, 0, 1) : 0;
    s.torqueNm = drive - friction;
    s.powerKw = s.torqueNm * s.omega / 1000;
    s.dynoNm = c.dynoEnabled && s.omega > 0 ? c.dynoNm : 0;
    let engineFree = Math.max(0, s.omega + (drive + starterTorque - friction - s.dynoNm) / inertia * dt);

    const vehicle = cfg.vehicle;
    const ratio = c.gear > 0 ? vehicle.gears[c.gear - 1] * vehicle.finalDrive : 0;
    const effectiveMass = vehicle.massKg + 4.4 / vehicle.wheelRadiusM ** 2;
    const force = 0.5 * 1.225 * vehicle.dragAreaM2 * s.velocity ** 2 + (s.velocity > 0 ? vehicle.massKg * 9.81 * vehicle.rollingCoefficient : 0) + (s.velocity > 0 ? 7000 * c.brake : 0);
    let velocityFree = Math.max(0, s.velocity - force / effectiveMass * dt);
    s.clutchHeatKw = 0;
    s.wheelTorqueNm = 0;
    s.gear = c.gear;
    s.clutch = c.clutch;
    if (ratio === 0 || c.clutch === 0) {
      s.clutchState = ratio === 0 ? 'neutral' : 'open';
      s.slipRpm = ratio === 0 ? 0 : omegaToRpm(engineFree - velocityFree * ratio / vehicle.wheelRadiusM);
    } else {
      const jVehicle = effectiveMass * vehicle.wheelRadiusM ** 2 / ratio ** 2;
      const slip = engineFree - velocityFree * ratio / vehicle.wheelRadiusM;
      const requestedImpulse = slip / (1 / inertia + 1 / jVehicle);
      const capacity = 420 * c.clutch ** 2;
      const impulse = clamp(requestedImpulse, -capacity * dt, capacity * dt);
      engineFree -= impulse / inertia;
      velocityFree += impulse / jVehicle * vehicle.wheelRadiusM / ratio;
      const afterSlip = engineFree - velocityFree * ratio / vehicle.wheelRadiusM;
      s.clutchState = Math.abs(requestedImpulse) <= capacity * dt + 1e-10 ? 'locked' : 'slip';
      s.slipRpm = omegaToRpm(afterSlip);
      s.wheelTorqueNm = impulse / dt * ratio;
      s.clutchHeatKw = Math.max(0, impulse / dt * (slip + afterSlip) / 2 / 1000);
    }
    s.omega = Math.max(0, engineFree);
    s.velocity = Math.max(0, velocityFree);
    s.crankAngle = mod(s.crankAngle + (omega0 + s.omega) * 0.5 * dt, 2 * TAU);
    s.rpm = omegaToRpm(s.omega);
    s.powerKw = s.torqueNm * s.omega / 1000;
    s.speedKmh = s.velocity * 3.6;
    s.wheelRpm = omegaToRpm(s.velocity / vehicle.wheelRadiusM);
    s.engineStatus = s.starter ? 'cranking' : s.ignition ? s.rpm > 150 ? 'running' : 'stalled' : s.rpm > 5 ? 'coasting' : 'stopped';
    const assumedHeat = combustible ? 6000 + 0.65 * Math.max(0, drive * s.omega) + 9000 * s.actualThrottle : 0;
    this.thermalStep(dt, cfg.cooling.heatMode === 'manual' ? cfg.cooling.manualHeatKw * 1000 : assumedHeat, s.velocity);
  }
  /** Energy-conserving jacket/return model. Stops at its liquid validity limit. */
  thermalStep(dt: number, sourceW: number, speedMs = 0) {
    if(!Number.isFinite(dt)||dt<=0||dt>1||!Number.isFinite(sourceW)||sourceW<0||!Number.isFinite(speedMs))throw new Error('Ungültiger thermischer Zeitschritt oder Wärmeeintrag.');
    const s=this.state,c=this.config.cooling;
    if(s.thermalHalted)return;
    const [ce,cc,cr]=thermalCapacities(this.config);
    const thermostat=clamp((s.coolantC-THERMAL_LIMITS.thermostatStartC)/(THERMAL_LIMITS.thermostatFullC-THERMAL_LIMITS.thermostatStartC),0,1);
    // Mode0: off;1: proportional automatic control;2:65%;3:100%.
    const fan=c.fan===1?clamp((s.coolantC-94)/8,0,1):c.fan===2?.65:c.fan===3?1:0;
    const jacketConductance=75+4500*c.flowLMin/(c.flowLMin+30);
    const radiatorFlow=c.flowLMin*thermostat;
    const transport=radiatorFlow/60*1.05*c.specificHeatKjKgK*1000;
    const airFactor=.12+.88*fan+(c.roadAir?.55*Math.sqrt(Math.max(0,speedMs)):0);
    const qEC=jacketConductance*(s.engineC-s.coolantC);
    const qCR=transport*(s.coolantC-s.radiatorC);
    const qRA=c.radiatorWPerK*airFactor*(s.radiatorC-c.ambientC);
    const qEA=15*(s.engineC-c.ambientC);
    const slopes=[(sourceW-qEC-qEA)/ce,(qEC-qCR)/cc,(qCR-qRA)/cr];
    // Integrate only up to the FIRST model-boundary crossing. This preserves the
    // heat balance instead of clipping temperature and silently deleting energy.
    let h=dt;
    for(const [i,temp,limit] of [[0,s.engineC,THERMAL_LIMITS.engineC],[1,s.coolantC,THERMAL_LIMITS.coolantC],[2,s.radiatorC,THERMAL_LIMITS.coolantC]]){
      if(temp>=limit-1e-9){h=0;break;}
      if(slopes[i]>0)h=Math.min(h,(limit-temp)/slopes[i]);
    }
    h=Math.max(0,h);
    s.engineC+=slopes[0]*h;s.coolantC+=slopes[1]*h;s.radiatorC+=slopes[2]*h;
    s.thermalTimeS+=h;s.energyInJ+=sourceW*h;s.energyOutJ+=(qRA+qEA)*h;
    s.storedEnergyJ=this.thermalEnergy();s.energyResidualJ=(s.storedEnergyJ-this.initialEnergy)-(s.energyInJ-s.energyOutJ);
    s.thermostatOpen=thermostat;s.radiatorFlowLMin=radiatorFlow;s.fanDuty=fan;
    s.thermalHalted=h<dt||s.coolantC>=THERMAL_LIMITS.coolantC-1e-9||s.engineC>=THERMAL_LIMITS.engineC-1e-9||s.radiatorC>=THERMAL_LIMITS.coolantC-1e-9;
    s.thermalStatus=s.thermalHalted?'limit':s.coolantC>=110||s.engineC>=140?'hot':s.coolantC<80?'cold':'normal';
    s.heatInKw=s.thermalHalted?0:sourceW/1000;s.heatOutKw=s.thermalHalted?0:(qRA+qEA)/1000;
    s.engineCoolantKw=s.thermalHalted?0:qEC/1000;s.coolantRadiatorKw=s.thermalHalted?0:qCR/1000;
    s.radiatorAmbientKw=s.thermalHalted?0:qRA/1000;s.coolantSlopeCS=s.thermalHalted?0:slopes[1];
  }
  advance(seconds: number) {
    const count = Math.round(seconds / STEP);
    for (let i = 0; i < count; i++) this.step();
    return this.state;
  }
  snapshot(): State { return { ...this.state }; }
}

export type ExperimentKind = 'inertia' | 'gearing' | 'cooling';
export interface RunResult {
  schemaVersion: 1; mode: 'demo'; kind: ExperimentKind; durationS: number; dtS: number; samplePeriodS: number;
  initialC: number; scenario: string; configs: { A: Config; B: Config }; A: State[]; B: State[];
}
export const SCENARIOS = {
  inertia: '12 s · Neutral · 30 Nm Last · Start 0 s · 70 % Gas von 2 bis 5 s, danach 0 % · keine Gasverzögerung',
  gearing: '18 s · Gang 2 · 70 % Gas ab 2 s · Kupplung von 2 bis 4 s linear schließen · keine Bremse',
  cooling: 'Bis 1200 s, Ende bei Modellgrenze · 25 kW konstanter Wärmeeintrag · Motor aus · Fahrzeug steht · Lüfter gemäß A/B'
};
export function examplePair(kind: ExperimentKind, base = DEFAULT_CONFIG): { A: Config; B: Config } {
  const A = copyConfig(base), B = copyConfig(base);
  if (kind === 'inertia') { A.engine.flywheelKgM2 = 0.08; B.engine.flywheelKgM2 = 0.48; A.engine.throttleLagS = B.engine.throttleLagS = 0; }
  if (kind === 'gearing') { A.vehicle.gears[1] = 2.5; B.vehicle.gears[1] = 1.6; }
  if (kind === 'cooling') { A.cooling.radiatorWPerK = 1200; A.cooling.flowLMin = 45; A.cooling.fan = 1; B.cooling.radiatorWPerK = 800; B.cooling.flowLMin = 20; B.cooling.fan = 2; }
  return { A, B };
}
export function runExperiment(kind: ExperimentKind, rawA: Config, rawB: Config): RunResult {
  if (!Object.hasOwn(SCENARIOS, kind)) throw new Error('Unbekanntes Experiment.');
  const configs = { A: validateConfig(rawA), B: validateConfig(rawB) };
  // Controlled comparisons: unrelated changes in saved B cannot confound the experiment.
  if (kind === 'inertia') {
    const inertiaB = configs.B.engine.flywheelKgM2;
    configs.B = copyConfig(configs.A);
    configs.B.engine.flywheelKgM2 = inertiaB;
    configs.A.engine.throttleLagS = configs.B.engine.throttleLagS = 0;
  }
  if (kind === 'gearing') {
    const gearB = configs.B.vehicle.gears[1];
    configs.B = copyConfig(configs.A);
    configs.B.vehicle.gears[1] = gearB;
  }
  if (kind === 'cooling') {
    const coolingB = configs.B.cooling;
    configs.B = copyConfig(configs.A);
    configs.B.cooling = coolingB;
    configs.A.cooling.heatMode = configs.B.cooling.heatMode = 'manual';
    configs.A.cooling.manualHeatKw = configs.B.cooling.manualHeatKw = 25;
  }
  // The same initial temperatures, pedal, RPM, speed, gear and clutch for BOTH runs.
  const initialC = configs.A.cooling.ambientC;
  const durationS = kind === 'cooling' ? 1200 : kind === 'inertia' ? 12 : 18;
  const dtS = kind === 'cooling' ? 0.01 : STEP;
  const samplePeriodS = kind === 'cooling' ? 2 : 0.05;
  const run = (config: Config) => {
    const sim = new Simulation(config, initialC);
    if (kind === 'cooling') sim.config.cooling = { ...sim.config.cooling, heatMode: 'manual', manualHeatKw: 25 };
    if (kind === 'inertia') sim.controls = { ...sim.controls, dynoEnabled: true, dynoNm: 30 };
    if (kind !== 'cooling') sim.start();
    const data: State[] = [sim.snapshot()];
    const every = Math.round(samplePeriodS / dtS);
    for (let i = 0; i < Math.round(durationS / dtS); i++) {
      const t = i * dtS;
      if (kind === 'inertia') sim.controls.throttle = t >= 2 && t < 5 ? 0.7 : 0;
      if (kind === 'gearing') { sim.controls.throttle = t >= 2 ? 0.7 : 0; sim.controls.gear = 2; sim.controls.clutch = clamp((t - 2) / 2, 0, 1); }
      if(kind==='cooling'){sim.thermalStep(dtS,25000);sim.state.t=sim.state.thermalTimeS;}else sim.step(dtS);
      if(kind==='cooling'&&sim.state.thermalHalted){data.push(sim.snapshot());break;}
      if ((i + 1) % every === 0) data.push(sim.snapshot());
    }
    return data;
  };
  return { schemaVersion: 1, mode: 'demo', kind, durationS, dtS, samplePeriodS, initialC, scenario: SCENARIOS[kind], configs, A: run(configs.A), B: run(configs.B) };
}

export function timeSeriesCsv(data: State[], run = 'live', kind = 'sandbox'): string {
  const keys = ['t', 'rpm', 'pedal', 'actualThrottle', 'torqueNm', 'powerKw', 'dynoNm', 'wheelTorqueNm', 'speedKmh', 'wheelRpm', 'gear', 'clutch', 'slipRpm', 'clutchHeatKw', 'engineC', 'coolantC', 'radiatorC', 'heatInKw', 'heatOutKw', 'energyResidualJ'] as const;
  const headers = ['time_s', 'rpm_1_min', 'pedal_fraction', 'throttle_fraction', 'brake_torque_Nm', 'brake_power_kW', 'dyno_load_Nm', 'wheel_torque_Nm', 'speed_km_h', 'wheel_rpm_1_min', 'gear', 'clutch_fraction', 'slip_1_min', 'clutch_heat_kW', 'engine_C', 'coolant_C', 'radiator_C', 'heat_in_kW', 'heat_out_kW', 'energy_residual_J'];
  return 'run,mode,scenario,' + headers.join(',') + ',clutch_state,thermal_status,thermal_halted\n' + data.map(s => `${run},demo,${kind},${keys.map(k => s[k].toFixed(6)).join(',')},${s.clutchState},${s.thermalStatus},${s.thermalHalted}`).join('\n') + '\n';
}
