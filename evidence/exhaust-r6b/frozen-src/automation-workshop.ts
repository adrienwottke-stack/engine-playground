import './automation-workshop.css';
import {DEFAULT_TUNING, completeTuningSupport, tuningParameters, tuningRequirements, validateTuning, type TuningSelection} from '../native/tuning-settings.mjs';
import {AUTOMATION_STAGES} from './automation-workflow';
import {TUNING_CATALOG, choosePart, type PartKey} from './tuning-catalog';
import {previewTuningCurve, sameTuning, validateMeasuredComparison, type MeasuredTuningComparison, type TuningCurvePoint} from './tuning-model';
import type {TuningPanel, TuningPanelOptions} from './tuning-panel';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const partSlot = (key: PartKey) => TUNING_CATALOG.find(slot => slot.key === key)!;
const changedParts = (value: TuningSelection, baseline: TuningSelection = validateTuning()) => TUNING_CATALOG.filter(slot => value[slot.key] !== baseline[slot.key]).length;

function comparisonChart(baseline: TuningCurvePoint[], selected: TuningCurvePoint[], metric: 'torqueNm'|'powerKw') {
  const left = 32, right = 312, top = 15, bottom = 122;
  const max = Math.max(1, ...baseline.map(p => p[metric]), ...selected.map(p => p[metric])) * 1.12;
  const minRpm = Math.min(baseline[0].rpm, selected[0].rpm);
  const maxRpm = Math.max(baseline.at(-1)!.rpm, selected.at(-1)!.rpm);
  const x = (rpm: number) => left + (rpm - minRpm) / (maxRpm - minRpm) * (right - left);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const path = (rows: TuningCurvePoint[]) => rows.map((point, i) => `${i ? 'L' : 'M'}${x(point.rpm).toFixed(1)},${y(point[metric]).toFixed(1)}`).join(' ');
  return `<text x="${left}" y="10">${metric === 'torqueNm' ? 'Nm' : 'kW'}</text>${[0, .5, 1].map(f => `<path class="aw-gridline" d="M${left} ${y(max*f)}H${right}"/><text x="${left-5}" y="${y(max*f)+3}" text-anchor="end">${Math.round(max*f)}</text>`).join('')}
  <path class="aw-baseline" d="${path(baseline)}"/><path class="aw-candidate" d="${path(selected)}"/>
  <text x="${left}" y="141">${minRpm}</text><text x="${right}" y="141" text-anchor="end">${maxRpm} U/min</text>`;
}

