import type { EngineThree } from './engine-three';
import type { ViewState } from './drawing';
import type { Config } from './model';
import { MEDIA } from './engine-3d-model';
import type { EnginePresentation } from './engine-3d-model';
import type { WorkshopLighting } from './engine-view-lighting';
import './engine-view.css';

/** Three global presentations keep the whole motor understandable. */
export function installEngineView() {
  const section = document.querySelector<HTMLElement>('.engine-panel')!;
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const panel = document.createElement('div');
  panel.className = 'engine-three-panel';
  panel.dataset.component = 'engine';
  panel.innerHTML = `
    <div class="engine-three-toolbar">
      <div class="three-presentations" role="group" aria-label="Motordarstellung">
        <button data-presentation="closed" aria-pressed="false">Geschlossen</button>
        <button data-presentation="cutaway" aria-pressed="true">Schnitt</button>
        <button data-presentation="flow" aria-pressed="false">Nur Fluss</button>
      </div>
      <div class="three-views">
        <label for="three-camera" class="sr-only">Kamerablick</label>
        <select id="three-camera" aria-label="Kamerablick">
          <option value="section" selected>Motorschnitt</option>
          <option value="overview">Gesamtansicht</option><option value="intake">Ansaugseite</option>
          <option value="exhaust">Abgasseite</option><option value="front">Steuertrieb</option><option value="top">Von oben</option>
        </select>
        <button id="three-camera-reset" aria-label="Kamera zurücksetzen" title="Kamera zurücksetzen"><span aria-hidden="true">↺</span><span>Kamera</span></button>
      </div>
      <div class="garage-view-status"></div>
      <div class="garage-slow-control"></div>
    </div>
    <div class="engine-three-stage">
      <div class="engine-three-host" aria-label="Drehbare 3D-Motoransicht"></div>
      <p class="three-loading" role="status">Motor wird aufgebaut …</p>
      <div class="three-stage-caption" aria-hidden="true">Ziehen: drehen · Rad / Pinch: zoomen</div>
      <div class="three-fallback" role="status" hidden><p>Die 3D-Ansicht ist gerade nicht verfügbar.</p><button id="three-retry">3D erneut laden</button></div>
    </div>`;
  section.append(panel);
  section.dataset.engineView = '3d';
  const slow = document.getElementById('slow')!.closest<HTMLElement>('label')!;
  slow.querySelector('span')!.textContent = 'Zeitlupe';
  slow.title = 'Nur die Animation läuft langsamer. Motor und Ton bleiben in Echtzeit.';
  panel.querySelector('.garage-slow-control')!.append(slow);
  panel.querySelector('.garage-view-status')!.append(section.querySelector('.engine-live')!);
  // Keep the old canvas and generated section inputs connected and inaccessible.
  for (const selector of ['.section-layers', '.engine-section-viewport', '.section-scroll-hint']) {
    const element = section.querySelector<HTMLElement>(selector);
    if (element) { element.hidden = true; element.inert = true; element.setAttribute('aria-hidden', 'true'); }
  }
  const host = panel.querySelector<HTMLElement>('.engine-three-host')!;
  const loading = panel.querySelector<HTMLElement>('.three-loading')!;
  const fallback = panel.querySelector<HTMLElement>('.three-fallback')!;
  const camera = panel.querySelector<HTMLSelectElement>('#three-camera')!;
  let presentation: EnginePresentation = 'cutaway';
  const presentationButtons = panel.querySelectorAll<HTMLButtonElement>('[data-presentation]');
  presentationButtons.forEach(button => button.addEventListener('click', () => {
    presentation = button.dataset.presentation as EnginePresentation;
    presentationButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    panel.dataset.presentation = presentation;
    engine?.setPresentation(presentation);
  }));
  panel.dataset.presentation = presentation;
  let engine: EngineThree | null = null;
  let workshopLighting: WorkshopLighting | null = null;
  let initializing = false, failed = false, suspended = false, initializationGeneration = 0;
  let latestState: ViewState | null = null, latestConfig: Config | null = null;
  const wantsEngine = () => !suspended && workspace.dataset.currentPage === 'mechanics';

  async function initialize() {
    if (engine || initializing || failed || !wantsEngine()) return;
    initializing = true;
    const generation = ++initializationGeneration;
    let candidate: EngineThree | null = null;
    let candidateLighting: WorkshopLighting | null = null;
    try {
      const { EngineThree } = await import('./engine-three');
      if (generation !== initializationGeneration || !wantsEngine()) return;
      candidate = await EngineThree.create(host, () => latestConfig ? { state: latestState, cfg: latestConfig } : null);
      host.dataset.webgl = 'lighting';
      const { installTestCell } = await import('./engine-view-workshop');
      candidateLighting = await installTestCell(candidate);
      await candidate.renderer.compileAsync(candidate.scene, candidate.camera);
      if (generation !== initializationGeneration || !wantsEngine()) {
        candidateLighting.dispose(); candidate.dispose(); candidate = null; host.dataset.webgl = 'idle'; loading.hidden = false; return;
      }
      engine = candidate; candidate = null;
      workshopLighting = candidateLighting; candidateLighting = null;
      engine.setComponent('engine');
      engine.setExtras(true);
      engine.setHousing(true);
      MEDIA.forEach(medium => engine!.setMode(medium.id, 'transparent'));
      engine.setExploded(0);
      engine.setPresentation(presentation);
      engine.view(camera.value);
      host.dataset.webgl = 'ready';
      loading.hidden = true;
      fallback.hidden = true;
    } catch {
      candidateLighting?.dispose(); candidate?.dispose();
      if (generation !== initializationGeneration || !wantsEngine()) return;
      workshopLighting?.dispose(); workshopLighting = null; engine?.dispose(); engine = null; failed = true;
      host.dataset.webgl = 'unavailable';
      loading.hidden = true;
      fallback.hidden = false;
    } finally {
      initializing = false;
      if (generation !== initializationGeneration && !engine && !failed && wantsEngine()) void initialize();
    }
  }

  camera.addEventListener('change', () => engine?.view(camera.value));
  panel.querySelector('#three-camera-reset')!.addEventListener('click', () => {
    camera.value = presentation==='cutaway'?'section':'overview'; engine?.resetCamera();
  });
  panel.querySelector('#three-retry')!.addEventListener('click', () => {
    failed = false; fallback.hidden = true; loading.hidden = false; void initialize();
  });
  const pageObserver = new MutationObserver(() => {
    if (wantsEngine()) void initialize(); else initializationGeneration++;
  });
  pageObserver.observe(workspace, { attributes: true, attributeFilter: ['data-current-page'] });
  window.addEventListener('pagehide', event => {
    suspended = true; initializationGeneration++; pageObserver.disconnect();
    if (!event.persisted) { workshopLighting?.dispose(); workshopLighting = null; engine?.dispose(); engine = null; loading.hidden = false; }
  });
  window.addEventListener('pageshow', () => {
    suspended = false; pageObserver.observe(workspace, { attributes: true, attributeFilter: ['data-current-page'] });
    void initialize();
  });
  void initialize();
  return {
    is3d: () => true,
    render: (state: ViewState | null, cfg: Config, angle: number, clock: number, driveAngle = angle) => {
      latestState = state; latestConfig = cfg;
      if (!suspended && engine) { workshopLighting?.update(presentation, state, clock); engine.render(state, cfg, angle, clock, driveAngle); }
    },
    diagnostics: () => ({ view: '3d', component: 'engine', presentation, ready: !!engine, failed, scene: engine?.diagnostics() ?? null })
  };
}
