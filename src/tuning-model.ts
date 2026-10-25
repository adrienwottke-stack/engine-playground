import { DEFAULT_TUNING, tuningKey, tuningParameters, validateTuning, type TuningSelection } from '../native/tuning-settings.mjs';

export interface TuningCurvePoint { rpm: number; torqueNm: number; powerKw: number }
export interface MeasuredTuningComparison {
  selection: TuningSelection;
  baseline: TuningCurvePoint[];
  selected: TuningCurvePoint[];
  /** Human-readable provenance, e.g. a native steady-state sweep and its load. */
  sourceLabel: string;
}
export const torquePowerKw = (torqueNm: number, rpm: number) => torqueNm * rpm * (2 * Math.PI / 60) / 1000;

/**
 * Deliberately separate from the physical engine. This is an UNCALIBRATED
 * illustrative preview, never a native dyno or a measured BMW torque curve.
 *
 * Baseline: p_me=9.5 bar, V=6*pi/4*(84mm)^2*89.6mm, T=p_me*V/(4*pi).
 * Shape: 0.74+0.26*exp(-((rpm-3800)/2300)^2)-0.18*sigmoid((rpm-5900)/450).
 * Parts proxy: combine the script's intake/port/exhaust conductances as
 * 1/sqrt(sum(1/CFM^2)); blend 20-100% of its relative change with RPM.
 * Cam proxy: intake duration shifts the assumed peak +25rpm/degree and costs
 * 0.25%/degree below the peak, fading with RPM. Flow at lift interpolates the
 * ORIGINAL head tables (intake 230@9/235@10; exhaust 160@9/165@10 CFM).
 * These are explicit pedagogical assumptions, not solved gas dynamics.
 * Extended preview proxies: runner length shifts the assumed peak by -85 rpm/in,
 * inlet phase by +20 rpm/deg; head treatment scales port conductance; compression
 * uses (CR/10.2)^0.3; timing adds 0.4%/degree; fuel tune adds an assumed1.5%.
 * None of these corrections are calibrated or native dynamometer results.
 * Flywheel inertia and pedal response NEVER change full-load steady torque.
 */
export function previewTuningCurve(raw: unknown = DEFAULT_TUNING): TuningCurvePoint[] {
  const t = validateTuning(raw), p = tuningParameters(t), stock = tuningParameters();
  const volumeM3 = 6 * Math.PI / 4 * .084 ** 2 * .0896;
  const referenceTorque = 950_000 * volumeM3 / (4 * Math.PI);
  const conductance = (...flows: number[]) => 1 / Math.sqrt(flows.reduce((sum, q) => sum + 1 / q ** 2, 0));
  const stockFlow = conductance(230 + 5 * (stock.intakeLiftMm - 9), stock.intakeCfm, 160, stock.exhaustPrimaryCfm, stock.exhaustOutletCfm);
  const selectedFlow = conductance((230 + 5 * (p.intakeLiftMm - 9))*p.headFlowScale, p.intakeCfm, (160 + 5 * (p.exhaustLiftMm - 9))*p.headFlowScale, p.exhaustPrimaryCfm, p.exhaustOutletCfm);
  const flowRatio = selectedFlow / stockFlow;
  const durationChange = p.intakeDurationDeg - stock.intakeDurationDeg;
  const rpms=Array.from({length:Math.floor((p.redlineRpm-1000)/200)+1},(_,i)=>1000+i*200);
  if(rpms.at(-1)!==p.redlineRpm)rpms.push(p.redlineRpm);
  return rpms.map(rpm => {
    const high = 1 / (1 + Math.exp(-(rpm - 3800) / 900));
    const runnerShift=(6-p.runnerLengthInch)*85,phaseShift=(p.intakeCenterDeg-110)*20;
    const shape = .74 + .26 * Math.exp(-(((rpm - (3800 + durationChange * 25+runnerShift+phaseShift)) / 2300) ** 2)) - .18 / (1 + Math.exp(-(rpm - (5900+durationChange*16+runnerShift)) / 450));
    const camLowLoss = durationChange * .0025 * (1 - high);
    const compressionGain=Math.pow(p.compressionRatio/10.2,.3);
    const timingGain=1+(p.timingMidDeg-30)*.004*(1-high)+(p.timingTopDeg-30)*.004*high;
    const mixtureGain=t.mixture==='power'?1.015:1;
    const torqueNm = referenceTorque * shape * (1 + (flowRatio - 1) * (.2 + .8 * high) - camLowLoss)*compressionGain*timingGain*mixtureGain;
    return { rpm, torqueNm, powerKw: torquePowerKw(torqueNm, rpm) };
  });
}

/** Deliberately game-style relative traits, never measured vehicle scores. */
export function tuningTraits(raw:unknown=DEFAULT_TUNING){
  const t=validateTuning(raw),p=tuningParameters(t),curve=previewTuningCurve(t),stock=tuningParameters();
  const clamp=(x:number)=>Math.max(0,Math.min(100,x));
  const camLoss=(p.intakeDurationDeg-210)*.42;
  const noise=(p.exhaustAudioScale-1)*36+(t.catalyst==='straight'?5:0)+(t.throttleBody==='itb'?5:0);
  return {powerKw:Math.max(...curve.map(x=>x.powerKw)),torqueNm:Math.max(...curve.map(x=>x.torqueNm)),redlineRpm:p.redlineRpm,
    power:clamp(45+Math.max(...curve.map(x=>x.powerKw))/4),
    response:clamp(55+(stock.crankInertiaKgM2/p.crankInertiaKgM2-1)*100+(2-p.throttleGamma)*10+(t.throttleBody==='itb'?6:0)),
    lowEnd:clamp(55+(curve[3].torqueNm/210-1)*80),
    comfort:clamp(85-camLoss-noise-(t.flywheel==='ultralight'?12:t.flywheel==='light'?5:0)-(t.lifters==='solid'?6:0)-(t.idle==='race'?5:0)),
    highRpm:clamp(40+(p.redlineRpm-6500)/35+(p.intakeDurationDeg-210)*.3),
  };
}

/** Reject incomplete, nonphysical or mislabeled recorded curves. */
export function validateMeasuredComparison(raw: MeasuredTuningComparison): MeasuredTuningComparison {
  const selection = validateTuning(raw?.selection);
  if (typeof raw?.sourceLabel !== 'string' || !raw.sourceLabel.trim() || raw.sourceLabel.length > 180) throw new Error('Die Herkunft der Messkurve fehlt.');
  const read = (rows: TuningCurvePoint[]) => {
    if (!Array.isArray(rows) || rows.length < 3 || rows.length > 500) throw new Error('Die Messkurve ist unvollständig.');
    let previous = 0;
    return rows.map(row => {
      if (!row || ![row.rpm, row.torqueNm, row.powerKw].every(Number.isFinite) || row.rpm <= previous || row.rpm > 9000 || row.torqueNm < 0 || row.torqueNm > 2000 || row.powerKw < 0 || Math.abs(row.powerKw - torquePowerKw(row.torqueNm, row.rpm)) > Math.max(.15, row.powerKw * .01)) throw new Error('Die Messkurve enthält ungültige Werte oder Einheiten.');
      previous = row.rpm;
      return { rpm: row.rpm, torqueNm: row.torqueNm, powerKw: row.powerKw };
    });
  };
  return { selection, baseline: read(raw.baseline), selected: read(raw.selected), sourceLabel: raw.sourceLabel.trim() };
}

export const sameTuning = (a: unknown, b: unknown) => tuningKey(a) === tuningKey(b);