/** Compact workshop editor; onApply retains ownership of native confirmation. */
export function installAutomationWorkshop(container: HTMLElement, options: TuningPanelOptions): TuningPanel {
  let applied = validateTuning(options.initialSelection), selection = validateTuning(applied);
  let stageIndex = 0, expanded = false, busy = false, running = false, destroyed = false;
  let error = '', success = '', measured: MeasuredTuningComparison|null = null;
  let metric: 'torqueNm'|'powerKw' = 'torqueNm';
  let viewed = {key: AUTOMATION_STAGES[0].primaryKeys[0] as PartKey, value: selection[AUTOMATION_STAGES[0].primaryKeys[0]] as string};
  const root = document.createElement('section');
  root.className = 'automation-workshop';
  root.setAttribute('aria-label', 'Motorbau-Werkstatt');
  root.innerHTML = `<header class="aw-heading"><div><span class="aw-eyebrow">M54B30 / MOTORBAU</span><h2 data-stage-title></h2></div><div class="aw-heading-right"><span class="aw-engine-spec">R6 · 2.979 cm³</span><span class="aw-installed" data-installed></span></div></header>
    <div class="aw-editor"><div class="aw-parts" id="aw-parts" role="tabpanel" tabindex="0"></div>
    <aside class="aw-effect" aria-label="Wirkung des betrachteten Teils"><span class="aw-eyebrow" data-inspect-state></span><h3 data-part-name></h3><p data-part-description></p><div class="aw-tradeoffs" data-tradeoffs></div>
    <div class="aw-chart-title"><span data-curve-source>Modellvorschau · geschätzt</span><div class="aw-metrics" aria-label="Kurvendarstellung"><button type="button" data-metric="torqueNm" aria-pressed="true">Nm</button><button type="button" data-metric="powerKw" aria-pressed="false">kW</button></div></div>
    <svg data-chart viewBox="0 0 328 150" role="img"></svg><div class="aw-legend"><span data-legend-before>Deine Auswahl</span><span data-legend-after>Mit diesem Teil</span></div><p class="aw-curve-note" data-curve-note></p></aside></div>
    <div class="aw-fitment"><p data-fitment role="status"></p><button type="button" class="aw-support" data-support hidden>Passende Stützteile ergänzen</button></div>
    <footer class="aw-build"><div><strong data-draft-count></strong><p data-status role="status" aria-live="polite"></p></div><div class="aw-actions"><button type="button" class="aw-secondary" data-reset>Serie vormerken</button><button type="button" class="aw-apply" data-apply>Teile einbauen</button></div></footer>
    <nav class="aw-navigation" aria-label="Motorbau-Schritte"><button type="button" class="aw-step-arrow" data-prev aria-label="Vorherige Baugruppe">←</button><div class="aw-stages" role="tablist" aria-label="Baugruppen">${AUTOMATION_STAGES.map((stage, i) => `<button type="button" id="aw-stage-${escape(stage.id)}" data-stage="${i}" role="tab" aria-controls="aw-parts" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span class="aw-step-number">${String(i+1).padStart(2,'0')}</span><span>${escape(stage.shortName)}</span><small data-stage-count="${i}"></small></button>`).join('')}</div><button type="button" class="aw-step-arrow" data-next aria-label="Nächste Baugruppe">→</button></nav>
    <details class="aw-method"><summary>Was verändert der Einbau?</summary><p>Teile wirken im vorhandenen Motormodell auf Durchfluss, Nocken, Verdichtung, Massen und Abstimmung. Der Motor wird zum Einbau gestoppt. Erst die Bestätigung des Motorkerns gilt als eingebaut.</p><p>Modellkurven sind unkalibrierte Schätzungen. Klopfgrenzen, Ventilflattern und Bauteilfestigkeit werden nicht berechnet. Ein leichteres Schwungrad verändert die Drehzahlreaktion, ohne allein die stationäre Leistung zu erhöhen.</p></details>`;
  container.append(root);
  const el = <T extends HTMLElement|SVGElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

  function renderParts() {
    const stage = AUTOMATION_STAGES[stageIndex];
    const slotMarkup = (key: PartKey) => {
      const slot = partSlot(key);
      return `<section class="aw-part-column"><h3>${escape(slot.name)}<span data-slot-state="${key}"></span></h3><div class="aw-options" role="group" aria-label="${escape(slot.name)}">${slot.options.map(part => `<button type="button" data-part="${key}" data-value="${escape(part.value)}" aria-pressed="false"><span>${escape(part.name)}</span><small data-option-state></small></button>`).join('')}</div></section>`;
    };
    el('[data-stage-title]').textContent = stage.name;
    el('#aw-parts').setAttribute('aria-labelledby', `aw-stage-${stage.id}`);
    el('#aw-parts').innerHTML = stage.primaryKeys.map(slotMarkup).join('') + (stage.extraKeys.length ? `<div class="aw-more"><button type="button" data-more aria-expanded="${expanded}" aria-controls="aw-extra">${expanded?'Weniger Teile':'Weitere Teile'} <span>${stage.extraKeys.length}</span></button></div><div class="aw-extra" id="aw-extra" ${expanded?'':'hidden'}>${stage.extraKeys.map(slotMarkup).join('')}</div>` : '');
  }

  function renderEffect() {
    const slot = partSlot(viewed.key), part = slot.options.find(option => option.value === viewed.value)!;
    const candidate = choosePart(selection, viewed.key, viewed.value);
    const inspecting = selection[viewed.key] !== viewed.value;
    const actual = !inspecting && measured && sameTuning(measured.selection, selection) ? measured : null;
    const before = actual?.baseline ?? previewTuningCurve(inspecting ? selection : applied);
    const after = actual?.selected ?? previewTuningCurve(candidate);
    el('[data-inspect-state]').textContent = inspecting ? 'TEILEVORSCHAU' : 'DEINE AUSWAHL';
    el('[data-part-name]').textContent = part.name;
    el('[data-part-description]').textContent = part.description;
    el('[data-tradeoffs]').innerHTML = `<span class="aw-plus">+ ${escape(part.plus)}</span>${part.minus ? `<span class="aw-minus">− ${escape(part.minus)}</span>` : ''}`;
    const chart = el<SVGSVGElement>('[data-chart]');
    chart.innerHTML = comparisonChart(before, after, metric);
    chart.setAttribute('aria-label', `${actual?'Native Messkurven':'Geschätzte Modellvorschau'}: ${metric==='torqueNm'?'Drehmoment in Nm':'Leistung in kW'}. ${actual?'Serie und Auswahl':inspecting?'Auswahl und betrachtetes Teil':'Eingebauter Aufbau und Auswahl'}.`);
    el('[data-curve-source]').textContent = actual ? 'Native Messkurven' : 'Modellvorschau · geschätzt';
    el('[data-legend-before]').textContent = actual ? 'Serie' : inspecting ? 'Deine Auswahl' : 'Eingebauter Aufbau';
    el('[data-legend-after]').textContent = actual || !inspecting ? 'Deine Auswahl' : 'Mit diesem Teil';
    el('[data-curve-note]').textContent = actual?.sourceLabel ?? 'Die Vorschau zeigt die angenommene Wirkung. Eine native Prüfstandsmessung liegt hier nicht vor.';
    root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
      button.dataset.viewed = String(button.dataset.part === viewed.key && button.dataset.value === viewed.value);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === metric)));
  }

  function render() {
    if (destroyed) return;
    const changed = !sameTuning(selection, applied), missing = tuningRequirements(selection), parameters = tuningParameters(selection);
    root.dataset.pending = String(changed);
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = busy);
    root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
      const key = button.dataset.part as PartKey, value = button.dataset.value!;
      const selected = selection[key] === value, installed = applied[key] === value;
      button.setAttribute('aria-pressed', String(selected));
      button.dataset.installed = String(installed);
      button.querySelector('[data-option-state]')!.textContent = installed ? 'Eingebaut' : selected ? 'Vorgemerkt' : 'Ansehen & auswählen';
    });
    root.querySelectorAll<HTMLElement>('[data-slot-state]').forEach(node => node.textContent = selection[node.dataset.slotState as PartKey] !== applied[node.dataset.slotState as PartKey] ? 'geändert' : '');
    root.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => {
      const index = Number(button.dataset.stage), active = index === stageIndex, stage = AUTOMATION_STAGES[index];
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const count = [...stage.primaryKeys, ...stage.extraKeys].filter(key => selection[key] !== applied[key]).length;
      button.querySelector('[data-stage-count]')!.textContent = count ? `+${count}` : '';
    });
    el<HTMLButtonElement>('[data-prev]').disabled = busy || stageIndex === 0;
    el<HTMLButtonElement>('[data-next]').disabled = busy || stageIndex === AUTOMATION_STAGES.length - 1;
    const installedCount=changedParts(applied),draftCount=changedParts(selection,applied);
    el('[data-installed]').textContent = installedCount ? `${installedCount} ${installedCount===1?'Änderung':'Änderungen'} eingebaut` : 'Serie eingebaut';
    el('[data-draft-count]').textContent = `${draftCount} ${draftCount===1?'Änderung':'Änderungen'} vorgemerkt · ${parameters.redlineRpm.toLocaleString('de-DE')} U/min`;
    el('[data-fitment]').textContent = missing.length ? `Noch erforderlich: ${missing.map(item => item.label).join(', ')}.` : parameters.requestedRedlineRpm > parameters.redlineRpm ? `Der Ventiltrieb begrenzt diesen Aufbau auf ${parameters.redlineRpm.toLocaleString('de-DE')} U/min.` : 'Teile passen im vereinfachten Werkstattmodell zusammen.';
    el('[data-fitment]').dataset.warning = String(missing.length > 0);
    el<HTMLButtonElement>('[data-support]').hidden = missing.length === 0 && parameters.requestedRedlineRpm <= parameters.redlineRpm;
    el('[data-status]').textContent = error || (busy ? 'Einbau läuft. Warte auf Bestätigung des Motorkerns …' : changed ? 'Vorgemerkt. Der Motor behält bis zum Einbau seinen bestätigten Aufbau.' : success || 'Baugruppe wählen, Teil ansehen und Aufbau zusammenstellen.');
    el('[data-status]').dataset.error = String(!!error);
    const apply = el<HTMLButtonElement>('[data-apply]');
    apply.disabled = busy || !changed || missing.length > 0;
    apply.textContent = busy ? 'Wird eingebaut …' : running && changed ? 'Motor stoppen & einbauen' : 'Teile einbauen';
    el<HTMLButtonElement>('[data-reset]').disabled = busy || sameTuning(selection, DEFAULT_TUNING);
    renderEffect();
  }

  function setStage(index: number, focus = false) {
    stageIndex = Math.max(0, Math.min(AUTOMATION_STAGES.length - 1, index));
    expanded = false;
    const key = AUTOMATION_STAGES[stageIndex].primaryKeys[0];
    viewed = {key, value: selection[key]};
    renderParts(); render();
    if (focus) el<HTMLButtonElement>(`[data-stage="${stageIndex}"]`).focus();
  }

  async function applySelection() {
    if (busy || sameTuning(selection, applied) || tuningRequirements(selection).length) return;
    const requested = validateTuning(selection);
    busy = true; error = ''; success = ''; render();
    try {
      await options.onApply(requested);
      if (destroyed) return;
      applied = requested;
      success = 'Einbau bestätigt. Du kannst den Motor jetzt starten.';
    } catch (reason) {
      if (destroyed) return;
      error = `Einbau nicht bestätigt. ${reason instanceof Error ? reason.message : 'Bitte erneut versuchen.'}`;
    } finally {
      if (!destroyed) {busy = false; render();}
    }
  }

  function click(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || busy || button.disabled) return;
    if (button.dataset.stage !== undefined) setStage(Number(button.dataset.stage));
    else if (button.hasAttribute('data-prev')) setStage(stageIndex - 1, true);
    else if (button.hasAttribute('data-next')) setStage(stageIndex + 1, true);
    else if (button.dataset.part) {
      selection = choosePart(selection, button.dataset.part as PartKey, button.dataset.value!);
      viewed = {key: button.dataset.part as PartKey, value: button.dataset.value!};
      error = ''; success = ''; render();
    } else if (button.hasAttribute('data-more')) {expanded = !expanded; renderParts(); render(); el<HTMLButtonElement>('[data-more]').focus();}
    else if (button.hasAttribute('data-support')) {selection = completeTuningSupport(selection); error = ''; success = ''; render();}
    else if (button.dataset.metric) {metric = button.dataset.metric as typeof metric; renderEffect();}
    else if (button.hasAttribute('data-reset')) {selection = validateTuning(); error = ''; success = ''; viewed.value = selection[viewed.key]; render();}
    else if (button.hasAttribute('data-apply')) void applySelection();
  }

  function inspect(event: Event) {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-part]');
    if (!button || busy) return;
    viewed = {key: button.dataset.part as PartKey, value: button.dataset.value!};
    renderEffect();
  }

  function keydown(event: KeyboardEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-stage]');
    if (!button || busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = Number(button.dataset.stage);
    setStage(event.key === 'Home' ? 0 : event.key === 'End' ? AUTOMATION_STAGES.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + AUTOMATION_STAGES.length) % AUTOMATION_STAGES.length, true);
  }

  root.addEventListener('click', click);
  root.addEventListener('pointerover', inspect);
  root.addEventListener('focusin', inspect);
  root.addEventListener('keydown', keydown);
  renderParts(); render();
  return {
    getSelection: () => validateTuning(selection),
    getAppliedSelection: () => validateTuning(applied),
    setApplied(value) {
      const follow = sameTuning(selection, applied);
      applied = validateTuning(value);
      if (follow) {selection = validateTuning(applied); viewed.value = selection[viewed.key];}
      if (!busy) render();
    },
    setEngineRunning(value) {if (running !== value) {running = value; render();}},
    setMeasuredComparison(value) {measured = value ? validateMeasuredComparison(value) : null; render();},
    destroy() {
      destroyed = true;
      root.removeEventListener('click', click); root.removeEventListener('pointerover', inspect);
      root.removeEventListener('focusin', inspect); root.removeEventListener('keydown', keydown); root.remove();
    }
  };
}
