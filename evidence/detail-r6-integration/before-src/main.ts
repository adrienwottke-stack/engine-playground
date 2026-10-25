import { EngineKeys, advanceVisualAngle, shiftGear } from './engine-keys';
import { EngineDrivePhase } from './engine-drive-phase';
import { RenderMonitor } from './render-monitor';
import { installAudioTimeline } from './audio-timeline';
import { installClassicShell } from './classic-shell';
import { installCockpitGauges } from './cockpit-gauges';
import { drawEngineSection, installEngineSectionControls } from './engine-section';
import { installEngineView } from './engine-view';
import {cycleSample,reuseValveCurves} from './native-view';
import {installTuningPanel,type TuningPanel} from './tuning-panel';
import {validateTuning,tuningKey,tuningFromKey,type TuningSelection} from '../native/tuning-settings.mjs';
import './style.css';
import { markup, icon } from './ui';
import { EngineAudio } from './audio';
import { drawChart, type ViewState, type Series } from './drawing';
import { drawCutaway, drawCoolantLoop, drawDrive } from './cutaway';
import { copyConfig, DEFAULT_CONFIG, validateConfig, displacementL, examplePair, SCENARIOS, TAU, mod, pistonGeometry, type Config, type State, type Controls, type ExperimentKind, type RunResult } from './model';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = markup;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
const experimentWorker = new Worker(new URL('./experiment.worker.ts', import.meta.url), { type: 'module' });
const audio = new EngineAudio();
let config = copyConfig();
config.engine.strokeMm=89.6;
config.sound.preset='m54';
let confirmedVisualTuning = validateTuning(config.tuning);
const automationPreview = new URLSearchParams(location.search).get('workshop') !== 'classic';
let demoState: State | null = null;
let nativeState: NativeSnapshot | null = null;
let cachedValveCurves:ViewState['valveCurves'];
let cachedCycles:ViewState['cycles'];
let viewState: ViewState | null = null;
let backend: 'demo' | 'core' = 'core';
let page = 'mechanics';
let history: ViewState[] = [];
let thermalHistory: ViewState[] = [];
let thermalRate = 1;
let detailView = false, focusCylinder = 1;
let lastSample = -1;
let lastChart = 0, lastUi = 0, lastFrame = performance.now(), visualAngle = 0;
const drivePhase = new EngineDrivePhase();
let visualDriveAngle = 0;
let slow = false;
let animationClock = 0, wheelAngle = 0;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer = 0;
let experimentKind: ExperimentKind = 'inertia';
let pair = examplePair(experimentKind);
let result: RunResult | null = null;
let comparisonRevision = 0;
let runningRevision = 0;
let paused = document.hidden;
const nativeCommand = { active: true, throttle: 0, ignition: false, starter: false, gear: 0, clutch: 0, dynoEnabled: false, dynoNm: 40, brake: 0, reset: false };
let starterUntil = 0;
const engineKeys = new EngineKeys();
let pointerStarter = false;
let keyboardClutchHeld = false;
const renderMonitor = new RenderMonitor();
const clientId = crypto.randomUUID();
let hasControl = false;
let nativeReason = 'Physischer Motorkern startet …';
let quickTimer = 0, launchTimer = 0;
let tuningPanel:TuningPanel|null=null;
let tuningApplying=false;
let tuningRecovery=false;
let nativeTuningKey:string|null=null;
let nativeTuningSequence:number|null=null;

