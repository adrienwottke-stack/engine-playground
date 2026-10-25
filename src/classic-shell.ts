import './classic-shell.css';
import './cockpit-gauges.css';
import type { EngineAudio } from './audio';
import type { ViewState } from './drawing';

type Options = { state: () => ViewState | null; audio: EngineAudio };

/** Keep the original control nodes connected for the motor controller. */
function legacyRegion(id: string) {
  const region = document.createElement('div');
  region.id = id;
  region.className = 'garage-legacy';
  region.hidden = true;
  region.inert = true;
  region.setAttribute('aria-hidden', 'true');
  return region;
}

export function installClassicShell(_options: Options) {
  document.body.classList.add('classic-ui');
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const workshop = document.querySelector<HTMLElement>('.workshop')!;
  const main = document.querySelector<HTMLElement>('.main-column')!;
  const controls = document.querySelector<HTMLElement>('.control-panel')!;
  const enginePanel = document.querySelector<HTMLElement>('.engine-panel')!;
  const legacy = legacyRegion('garage-legacy-controls');
  const engineLegacy = legacyRegion('garage-engine-legacy');
  document.getElementById('app')!.append(legacy);

  // Reuse the existing values and event-bound controls instead of copying them.
  const connection = document.getElementById('connection')!;
  document.querySelector('.header-center')!.replaceChildren(connection);
  const brand = document.querySelector<HTMLAnchorElement>('.brand')!;
  brand.innerHTML = '<span class="classic-logo" aria-hidden="true">EP</span><span>ENGINE PLAYGROUND<small>MOTORWERKSTATT</small></span>';
  brand.setAttribute('aria-label', 'Engine Playground – Motorwerkstatt');

  const engineName = document.getElementById('engine-name')!;
  const readings = document.querySelector<HTMLElement>('.readings')!;
  const speedReading = document.getElementById('speed')!.closest('.reading')!;
  legacy.append(speedReading);
  readings.querySelectorAll('small').forEach(node => legacy.append(node));
  readings.setAttribute('aria-label', 'Geschwindigkeit und Drehzahl');
  readings.id = 'garage-cockpit';
  readings.classList.add('garage-instruments', 'garage-cockpit-host');
  legacy.append(readings.querySelector('.rpm-bar')!);
  readings.querySelector('.rpm-reading .reading-label')!.textContent = 'Drehzahl';
  document.getElementById('torque')!.closest('.reading')!.querySelector('.reading-label')!.textContent = 'Drehmoment';
  document.getElementById('power')!.closest('.reading')!.querySelector('.reading-label')!.textContent = 'Leistung';

  const startStop = document.querySelector<HTMLElement>('.start-stop')!;
  const start = document.getElementById('start')!;
  start.setAttribute('aria-pressed', 'false');
  legacy.append(document.getElementById('stop')!);
  const throttle = document.querySelector<HTMLElement>('.throttle-control')!;
  throttle.hidden = false;
  throttle.querySelector('label')!.textContent = 'Gas geben';
  legacy.append(throttle.querySelector('.actual-throttle')!);

  const gearBlock = document.querySelector<HTMLElement>('.gear-buttons')!.closest<HTMLElement>('.control-block')!;
  gearBlock.classList.add('gear-control');
  legacy.append(document.getElementById('brake')!.closest('label')!);
  const gearDisplay = document.createElement('div');
  gearDisplay.className = 'selected-gear';
  gearDisplay.innerHTML = '<div><span>Gang</span><small id="selected-clutch">Kupplung offen</small></div><strong id="selected-gear">N</strong>';
  gearBlock.prepend(gearDisplay);
  gearBlock.querySelector('.control-label')!.textContent = 'Gang wählen';

  const keyboard = document.createElement('div');
  keyboard.className = 'classic-key-controls';
  keyboard.setAttribute('aria-label', 'Tastatursteuerung');
  keyboard.innerHTML = `
    <div class="garage-ignition">
      <button id="ignition-toggle" aria-pressed="false">A · Zündung AUS</button>
      <button id="starter-hold" aria-pressed="false" title="S oder diese Taste halten">S · Anlasser halten</button>
    </div>
    <div class="garage-key-row"><span>Gas halten</span><p><kbd>Q</kbd> 1 % <kbd>W</kbd> 10 % <kbd>E</kbd> 20 % <kbd>R</kbd> 100 %</p></div>
    <div class="garage-key-row"><span>Schalten</span><p><kbd>Shift</kbd> Kupplung <span class="garage-shift-keys"><kbd>↑</kbd> hoch <kbd>↓</kbd> runter</span></p></div>`;

  const reset = document.getElementById('reset')!;
  reset.lastChild!.textContent = ' Motor zurücksetzen';
  const utility = document.createElement('div');
  utility.className = 'garage-reset';
  utility.append(reset);
  const heading = controls.querySelector<HTMLElement>('.panel-heading')!;
  heading.querySelector('h2')!.textContent = 'Am Steuer';
  // Everything remaining in the old sidebar is intentionally outside the UI.
  Array.from(controls.children).forEach(node => {
    if (![heading, startStop, throttle, gearBlock].includes(node as HTMLElement)) legacy.append(node);
  });
  controls.replaceChildren(heading, engineName, readings, startStop, throttle, gearBlock, keyboard, utility);

  const engineLive = enginePanel.querySelector<HTMLElement>('.engine-live')!;
  enginePanel.dataset.engineView = '3d';
  Array.from(enginePanel.children).forEach(node => engineLegacy.append(node));
  enginePanel.append(engineLive, engineLegacy);
  // Section controls are installed after this shell and can still find the 2D
  // canvas. Their legacy parent stays inert even when its children change.
  legacy.append(document.querySelector('[data-page="mechanics"] .chart-panel')!);
  const timeline = document.querySelector('.audio-timeline');
  if (timeline) legacy.append(timeline);
  main.querySelectorAll<HTMLElement>('[data-page]').forEach(section => {
    if (section.dataset.page !== 'mechanics') legacy.append(section);
  });
  legacy.append(document.querySelector('.side-nav')!, document.querySelector('.page-heading')!, document.getElementById('mode-note')!);

  const tuningSlot = document.createElement('section');
  tuningSlot.id = 'garage-tuning-slot';
  tuningSlot.className = 'garage-tuning-slot';
  tuningSlot.setAttribute('aria-label', 'Motor tunen');
  main.append(tuningSlot);

  const footer = document.querySelector<HTMLElement>('.workspace-footer')!;
  footer.firstElementChild!.textContent = 'Engine Playground · Simulation' + (document.documentElement.dataset.hostedAudio === 'true' ? ' · Server 4.000 Hz · Ton ca. 1,2 s verzögert' : '');
  legacy.append(document.getElementById('footer-state')!);
  workspace.replaceChildren(controls, main, footer);
  workshop.remove();
}