type NativeSnapshot = ViewState & { source: 'ange-physical'; timestampMs: number; sequence: number; t: number; rpm: number; crankAngle: number; geometry: { boreMm: number; strokeMm: number; rodMm: number } };
const fmt = (value: unknown, places = 0) => typeof value === 'number' && Number.isFinite(value) ? (Math.abs(value) < .5 * 10 ** -places ? 0 : value).toLocaleString('de-DE', { minimumFractionDigits: places, maximumFractionDigits: places }) : '—';
const setText = (id: string, text: string) => { const e = el(id); if (e && e.textContent !== text) e.textContent = text; };
const send = (type: string, extra = {}) => worker.postMessage({ type, ...extra });
function toast(message: string, error = false) {
  window.clearTimeout(toastTimer);
  el('toast').textContent = message;
  el('toast').classList.toggle('error', error);
  el('toast').hidden = false;
  toastTimer = window.setTimeout(() => { el('toast').hidden = true; }, error ? 6500 : 4000);
}
function download(name: string, body: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readPath(c: Config, path: string): unknown { return path.split('.').reduce((value: any, key) => value[key], c); }
function writePath(c: Config, path: string, value: unknown) { const keys = path.split('.'); let target: any = c; for (const key of keys.slice(0, -1)) target = target[key]; target[keys.at(-1)!] = value; }
function controlValue(field: HTMLInputElement | HTMLSelectElement): unknown {
  if (field instanceof HTMLSelectElement) return field.value;
  return field.type === 'checkbox' ? field.checked : field.valueAsNumber;
}
function updateSetting(field: HTMLInputElement | HTMLSelectElement) {
  const output = document.querySelector<HTMLOutputElement>(`[data-output="${field.dataset.cfg}"]`);
  if (output && field instanceof HTMLInputElement) output.value = `${fmt(field.valueAsNumber, field.step.includes('.') ? Math.min(3, field.step.split('.')[1].length) : 0)} ${field.dataset.unit || ''}`.trim();
}
function fillSettings() {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cfg]').forEach(field => {
    const value = readPath(config, field.dataset.cfg!);
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = !!value;
    else field.value = String(value);
    updateSetting(field);
  });
  setText('bore-spec', `${fmt(config.engine.boreMm, 0)} mm`);
  setText('stroke-spec', `${fmt(config.engine.strokeMm, 1)} mm`);
  setText('rod-spec', `${fmt(config.engine.rodMm, 0)} mm`);
  el('engine-name').innerHTML = `BMW M54B30 <span>${fmt(displacementL(config),1)} L · REIHENSECHSER</span>`;
  updateHeatAssumption();
}
function updateHeatAssumption() {
  const manual = config.cooling.heatMode === 'manual';
  setText('heat-assumption', manual
    ? `Konstanter, angenommener Wärmeeintrag: ${fmt(config.cooling.manualHeatKw)} kW – auch bei ausgeschaltetem Motor. Keine gemessene Wärmeleistung.`
    : backend === 'core' ? 'Angenommen: 25 % der im physischen Kern freigesetzten Brennstoffenergie gehen in den Motorblock. Kühlung ist ein separates Wärmemodell.' : 'Demo-Annahme: 6 kW Grundwärme + 0,65 × innere Leistung + 9 kW × Drossel.');
  (document.querySelector('[data-cfg="cooling.manualHeatKw"]') as HTMLInputElement).disabled = !manual;
}
function applyConfiguration() {
  try {
    const candidate = copyConfig(config);
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cfg]').forEach(field => writePath(candidate, field.dataset.cfg!, controlValue(field)));
    const geometryChanged = ['boreMm','strokeMm','rodMm'].some(key => (config.engine as any)[key] !== (candidate.engine as any)[key]);
    config = validateConfig(candidate); send('configure', { config }); fillSettings();
    if (geometryChanged && backend === 'core') { if (nativeCommand.ignition) starterUntil = performance.now() + 4000; control({gear:0,clutch:0}); input('clutch').value='0'; markGear(0); history = []; lastSample = -1; }
    toast(geometryChanged ? 'Geometrie übernommen. Der Motor wird in Neutral neu geladen.' : 'Werte übernommen. Der Motorlauf bleibt erhalten.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Ungültige Konfiguration.', true); }
}
function resetLive(preset: boolean) {
  if(tuningApplying)return;
  releaseKeys();
  thermalRate=1;select('thermal-rate').value='1';send('thermalRate',{value:1});
  if (preset) {config = copyConfig(DEFAULT_CONFIG);config.engine.strokeMm=89.6;config.sound.preset='m54';}
  clearTimeout(quickTimer); clearInterval(launchTimer);
  Object.assign(nativeCommand, { reset: backend === 'core', ignition: false, throttle: 0, gear: 0, clutch: 0, brake: 0, dynoEnabled: false }); starterUntil = 0;
  thermalHistory = [];
  history = []; lastSample = -1; visualAngle = 0; visualDriveAngle = drivePhase.reset(); viewState = null; audio.silence();
  audio.setVolume(audio.volume, audio.muted);
  send('reset', { config });
  input('throttle').value = '0'; input('clutch').value = '0'; input('brake').value = '0'; input('load').checked = false;
  input('load-value').value = '40'; markGear(0); syncControls(); fillSettings(); renderCharts();
  if (backend === 'core') void flushNativeCommand(true);
}
function markGear(gear: number) {
  document.querySelectorAll<HTMLButtonElement>('[data-gear]').forEach(b => { const active = Number(b.dataset.gear) === gear; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
}
function syncControls() {
  setText('throttle-output', fmt(Number(input('throttle').value)));
  setText('clutch-output', `${fmt(Number(input('clutch').value))} %`);
  setText('brake-output', `${fmt(Number(input('brake').value))} %`);
  setText('load-output', `${input('load-value').value} Nm`);
}
function control(patch: Partial<Controls>, claim = true) {
  if((tuningApplying||tuningRecovery)&&((patch.throttle??0)>0||(patch.gear??0)>0||(patch.clutch??0)>0))return;
  if (backend === 'demo') send('controls', { value: patch });
  else {
    Object.assign(nativeCommand, patch);
    void flushNativeCommand(claim);
  }
  syncControls();
}

const titles: Record<string, [string, string, string]> = {
  mechanics: ['MECHANIK', 'Ein Reihensechser. Deine Regeln.', 'Schau in den Motor. Folge Luft, Kraftstoff, Abgas und Kühlmittel.'],
  gearing: ['ANTRIEB', 'Drehmoment bekommt einen Weg.', 'Schwungrad, Kupplung und Übersetzungen gemeinsam ausprobieren.'],
  cooling: ['KÜHLUNG', 'Wärme braucht Zeit.', 'Verändere den Kreislauf und beobachte, wie sich die Temperaturen entwickeln.'],
  experiments: ['VERSUCHE', 'Nicht vermuten. Vergleichen.', 'Gleiche Startbedingungen, ein definierter Ablauf und zwei gespeicherte Konfigurationen.'],
  model: ['MODELL', 'Verstehen, was dahintersteckt.', 'Annahmen, Einheiten und Grenzen – damit du die Ergebnisse einordnen kannst.']
};
function openPage(next: string) {
  next='mechanics';
  if (!titles[next]) return;
  page = next;
  document.querySelector<HTMLElement>('.workspace')!.dataset.currentPage = page;
  document.querySelectorAll<HTMLElement>('[data-page]').forEach(e => { e.hidden = e.dataset.page !== page; });
  document.querySelectorAll<HTMLButtonElement>('.nav-button').forEach(e => { const active = e.dataset.tab === page; e.classList.toggle('active', active); if (active) e.setAttribute('aria-current', 'page'); else e.removeAttribute('aria-current'); });
  setText('eyebrow', 'WERKBANK / ' + titles[page][0]); setText('page-title', titles[page][1]); setText('page-subtitle', titles[page][2]);
  window.history.replaceState(null, '', '#' + page); renderCharts();
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.addEventListener('click', () => openPage(b.dataset.tab!)));
window.addEventListener('hashchange', () => openPage(location.hash.slice(1)));
function startMotor() {
    if(tuningApplying||tuningRecovery)return;
    // Motor commands must not wait for an audio module or suspended device.
    // In particular, a late audio promise must never start a motor after Stop.
    nativeCommand.ignition = true;
    if (backend === 'demo') send('start');
    else { nativeCommand.ignition = true; starterUntil = performance.now() + 4000; void flushNativeCommand(true); }
    void audio.enable(backend, nativeState?.simulationHz ?? 10000).then(()=>setText('audio-status', audio.muted ? 'Ton stumm' : backend === 'core' ? 'Physischer Ton' : 'Demo-Ton'))
      .catch(()=>{setText('audio-status', 'Audiofehler');toast('Audio konnte nicht aktiviert werden. Die Mechanik läuft weiter.', true);});
}
el('start').addEventListener('click',()=>nativeCommand.ignition?stopMotor():startMotor());
function stopMotor() {
  clearTimeout(quickTimer); clearInterval(launchTimer);
  releaseKeys();
  nativeCommand.ignition = false;
  if (backend === 'demo') send('stop');
  else { nativeCommand.ignition = false; nativeCommand.throttle = 0; nativeCommand.starter = false; starterUntil = 0; }
  input('throttle').value = '0'; syncControls(); void flushNativeCommand(true);
}
el('stop').addEventListener('click', stopMotor);
el('reset').addEventListener('click', () => { resetLive(false); toast('Motor zurückgesetzt. Deine eingebauten Teile bleiben erhalten.'); });
input('throttle').addEventListener('input', () => control({ throttle: Number(input('throttle').value) / 100 }));
input('clutch').addEventListener('input', () => control({ clutch: Number(input('clutch').value) / 100 }));
input('brake').addEventListener('input', () => control({ brake: Number(input('brake').value) / 100 }));
input('load').addEventListener('change', () => control({ dynoEnabled: input('load').checked }));
input('load-value').addEventListener('input', () => control({ dynoNm: Number(input('load-value').value) }));
document.querySelectorAll<HTMLButtonElement>('[data-gear]').forEach(b => b.addEventListener('click', () => { const gear = Number(b.dataset.gear); control({ gear }); markGear(gear); }));
for(const id of ['slow','cooling-slow'])input(id).addEventListener('change',()=>{slow=input(id).checked;input('slow').checked=slow;input('cooling-slow').checked=slow;reducedMotion=false;visualAngle=viewState?.crankAngle||0;});
input('volume').addEventListener('input', () => { const value = Number(input('volume').value) / 100; audio.setVolume(value); setText('volume-output', `${fmt(value * 100)} %`); });
el('mute').addEventListener('click', async () => {
  audio.setVolume(audio.volume, !audio.muted);
  if (!audio.muted && viewState?.ignition) { try { await audio.enable(backend, nativeState?.simulationHz ?? 10000); } catch { toast('Audio konnte nicht aktiviert werden.', true); } }
  button('mute').setAttribute('aria-pressed', String(audio.muted)); button('mute').setAttribute('aria-label', audio.muted ? 'Ton einschalten' : 'Ton stummschalten');
  setText('audio-status', audio.muted ? 'Ton stumm' : audio.context ? backend === 'core' ? 'Physischer Ton' : 'Demo-Ton' : 'Ton bereit');
});
el('mechanical-apply').addEventListener('click', applyConfiguration);
el('thermal-apply').addEventListener('click', applyConfiguration);
document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cfg]').forEach(field => {
  const geometry = ['engine.boreMm','engine.strokeMm','engine.rodMm'].includes(field.dataset.cfg!);
  const capacity = ['cooling.coolantL','cooling.specificHeatKjKgK','cooling.engineCapacityKjK'].includes(field.dataset.cfg!);
  field.addEventListener('input', () => {
    updateSetting(field);
    if (geometry || capacity) return;
    try {
      const value = controlValue(field);
      const next = copyConfig(config); writePath(next, field.dataset.cfg!, value); config = validateConfig(next);
      send('configure', { config }); updateHeatAssumption();
      if (field.dataset.cfg!.startsWith('engine.') || field.dataset.cfg!.startsWith('vehicle.')) setText('config-feedback', 'Anpassung aktiv. Drehzahl, Geschwindigkeit und Bedienung bleiben erhalten.');
    } catch { /* An unfinished number entry is applied only once it is valid. */ }
  });
});
el('warm-cooling').addEventListener('click', () => {
  send('thermalReset', {value:[105,95,70]});thermalHistory=[];
  toast('Kühlkreis warm gesetzt: Block 105 °C, Kühlmittel 95 °C, Rücklauf 70 °C. Wärmequelle und Zeitmaßstab bleiben wie gewählt.');
});
el('cold-cooling').addEventListener('click', () => {send('thermalReset',{value:config.cooling.ambientC});thermalHistory=[];toast('Kühlkreis auf Umgebungstemperatur gesetzt.');});
select('thermal-rate').addEventListener('change', () => { thermalRate = Number(select('thermal-rate').value); send('thermalRate', { value: thermalRate }); });
['view-detail','view-overview'].forEach(id => el(id).addEventListener('click', () => {
  detailView = id === 'view-detail';
  el('engine-canvas').classList.toggle('overview', !detailView);
  ['view-detail','view-overview'].forEach(key => { button(key).classList.toggle('active', (key === 'view-detail') === detailView); button(key).setAttribute('aria-pressed', String((key === 'view-detail') === detailView)); });
  select('focus-cylinder').disabled = !detailView;
}));
select('focus-cylinder').addEventListener('change', () => focusCylinder = Number(select('focus-cylinder').value));
el('rev').addEventListener('click', async () => {
  clearTimeout(quickTimer); await startMotor();
  quickTimer = window.setTimeout(() => { input('throttle').value = '45'; control({ throttle: .45 }); quickTimer = window.setTimeout(() => { input('throttle').value = '0'; control({ throttle: 0 }); }, 800); }, viewState?.rpm && viewState.rpm > 700 ? 0 : 1400);
});
el('launch').addEventListener('click', async () => {
  clearInterval(launchTimer); await startMotor();
  input('throttle').value = '35'; input('clutch').value = '0'; input('brake').value = '0'; input('load').checked = false;
  control({ throttle: .35, clutch: 0, gear: 1, brake: 0, dynoEnabled: false }); markGear(1);
  const start = performance.now() + (viewState?.rpm && viewState.rpm > 700 ? 300 : 1500);
  launchTimer = window.setInterval(() => { const clutch = Math.max(0, Math.min(1, (performance.now()-start)/2800)); input('clutch').value = String(Math.round(clutch*100)); control({ clutch }); if (clutch >= 1) clearInterval(launchTimer); }, 60);
  toast('Anfahren: Gang 1 · 35 % Gas · Kupplung wird in 2,8 s geschlossen.');
});
['live-metric', 'thermal-metric', 'comparison-metric'].forEach(id => el(id).addEventListener('change', renderCharts));

function enableEngineAudio() {
  audio.enable(backend, nativeState?.simulationHz ?? 10000).then(() => setText('audio-status',audio.muted?'Ton stumm':backend==='core'?'Physischer Ton':'Demo-Ton')).catch(() => setText('audio-status','Audiofehler'));
}
function setIgnition(value: boolean, claim = true) {
  if((tuningApplying||tuningRecovery)&&value)return;
  nativeCommand.ignition = value; starterUntil = 0;
  if (backend === 'demo') send('ignition',{value}); else void flushNativeCommand(claim);
  if (value) enableEngineAudio();
}
function applyKeys(claim = true) {
  clearTimeout(quickTimer); clearInterval(launchTimer);
  input('throttle').value = String(engineKeys.throttle*100);
  const patch:Partial<Controls>={throttle:engineKeys.throttle};
  if(keyboardClutchHeld!==engineKeys.clutchHeld){keyboardClutchHeld=engineKeys.clutchHeld;patch.clutch=keyboardClutchHeld?0:1;input('clutch').value=String(patch.clutch*100);}
  control(patch, claim);
  if (backend === 'demo') send('starter',{value:engineKeys.starter||pointerStarter});
  else void flushNativeCommand(claim);
}
function releaseKeys(cancelAutoStarter=true) {
  const changed = engineKeys.release() || pointerStarter;
  pointerStarter = false; if(cancelAutoStarter)starterUntil = 0;
  if (changed) applyKeys(false);
}
function typingTarget(target: EventTarget | null, code?: string) {
  if (target instanceof HTMLElement && target.closest('#garage-tuning-slot')) return true;
  // A closed native select retains focus after committing an option. Engine
  // letter shortcuts return to driving; arrow keys still navigate the select.
  const drivingLetter=code!==undefined&&['KeyQ','KeyW','KeyE','KeyR','KeyA','KeyS'].includes(code);
  return target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLSelectElement&&!(drivingLetter&&target.id==='three-camera')) || (target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox'));
}
window.addEventListener('keydown', e => {
  if(tuningApplying||tuningRecovery)return;
  if(e.code==='Escape'&&typingTarget(e.target)){
    (e.target as HTMLElement).blur();releaseKeys();e.preventDefault();return;
  }
  if (typingTarget(e.target,e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
  if(e.target instanceof HTMLSelectElement)e.target.blur();
  const action = engineKeys.down(e.code);
  if (!action) { if(['ArrowUp','ArrowDown','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();return; }
  e.preventDefault();
  if (action === 'ignition') setIgnition(!nativeCommand.ignition);
  else if(action==='gear-up'||action==='gear-down'){const gear=shiftGear(nativeCommand.gear,action);control({gear});markGear(gear);}
  else { starterUntil = 0; applyKeys(); if (engineKeys.starter) enableEngineAudio(); }
});
window.addEventListener('keyup', e => { if (engineKeys.up(e.code)) { e.preventDefault(); applyKeys(false); } });
window.addEventListener('blur', ()=>releaseKeys());
document.addEventListener('focusin', e => { if (typingTarget(e.target)) releaseKeys(false); });

document.addEventListener('visibilitychange', () => {
  paused = document.hidden; send('pause', { value: paused }); releaseKeys();
  const root=el('app');root.dataset.visibilityChanges=String(Number(root.dataset.visibilityChanges||0)+1);root.dataset.lastVisibility=String(Date.now());root.dataset.documentHidden=String(document.hidden);if(document.hidden)root.dataset.lastHiddenAt=String(Date.now());
  // Native audio keeps running when switching chats; release held keys only.
  if(backend==='core'){nativeCommand.active=true;void flushNativeCommand();}
  else if(paused)audio.silence();
  else audio.setVolume(audio.volume,audio.muted);
});

function samples(series: string, color: string, key: keyof State, data = history): Series { return { name: series, color, values: data.filter(s => typeof s[key] === 'number' && Number.isFinite(s[key])).map(s => [s.t!, s[key] as number]) }; }
const legend = (id: string, series: Series[]) => { el(id).innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join(''); };
function renderCharts() {
  const historyPane = document.getElementById('history-pane');
  if (page === 'mechanics' && (historyPane?.hidden || !historyPane?.closest('details')?.open)) return;
  const recent = history.filter(s => (s.t || 0) > (viewState?.t || 0) - 60);
  const metric = select('live-metric').value;
  const liveSeries = metric === 'temperature' ? [samples('Motorblock', '#ddb17b', 'engineC', recent), samples('Kühlmittel', '#6dc9be', 'coolantC', recent), samples('Kühler', '#82a9d2', 'radiatorC', recent)] : metric === 'torque' ? [samples('Motor', '#6dc9be', 'torqueNm', recent), samples('Last', '#ddb17b', 'dynoNm', recent)] : [samples('Motor · 1/min', '#6dc9be', 'rpm', recent)];
  if (page === 'mechanics') { legend('live-legend', liveSeries); drawChart(el<HTMLCanvasElement>('live-chart'), liveSeries, metric === 'rpm' ? '1/min' : metric === 'torque' ? 'Nm' : '°C', metric === 'rpm' ? 7000 : undefined); }
  if (page === 'cooling') {
    const heat = select('thermal-metric').value === 'heat';
    const series = heat ? [samples('Wärmeeintrag · angenommen', '#ddb17b', 'heatInKw', thermalHistory), samples('An die Umgebung', '#82a9d2', 'heatOutKw', thermalHistory)] : [samples('Motorblock', '#ddb17b', 'engineC', thermalHistory), samples('Kühlmittel', '#6dc9be', 'coolantC', thermalHistory), samples('Kühler', '#82a9d2', 'radiatorC', thermalHistory)];
    legend('thermal-legend', series); drawChart(el<HTMLCanvasElement>('thermal-chart'), series, heat ? 'kW' : '°C');
  }
  if (page === 'experiments') {
    const key = (select('comparison-metric').value || 'rpm') as keyof State;
    const series = result ? [samples('A', '#6dc9be', key, result.A), samples('B', '#ddb17b', key, result.B)] : [];
    drawChart(el<HTMLCanvasElement>('comparison-chart'), series, key.includes('C') ? '°C' : key === 'speedKmh' ? 'km/h' : key === 'wheelTorqueNm' || key === 'torqueNm' ? 'Nm' : '1/min');
  }
}
function renderValues() {
  const s = viewState;
  cockpitGauges.update(s);
  const start=button('start');
  start.textContent=nativeCommand.ignition?'Motor stoppen':'Motor starten';
  start.setAttribute('aria-pressed',String(nativeCommand.ignition));
  start.classList.toggle('motor-running',nativeCommand.ignition);
  tuningPanel?.setEngineRunning(nativeCommand.ignition||!!s?.starter);
  const ignitionButton = document.getElementById('ignition-toggle');
  ignitionButton?.setAttribute('aria-pressed',String(nativeCommand.ignition));
  if (ignitionButton) ignitionButton.textContent = `A · Zündung ${nativeCommand.ignition?'AN':'AUS'}`;
  document.getElementById('starter-hold')?.setAttribute('aria-pressed',String(engineKeys.starter||pointerStarter));
  setText('rpm', fmt(s?.rpm)); setText('torque', fmt(s?.torqueNm)); setText('power', fmt(s?.powerKw, 1)); setText('speed', fmt(s?.speedKmh, 1));
  el('rpm-bar').style.width = `${Math.min(100, (s?.rpm || 0) / 7000 * 100)}%`;
  setText('actual-throttle', `${fmt(s?.actualThrottle === undefined ? undefined : s.actualThrottle * 100)} %`);
  const states = { stopped: 'Motor aus', cranking: 'Anlasser', running: 'Motor läuft', coasting: 'Läuft aus', stalled: 'Motor abgewürgt' };
  const quality=backend==='core'&&nativeState?.simulationHz&&nativeState.simulationHz<10000?` · Echtzeit ${fmt(nativeState.simulationHz)} Hz`:'';
  setText('engine-status', (paused && backend === 'demo' ? 'Pausiert' : s?.engineStatus ? states[s.engineStatus] : 'Keine Verbindung')+quality);
  el('engine-dot').classList.toggle('running', s?.engineStatus === 'running');
  setText('selected-gear',s?String(s.gear||'N'):'—');
  setText('selected-clutch',s?.clutchState==='locked'?'Kraftschluss':s?.clutchState==='slip'?'Kupplung schlupft':'Kupplung offen');
  if(s?.gear!==undefined)markGear(s.gear);
  setText('gear-readout', s ? s.gear ? `Gang ${s.gear} · ${s.clutchState === 'locked' ? 'Kraftschluss' : s.clutchState === 'slip' ? 'Schlupf' : 'Kupplung offen'}` : 'Neutral · entkoppelt' : 'Keine Telemetrie');
  setText('temp-summary', `${fmt(s?.coolantC, 1)} °C`);
  setText('sim-clock', `${fmt(s?.t, 1)} s Simulationszeit`);
  setText('drive-rpm', fmt(s?.rpm)); setText('wheel-rpm', fmt(s?.wheelRpm));
  const ratio = s?.totalRatio ?? (s?.gear ? config.vehicle.gears[s.gear - 1] * config.vehicle.finalDrive : 0);
  setText('drive-ratio', s ? s.gear ? fmt(ratio, 2) : 'N' : '—');
  setText('wheel-torque', `${fmt(s?.wheelTorqueNm)} Nm`); setText('slip-rpm', `${fmt(s?.slipRpm)} 1/min`); setText('clutch-heat', `${fmt(s?.clutchHeatKw, 1)} kW`);
  setText('clutch-state', s?.clutchState ? { neutral: 'Neutral', open: 'Getrennt', slip: 'Schlupf', locked: 'Kraftschluss' }[s.clutchState] : backend === 'core' && s ? 'Native Kupplung' : '—');
  setText('kinematics', s?.clutchState === 'locked' ? `${fmt(s.rpm)} 1/min = ${fmt(s.wheelRpm)} 1/min × ${fmt(ratio, 3)}. Motor und Rad bewegen sich gekoppelt.` : s?.clutchState === 'slip' ? 'Kupplung schlupft: Die Differenz der Drehzahlen erzeugt Verlustwärme.' : 'Motor und Rad können sich unabhängig drehen. Neutral oder geöffnete Kupplung.');
  setText('heat-in', s?.thermalHalted?'—':`${fmt(s?.heatInKw, 1)} kW`); setText('heat-out', s?.thermalHalted?'—':`${fmt(s?.heatOutKw, 1)} kW`); setText('energy-error', `${fmt(s?.energyResidualJ, 3)} J`);
  setText('thermal-slope', s?.thermalHalted?'—':`${fmt(s?.coolantSlopeCS === undefined ? undefined : s.coolantSlopeCS * 60, 2)} °C/min`);
  setText('thermal-clock', `${fmt(s?.thermalTimeS)} s Wärmeverlauf · ${s?.thermalHalted?'angehalten':thermalRate+'×'}`);
  const status=s?.thermalStatus??'cold';
  const statusLabels={cold:'Kaltlauf',normal:'Betriebsbereich',hot:'Zu warm',limit:'Modellgrenze erreicht'};
  setText('cooling-status',statusLabels[status]);el('cooling-status').dataset.status=status;
  el('app').dataset.thermalStatus=status;
  const coolantGauge=document.querySelector<HTMLElement>('[data-gauge="coolantC"] h2');if(coolantGauge)coolantGauge.textContent=s?.thermalHalted?'KÜHLMITTEL · GRENZE':'KÜHLMITTEL';
  setText('thermostat-state',`Thermostat ${fmt((s?.thermostatOpen??0)*100)} % offen`);
  setText('radiator-flow',`Kühlerzweig ${fmt(s?.radiatorFlowLMin??0,1)} L/min`);
  setText('fan-state',`Lüfter ${config.cooling.fan===1?'Auto · ':''}${fmt((s?.fanDuty??0)*100)} %`);
  el('thermal-alert').hidden=!s?.thermalHalted;
  el('thermal-alert').textContent=s?.thermalHalted?'Wärmerechnung angehalten: Grenze des Flüssigmodells erreicht (120 °C Kühlmittel oder 160 °C Block). Für höhere Temperaturen fehlen Sieden, Druck und Kühlmittelverlust. Kühlleistung erhöhen und den Kühlkreis kalt oder warm neu setzen. Der native Motor läuft unabhängig weiter.':'';
  setText('thermal-feedback',s?.thermalHalted?'Keine gültigen Live-Wärmeflüsse mehr · Kühlkreis neu setzen.':config.cooling.flowLMin===0?'Pumpe aus: Keine Zirkulation durch den Kühler. Restwärme gelangt nur über den kleinen verbleibenden Wärmeübergang ins Kühlmittel.':`${config.cooling.heatMode==='manual'?`Dauerheizung ${fmt(config.cooling.manualHeatKw)} kW · wirkt auch bei Motor aus.`:'Wärmequelle folgt dem Motor.'} ${thermalRate>1?`Wärme-Zeitraffer ${thermalRate}× aktiv.`:'Wärmeverlauf in Echtzeit.'} Thermostat verteilt ${fmt(config.cooling.flowLMin)} L/min auf Bypass und Kühler.`);
  const cylinder = backend==='core'?cycleSample(s,visualAngle,focusCylinder,slow):s?.cylinders?.[focusCylinder - 1];
  setText('cylinder-pressure', cylinder ? `${fmt(cylinder.pressureKpa / 100, 2)} bar abs.` : '—');
  setText('manifold-pressure', s?.manifoldKpa === undefined ? '—' : `${fmt(s.manifoldKpa / 100, 2)} bar abs.`);
  setText('cylinder-stage', ['Arbeit','Ausstoß','Ansaugen','Verdichten'][pistonGeometry(visualAngle,focusCylinder,config.engine.strokeMm,config.engine.rodMm).stage]);
  button('start').disabled = tuningApplying||(backend==='core'&&(!nativeState||!nativeTuningKey||tuningRecovery)&&!nativeCommand.ignition);
  button('rev').disabled = button('launch').disabled = button('start').disabled;
  if (backend === 'demo') setText('footer-state', paused ? 'Demo pausiert · Tab im Hintergrund' : 'Demo · 1 ms Modellschritt · Ton aus gemeinsamem Zustand');
}
function record(s: ViewState) {
  if (s.t === undefined) return;
  if (s.t < lastSample) { history = []; lastSample = -1; }
  if (s.t - lastSample < 0.099) return;
  history.push({ ...s,cycle:undefined,cycles:undefined,valveCurves:undefined }); lastSample = s.t;
  if (history.length > 6000) history.shift();
}
worker.addEventListener('message', ({ data }) => {
  if (data.type === 'error') { toast(data.message, true); return; }
  if (data.type === 'state') {
    demoState = data.state as State;
    if (backend === 'demo') { viewState = demoState; audio.update(demoState); record(viewState); }
    else if (nativeState) viewState = { ...nativeState, ...thermalValues() };
    if (!thermalHistory.length || demoState.thermalTimeS - thermalHistory.at(-1)!.t! > .2) { thermalHistory.push({ ...demoState, t: demoState.thermalTimeS }); if (thermalHistory.length > 6000) thermalHistory.shift(); }
  }
});
worker.addEventListener('error', () => { toast('Der Simulationsworker ist ausgefallen. Bitte neu laden.', true); audio.silence(); viewState = null; setText('connection', 'Simulationsfehler'); });
function animate(now: number) {
  const renderStarted = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if (!paused && !reducedMotion) animationClock += dt;
  const drawingConfig = { ...config, engine: { ...config.engine }, tuning: confirmedVisualTuning };
  if (backend === 'core' && nativeState) drawingConfig.engine = { ...drawingConfig.engine, ...nativeState.geometry };
  if (!paused && (page === 'mechanics' || page === 'gearing' || page === 'cooling')) {
    const omega = viewState?.omega ?? (viewState?.rpm || 0) * TAU / 60;
    if (!reducedMotion) {
      let nativeDrive:{time:number;extrapolation:number}|undefined;
      if(!slow&&backend==='core'&&nativeState){
        const extrapolation=omega*Math.max(0,Math.min(.1,(Date.now()-nativeState.timestampMs)/1000));
        visualAngle=mod(nativeState.crankAngle+extrapolation,TAU*2);
        nativeDrive={time:nativeState.t,extrapolation};
      }else visualAngle=advanceVisualAngle(visualAngle,omega,dt,slow);
      visualDriveAngle=drivePhase.update({phase:visualAngle,omega,elapsed:dt,slow,active:!document.hidden&&(backend!=='core'||!!nativeState),native:nativeDrive});
    }else drivePhase.hold();
    if (page === 'mechanics') {
      if(engineView.is3d())engineView.render(viewState,drawingConfig,visualAngle,animationClock,visualDriveAngle);
      else drawEngineSection(el<HTMLCanvasElement>('engine-canvas'), viewState, drawingConfig, visualAngle, focusCylinder, slow,detailView,animationClock);
    }
    if (page === 'gearing') { const rpm = viewState?.rpm || 0; const factor = slow && rpm > 60 ? 60/rpm : 1; wheelAngle = mod(wheelAngle + (viewState?.wheelRpm || 0)*TAU/60*factor*dt, TAU); drawDrive(el<HTMLCanvasElement>('drive-canvas'), viewState, visualAngle, wheelAngle); }
  }else drivePhase.hold();
  if (page === 'cooling') drawCoolantLoop(el<HTMLCanvasElement>('cooling-canvas'), viewState, drawingConfig, animationClock, visualAngle);
  if (now - lastUi > 50) { renderValues(); lastUi = now; }
  if (now - lastChart > 250) { renderCharts(); lastChart = now; }
  renderMonitor.sample(now,performance.now()-renderStarted);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function invalidateResult() { result = null; comparisonRevision++; button('experiment-json').disabled = true; button('experiment-csv').disabled = true; el('experiment-results').innerHTML = '<p>Starte einen Vergleich. Jeder Lauf beginnt mit 0 1/min, 0 km/h und identischen Temperaturen.</p>'; setText('experiment-proof', 'Noch kein Messlauf für dieses Paar'); renderCharts(); }
const questions = { inertia: 'Wie viel langsamer dreht ein schweres Schwungrad hoch?', gearing: 'Was verändert eine längere Übersetzung am Rad?', cooling: 'Wie stark verändert der Kühler den Temperaturverlauf?' };
function pairLabel(c: Config) {
  if (experimentKind === 'inertia') return `J Schwungrad: ${fmt(c.engine.flywheelKgM2, 2)} kg·m²\nGasverzögerung im Versuch: 0 s`;
  if (experimentKind === 'gearing') return `Gang 2: ${fmt(c.vehicle.gears[1], 2)}\nAchse: ${fmt(pair.A.vehicle.finalDrive, 2)} · Fahrzeug: ${fmt(pair.A.vehicle.massKg)} kg`;
  return `Kühler: ${fmt(c.cooling.radiatorWPerK)} W/K\nPumpe: ${fmt(c.cooling.flowLMin)} L/min · Lüfter ${c.cooling.fan}`;
}
function refreshExperiment() {
  setText('experiment-question', questions[experimentKind]); setText('scenario', SCENARIOS[experimentKind]);
  setText('config-a-label', pairLabel(pair.A)); setText('config-b-label', pairLabel(pair.B));
  const options = experimentKind === 'inertia' ? [['rpm', 'Drehzahl · 1/min'], ['torqueNm', 'Motordrehmoment · Nm']] : experimentKind === 'gearing' ? [['speedKmh', 'Geschwindigkeit · km/h'], ['wheelTorqueNm', 'Raddrehmoment · Nm'], ['rpm', 'Motordrehzahl · 1/min']] : [['coolantC', 'Kühlmittel · °C'], ['engineC', 'Motorblock · °C'], ['radiatorC', 'Kühler · °C']];
  select('comparison-metric').innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  setText('controlled-variables', experimentKind === 'inertia' ? 'A ist die gemeinsame Basis. Aus B wird ausschließlich die Schwungrad-Trägheit übernommen; die Gasverzögerung ist für beide null.' : experimentKind === 'gearing' ? 'A ist die gemeinsame Basis. Aus B wird ausschließlich die Übersetzung von Gang 2 übernommen. Motor, Masse, Achse und Radradius bleiben gleich.' : 'Motor und Fahrzeug stammen aus A. Kühlparameter stammen jeweils aus A/B; beide beginnen bei der Umgebungstemperatur von A und erhalten25kW bis zum Laufende. An der Modellgrenze endet der jeweilige Verlauf.');
}
document.querySelectorAll<HTMLButtonElement>('[data-experiment]').forEach(b => b.addEventListener('click', () => {
  experimentKind = b.dataset.experiment as ExperimentKind;
  pair = loadPair(experimentKind); invalidateResult(); refreshExperiment();
  document.querySelectorAll('[data-experiment]').forEach(e => e.classList.toggle('active', (e as HTMLElement).dataset.experiment === experimentKind));
}));
function persistPair() { try { localStorage.setItem('engine-playground-pair-' + experimentKind, JSON.stringify(pair)); } catch { toast('Der Browser konnte A/B nicht dauerhaft speichern.', true); } }
function loadPair(kind: ExperimentKind) {
  try { const saved = localStorage.getItem('engine-playground-pair-' + kind); if (saved) { const raw = JSON.parse(saved); return { A: validateConfig(raw.A), B: validateConfig(raw.B) }; } } catch { /* Invalid data is ignored. */ }
  return examplePair(kind, config);
}
['a', 'b'].forEach(key => el('save-' + key).addEventListener('click', () => { pair[key.toUpperCase() as 'A' | 'B'] = copyConfig(config); invalidateResult(); refreshExperiment(); persistPair(); toast(`Konfiguration ${key.toUpperCase()} im Browser gespeichert.`); }));
el('example-pair').addEventListener('click', () => { pair = examplePair(experimentKind, config); invalidateResult(); refreshExperiment(); persistPair(); toast('Beispielpaar mit kontrollierter Änderung geladen.'); });
el('run-experiment').addEventListener('click', () => {
  button('run-experiment').disabled = true; setText('run-experiment', 'Messläufe werden berechnet …');
  runningRevision = comparisonRevision;
  experimentWorker.postMessage({ kind: experimentKind, A: pair.A, B: pair.B });
});
experimentWorker.addEventListener('message', ({ data }) => {
  button('run-experiment').disabled = false; button('run-experiment').innerHTML = `${icon('play', 17)} Vergleich starten`;
  if (data.error) { toast(data.error, true); return; }
  if (runningRevision !== comparisonRevision) { toast('Das Paar wurde während des Laufs verändert. Bitte erneut starten.'); return; }
  result = data.result; renderExperimentResults(); renderCharts();
});
experimentWorker.addEventListener('error', () => { button('run-experiment').disabled = false; setText('run-experiment', 'Vergleich starten'); toast('Der Versuch konnte nicht berechnet werden.', true); });
function renderExperimentResults() {
  if (!result) return;
  const r = result, a = r.A.at(-1)!, b = r.B.at(-1)!;
  let rows: [string, string, string][];
  if (r.kind === 'inertia') {
    const at = (data: State[], t: number) => data.reduce((best, x) => Math.abs(x.t - t) < Math.abs(best.t - t) ? x : best);
    const rise = (data: State[]) => { const reached = data.find(x => x.t >= 2 && x.t <= 5 && x.rpm >= 4000); return reached ? `${fmt(reached.t - 2, 2)} s` : 'nicht erreicht'; };
    const fall = (data: State[]) => { const reached = data.find(x => x.t >= 5 && x.rpm <= 2000); return reached ? `${fmt(reached.t - 5, 2)} s` : 'nicht erreicht'; };
    rows = [['Von Gasbeginn bis 4000 1/min', rise(r.A), rise(r.B)], ['Drehzahl bei Gasende · 5 s', `${fmt(at(r.A, 5).rpm)} 1/min`, `${fmt(at(r.B, 5).rpm)} 1/min`], ['Nach Gasende bis 2000 1/min', fall(r.A), fall(r.B)]];
  } else if (r.kind === 'gearing') {
    const lockedMean = (data: State[]) => { const steady = data.filter(s => s.t >= 5 && s.clutchState === 'locked'); return steady.length ? steady.reduce((sum, x) => sum + x.wheelTorqueNm, 0) / steady.length : undefined; };
    rows = [['Geschwindigkeit nach 18 s', `${fmt(a.speedKmh, 1)} km/h`, `${fmt(b.speedKmh, 1)} km/h`], ['Raddrehmoment · Mittel ab 5 s, Kraftschluss', `${fmt(lockedMean(r.A))} Nm`, `${fmt(lockedMean(r.B))} Nm`], ['Motordrehzahl nach 18 s', `${fmt(a.rpm)} 1/min`, `${fmt(b.rpm)} 1/min`]];
  } else rows = [['Laufende',`${a.thermalHalted?'Modellgrenze nach ':'Abgeschlossen · '}${fmt(a.t,1)} s`,`${b.thermalHalted?'Modellgrenze nach ':'Abgeschlossen · '}${fmt(b.t,1)} s`],['Kühlmittel am Laufende', `${fmt(a.coolantC, 1)} °C`, `${fmt(b.coolantC, 1)} °C`], ['Motorblock am Laufende', `${fmt(a.engineC, 1)} °C`, `${fmt(b.engineC, 1)} °C`], ['Wärmeabfuhr am Laufende',a.thermalHalted?'—':`${fmt(a.heatOutKw, 1)} kW`,b.thermalHalted?'—':`${fmt(b.heatOutKw, 1)} kW`]];
  el('experiment-results').innerHTML = `<table><thead><tr><th scope="col">Ergebnis des Messlaufs</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  setText('experiment-proof', `${r.durationS} s · Δt ${r.dtS} s · Messpunkte A${r.A.length} / B${r.B.length}`);
  button('experiment-json').disabled = false; button('experiment-csv').disabled = false;
}
el('experiment-json').addEventListener('click', () => { if (result) download(`engine-playground-${result.kind}-AB.json`, JSON.stringify(result, null, 2)); });
function csv(data: ViewState[], label: string, mode: string, scenario: string) {
  const cols: [keyof State, string][] = [['t', 'time_s'], ['rpm', 'rpm_1_min'], ['crankAngle', 'crank_angle_rad'], ['pedal', 'pedal_fraction'], ['actualThrottle', 'throttle_fraction'], ['torqueNm', 'torque_Nm'], ['powerKw', 'power_kW'], ['dynoNm', 'dyno_load_Nm'], ['wheelTorqueNm', 'wheel_torque_Nm'], ['speedKmh', 'speed_km_h'], ['wheelRpm', 'wheel_rpm_1_min'], ['gear', 'gear'], ['clutch', 'clutch_fraction'], ['slipRpm', 'slip_1_min'], ['engineC', 'engine_C'], ['coolantC', 'coolant_C'], ['radiatorC', 'radiator_C'], ['heatInKw', 'assumed_heat_in_kW'], ['heatOutKw', 'heat_out_kW'], ['energyResidualJ', 'energy_residual_J']];
  return `run,mode,scenario,${cols.map(x => x[1]).join(',')},clutch_state,thermal_status,thermal_halted\n` + data.map(s => `${label},${mode},${scenario},${cols.map(([key]) => typeof s[key] === 'number' && Number.isFinite(s[key]) ? (s[key] as number).toFixed(6) : '').join(',')},${s.clutchState || ''},${s.thermalStatus||''},${s.thermalHalted??''}`).join('\n') + '\n';
}
el('experiment-csv').addEventListener('click', () => { if (result) { const a = csv(result.A, 'A', 'demo', result.kind), b = csv(result.B, 'B', 'demo', result.kind); download(`engine-playground-${result.kind}-AB.csv`, a + b.slice(b.indexOf('\n') + 1), 'text/csv;charset=utf-8'); } });
el('csv-export').addEventListener('click', () => { if (!history.length) { toast('Noch keine Zeitreihe vorhanden. Starte zuerst den Motor oder einen Wärmeeintrag.'); return; } download('engine-playground-live.csv', csv(history, 'live', backend, 'sandbox'), 'text/csv;charset=utf-8'); });
el('config-export').addEventListener('click', () => download('engine-playground-config.json', JSON.stringify({ schemaVersion: 1, mode: backend, preset: 'Playground I6', config }, null, 2)));
el('config-import').addEventListener('click', () => input('import-file').click());
input('import-file').addEventListener('change', async () => {
  try { const file = input('import-file').files?.[0]; if (!file) return; if (file.size > 50000) throw new Error('Die Konfigurationsdatei ist zu groß.'); const raw = JSON.parse(await file.text()); if (raw.schemaVersion !== 1) throw new Error('Unbekannte Konfigurationsversion.'); config = validateConfig(raw.config);config.sound.preset='m54';config.engine.boreMm=84;config.engine.strokeMm=89.6;config.engine.rodMm=135;resetLive(false); toast('Konfiguration geladen und Zustand zurückgesetzt.'); }
  catch (error) { toast(error instanceof Error ? error.message : 'Konfiguration konnte nicht geladen werden.', true); }
  input('import-file').value = '';
});

select('backend').addEventListener('change', () => {
  stopMotor(); audio.disconnect();
  if (backend === 'core') fetch('/api/core/command', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({controls:nativeCommand,config,active:false,ignition:false,starter:false,reset:false})}).then(r=>r.json()).catch(()=>{});
  backend = select('backend').value as 'demo' | 'core';
  nativeState = null; viewState = null; history = []; thermalHistory = []; lastSample = -1;
  send('backend', { value: backend }); resetLive(false); send('pause', { value: paused });
  updateConnection(); updateHeatAssumption();
});
function updateConnection() {
  const connected = backend === 'core' && !!nativeState;
  const note=document.getElementById('garage-connection-note');
  if(note){
    note.hidden=backend!=='core'||(connected&&!tuningRecovery);
    note.textContent=tuningRecovery?'Der Teilezustand wird erneut bestätigt. Danach kannst du starten.':'Der Motor ist gerade nicht verbunden. Die Verbindung wird erneut hergestellt.';
  }
  const label=backend==='demo'?'Demo':connected?'Physischer Kern':'Verbindet …';
  if(el('connection').dataset.state!==label){
    el('connection').dataset.state=label;
    el('connection').className = 'connection-pill' + (backend === 'demo' ? '' : connected ? ' connected' : ' disconnected');
    el('connection').innerHTML = '<i></i>' + label;
  }
  el('mode-note').classList.toggle('native', backend === 'core');
  const physicsHz=nativeState?.simulationHz??10000;
  setText('mode-note', backend === 'demo' ? 'Vereinfachtes Lernmodell · eigener synthetischer Ton' : connected ? `AngeTheGreat: originaler Motor- und Soundkern · ${physicsHz<10000?`Echtzeitmodus ${fmt(physicsHz)} Hz · geringere numerische Auflösung als die 10.000-Hz-Referenz`:'Referenzauflösung 10.000 Hz'} · Kühlung als separates Wärmemodell` : nativeReason);
  setText('torque-kind', backend === 'core' ? 'Gasdrehmoment · geglättet, vor Reibung' : 'Demo · an der Welle');
  if (backend === 'core') setText('footer-state', connected ? physicsHz<10000?`Echtzeitmodus ${fmt(physicsHz)} Hz · Auflösung reduziert · Ton ca. 1,2 s verzögert · Referenz: 10.000 Hz`:'Originaler C++-Kern · Referenzauflösung 10.000 Hz' : 'Motorkern getrennt · wartet auf frische Daten');
}
function thermalValues() {
  if (!demoState) return {};
  const {engineC,coolantC,radiatorC,heatInKw,heatOutKw,engineCoolantKw,energyResidualJ,thermalTimeS,coolantRadiatorKw,radiatorAmbientKw,coolantSlopeCS,thermostatOpen,radiatorFlowLMin,fanDuty,thermalHalted,thermalStatus}=demoState;
  return {engineC,coolantC,radiatorC,heatInKw,heatOutKw,engineCoolantKw,energyResidualJ,thermalTimeS,coolantRadiatorKw,radiatorAmbientKw,coolantSlopeCS,thermostatOpen,radiatorFlowLMin,fanDuty,thermalHalted,thermalStatus};
}
let pollBusy = false, commandBusy = false;
let lastNativeEvent = -Infinity, telemetryWindow = performance.now(), telemetryCount = 0;
const commandTimes = new Map<number, number>();
function acceptNativeState(data: {connected:boolean;state:NativeSnapshot|null;reason?:string;tuningKey?:string|null;tuningSequence?:number|null}) {
  if(backend!=='core')return;
  const wasConnected=!!nativeState;
  if(data.state?.valveCurves)cachedValveCurves=reuseValveCurves(cachedValveCurves,data.state.valveCurves);
  if(data.state?.cycles)cachedCycles=data.state.cycles;
  nativeState=data.connected&&data.state?{...data.state,valveCurves:cachedValveCurves,cycles:cachedCycles}:null;
  nativeTuningKey=data.connected?(data.tuningKey??null):null;
  nativeTuningSequence=data.connected?(data.tuningSequence??null):null;
  if (nativeTuningKey && nativeTuningSequence !== null && nativeState && nativeState.sequence >= nativeTuningSequence) {
    confirmedVisualTuning = tuningFromKey(nativeTuningKey);
  }
  el('app').dataset.tuningAppliedKey=nativeTuningKey??'';
  if(!tuningApplying&&nativeTuningKey){
    if(tuningRecovery&&nativeTuningKey===tuningKey(config.tuning)&&nativeTuningSequence!==null&&nativeState&&nativeState.sequence>=nativeTuningSequence)tuningRecovery=false;
    if(!tuningRecovery&&nativeTuningKey!==tuningKey(config.tuning)){
      config={...config,tuning:tuningFromKey(nativeTuningKey)};
      tuningPanel?.setApplied(config.tuning);
      send('configure',{config});
    }
  }
  nativeReason=data.reason||'Keine frischen Motordaten.';
  if(nativeState){
    const root=el('app');
    root.dataset.physicsHz=String(nativeState.simulationHz??'');
    root.dataset.physicsProcessingMs=String(nativeState.processingMs??'');
    root.dataset.telemetryAgeMs=String(Math.max(0,Date.now()-nativeState.timestampMs));
    root.dataset.simulationTime=String(nativeState.t);
    const sent=commandTimes.get(nativeState.sequence);
    if(sent!==undefined){root.dataset.controlApplyMs=String(Math.max(0,Date.now()-sent));for(const seq of commandTimes.keys())if(seq<=nativeState.sequence)commandTimes.delete(seq);}
    telemetryCount++;
    if(performance.now()-telemetryWindow>=1000){root.dataset.telemetryHz=(telemetryCount*1000/(performance.now()-telemetryWindow)).toFixed(1);telemetryWindow=performance.now();telemetryCount=0;}
    // Preserve locally claimed ignition while its command is still in flight.
    if(!hasControl&&!commandBusy&&!commandClaim){nativeCommand.ignition=!!nativeState.ignition;nativeCommand.gear=nativeState.gear??0;nativeCommand.clutch=nativeState.clutch??0;input('clutch').value=String(nativeCommand.clutch*100);}
    if(!wasConnected&&audio.context&&!paused){audio.setVolume(audio.volume,audio.muted);audio.enable('core', nativeState?.simulationHz ?? 10000).catch(()=>{});}
    viewState={...nativeState,...thermalValues()};
    send('nativeHeat',{value:{heatW:(nativeState.estimatedHeatKw||0)*1000,speedMs:nativeState.velocity||0}});
    send('pause',{value:paused});record(viewState);
  }else{viewState=null;send('pause',{value:true});audio.silence();}
  updateConnection();
}
const nativeEvents=new EventSource('/api/core/events');
nativeEvents.onmessage=event=>{try{acceptNativeState(JSON.parse(event.data));lastNativeEvent=performance.now();}catch{/* HTTP watchdog handles an invalid/disconnected stream. */}};
window.addEventListener('pagehide',()=>nativeEvents.close());
setInterval(async () => {
  if (backend !== 'core' || pollBusy || performance.now()-lastNativeEvent<250) return;
  pollBusy = true;
  try {
    const response = await fetch('/api/core/state', { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!response.ok) throw new Error('Lokaler Motorkern nicht erreichbar.');
    acceptNativeState(await response.json());
  } catch (error) {
    if (backend === 'core') { nativeState = null; viewState = null; send('pause', { value: true }); audio.silence(); nativeReason = error instanceof Error ? error.message : 'Motorkern getrennt.'; }
  } finally { pollBusy = false; updateConnection(); }
}, 100);
let commandDirty = false, commandClaim = false,lastCommandSentAt=0,maxCommandGapMs=0;
async function flushNativeCommand(claim = false) {
  commandClaim ||= claim;
  if (backend !== 'core' || (!hasControl && !commandClaim)) return;
  if (commandBusy) { commandDirty = true; return; }
  commandBusy = true; commandDirty = false;
  const claimControl = commandClaim; commandClaim = false;
  nativeCommand.starter = engineKeys.starter || pointerStarter || performance.now() < starterUntil;
  const reset = nativeCommand.reset;
  const sentAt=Date.now();
  if(lastCommandSentAt){maxCommandGapMs=Math.max(maxCommandGapMs,sentAt-lastCommandSentAt);el('app').dataset.commandMaxGapMs=String(maxCommandGapMs);}
  lastCommandSentAt=sentAt;
  try {
    const response = await fetch('/api/core/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, focusCylinder, claim: claimControl, controls: nativeCommand, config, active: backend==='core'||!paused, ignition: nativeCommand.ignition, starter: nativeCommand.starter, reset }), signal: AbortSignal.timeout(1500) });
    const payload = await response.json();
    el('app').dataset.commandRttMs=String(Date.now()-sentAt);
    if(payload.accepted&&Number.isFinite(payload.sequence)){commandTimes.set(payload.sequence,sentAt);if(commandTimes.size>30)commandTimes.delete(commandTimes.keys().next().value!);}
    hasControl = response.ok && payload.accepted === true;
    if (response.ok && payload.accepted && reset) nativeCommand.reset = false;
    if (!response.ok) nativeReason = payload.error || 'Bedienung konnte nicht übernommen werden.';
  } catch { /* The independent state watchdog reports disconnection. */ }
  finally { commandBusy = false; if (commandDirty) void flushNativeCommand(); }
}
setInterval(() => { void flushNativeCommand(); },100);

pair = loadPair(experimentKind);
fillSettings(); syncControls(); refreshExperiment(); openPage(location.hash.slice(1) || 'mechanics'); updateConnection();
send('backend', { value: backend }); send('pause', { value: paused });

// Read-only diagnostics for local acceptance tests, without bypassing UI actions.
Object.defineProperty(window, '__playground', { get: () => ({ mode: backend, state: viewState, config: copyConfig(config), tuning:{applying:tuningApplying,confirmedKey:nativeTuningKey,sequence:nativeTuningSequence,visualKey:tuningKey(confirmedVisualTuning),renderer:document.body.dataset.workshop}, result, historyLength: history.length, get audio(){return { state: audio.context?.state ?? 'not-enabled', volume: audio.volume, muted: audio.muted, sampleRate: audio.context?.sampleRate ?? null, ...audio.stats, ...audio.signal() };}, get engine3d(){return engineView.diagnostics();}, experimentKind, detailView, focusCylinder, thermalRate, visualAngle, animationClock, slow, reducedMotion }), configurable: false });

installAudioTimeline({ audio, state: () => viewState, mode: () => backend, config: () => copyConfig(config), stopMotor });
installClassicShell({ state: () => viewState, audio });
const cockpitGauges = installCockpitGauges(el('garage-cockpit'), { rpmLimit: 6500 });
installEngineSectionControls();
const engineView=installEngineView();
const garageConnectionNote=document.createElement('p');
garageConnectionNote.id='garage-connection-note';garageConnectionNote.className='garage-connection-note';
garageConnectionNote.setAttribute('role','status');garageConnectionNote.hidden=true;
document.querySelector('.engine-three-panel')!.prepend(garageConnectionNote);
document.body.dataset.workshop = automationPreview ? 'automation' : 'classic';
const workshopOptions = {initialSelection:config.tuning,onApply:applyGarageTuning};
if (automationPreview) {
  try {
    const {installAutomationWorkshop} = await import('./automation-workshop');
    tuningPanel = installAutomationWorkshop(el('garage-tuning-slot'), {...workshopOptions, initialSelection: config.tuning});
  } catch {
    document.body.dataset.workshop = 'classic-fallback';
    tuningPanel = installTuningPanel(el('garage-tuning-slot'), workshopOptions);
    toast('Die neue Motorbauansicht konnte nicht geladen werden. Die bisherige Teileauswahl ist verfügbar.', true);
  }
} else tuningPanel = installTuningPanel(el('garage-tuning-slot'), workshopOptions);

async function waitForAppliedTuning(expectedKey:string,issuedAt:number,timeoutMs=18000){
  const deadline=performance.now()+timeoutMs;
  while(performance.now()<deadline){
    if(nativeTuningKey===expectedKey&&nativeTuningSequence!==null&&nativeState&&nativeState.sequence>=nativeTuningSequence&&nativeState.timestampMs>=issuedAt&&!nativeState.ignition)return;
    await new Promise<void>(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Der Motorkern hat den Teilewechsel nicht bestätigt. Bitte erneut versuchen.');
}

async function applyGarageTuning(selection:TuningSelection){
  if(tuningApplying)throw new Error('Der Teilewechsel läuft bereits.');
  const next=validateTuning(selection),previous=validateTuning(config.tuning),expectedKey=tuningKey(next);
  stopMotor();
  tuningApplying=true;
  const controls=document.querySelector<HTMLElement>('.control-panel');
  controls?.setAttribute('inert','');
  try{
    Object.assign(nativeCommand,{ignition:false,starter:false,throttle:0,gear:0,clutch:0,dynoEnabled:false,brake:0});
    input('throttle').value='0';input('clutch').value='0';markGear(0);syncControls();
    config={...config,tuning:next};
    send('configure',{config});
    const issuedAt=Date.now();
    await flushNativeCommand(true);
    await waitForAppliedTuning(expectedKey,issuedAt);
    history=[];lastSample=-1;visualAngle=nativeState?.crankAngle??0;visualDriveAngle=drivePhase.reset(visualAngle);tuningRecovery=false;
    toast('Teile eingebaut. Du kannst den Motor starten.');
  }catch(error){
    tuningRecovery=true;
    config={...config,tuning:previous};send('configure',{config});
    const rollbackIssuedAt=Date.now();
    await flushNativeCommand(true);
    try{await waitForAppliedTuning(tuningKey(previous),rollbackIssuedAt,10000);tuningRecovery=false;}
    catch{toast('Die Motorverbindung fehlt. Start ist bis zur Bestätigung der Teile gesperrt.',true);}
    throw error;
  }finally{
    tuningApplying=false;controls?.removeAttribute('inert');
  }
}

el('ignition-toggle').addEventListener('click', () => setIgnition(!nativeCommand.ignition));
const starterButton = el('starter-hold');
starterButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return; event.preventDefault();
  starterButton.setPointerCapture(event.pointerId); pointerStarter = true; starterUntil = 0; applyKeys(); enableEngineAudio();
});
function releaseStarter() { if (pointerStarter) { pointerStarter = false; applyKeys(false); } }
['pointerup','pointercancel','lostpointercapture','blur'].forEach(type => starterButton.addEventListener(type,releaseStarter));
starterButton.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); pointerStarter = true; applyKeys(); enableEngineAudio(); } });
starterButton.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); releaseStarter(); } });
