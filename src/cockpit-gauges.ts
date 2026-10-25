export type CockpitGaugeKey = 'rpm' | 'speedKmh';
export type CockpitTelemetry = Readonly<{ rpm?: number; speedKmh?: number }>;
export interface CockpitGaugeScale { minimum: number; maximum: number; minorStep: number; majorStep: number; labelStep: number }
export interface CockpitGauges {
  /** Displays native values; this component never changes or predicts telemetry. */
  update(state: CockpitTelemetry | null): void;
  destroy(): void;
}

export const COCKPIT_RPM_LIMIT = 6500;
export const COCKPIT_SCALES: Readonly<Record<CockpitGaugeKey, Readonly<CockpitGaugeScale>>> = Object.freeze({
  rpm: Object.freeze({ minimum: 0, maximum: 7000, minorStep: 100, majorStep: 500, labelStep: 1000 }),
  speedKmh: Object.freeze({ minimum: 0, maximum: 260, minorStep: 10, majorStep: 20, labelStep: 20 }),
});
const START_ANGLE = 135, SWEEP_ANGLE = 270, CENTER_X = 110, CENTER_Y = 108;
const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** Clamp only the needle to its physical scale; retain the original value. */
export function cockpitNeedleAngle(value: number, scale: Readonly<CockpitGaugeScale>) {
  if (!Number.isFinite(value)) return null;
  const fraction = (Math.max(scale.minimum, Math.min(scale.maximum, value)) - scale.minimum) / (scale.maximum - scale.minimum);
  return START_ANGLE + fraction * SWEEP_ANGLE;
}

export function cockpitScaleTicks(scale: Readonly<CockpitGaugeScale>) {
  const count = Math.round((scale.maximum - scale.minimum) / scale.minorStep);
  return Array.from({ length: count + 1 }, (_, index) => {
    const value = scale.minimum + index * scale.minorStep;
    return { value, angle: cockpitNeedleAngle(value, scale)!, major: value % scale.majorStep === 0, labelled: value % scale.labelStep === 0 };
  });
}

export function cockpitReading(key: CockpitGaugeKey, raw: unknown, rpmLimit = COCKPIT_RPM_LIMIT) {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const scale = COCKPIT_SCALES[key];
  return {
    value,
    available: value !== null,
    angle: value === null ? null : cockpitNeedleAngle(value, scale),
    display: value === null ? '—' : numberFormat.format(Math.abs(value) < .5 ? 0 : value),
    range: value === null ? 'missing' : value < scale.minimum ? 'below' : value > scale.maximum ? 'above' : 'within',
    warning: key === 'rpm' && value !== null && value >= rpmLimit,
  };
}

function polar(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return [CENTER_X + Math.cos(radians) * radius, CENTER_Y + Math.sin(radians) * radius];
}
function arc(radius: number, from: number, to: number) {
  const start = polar(radius, from), end = polar(radius, to);
  return `M${start[0].toFixed(3)} ${start[1].toFixed(3)}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${end[0].toFixed(3)} ${end[1].toFixed(3)}`;
}
function dialMarkup(key: CockpitGaugeKey, rpmLimit: number) {
  const scale = COCKPIT_SCALES[key], rpm = key === 'rpm';
  const title = rpm ? 'Drehzahl' : 'Geschwindigkeit', unit = rpm ? '1/min × 1000' : 'km/h';
  const marks = cockpitScaleTicks(scale).map(tick => {
    const inner = polar(tick.major ? 81 : 87, tick.angle), outer = polar(95, tick.angle);
    const position = polar(67, tick.angle), red = rpm && tick.value >= rpmLimit;
    const label = rpm ? tick.value / 1000 : tick.value;
    return `<line class="cockpit-tick${tick.major ? ' cockpit-tick-major' : ''}${red ? ' cockpit-tick-red' : ''}" x1="${inner[0].toFixed(3)}" y1="${inner[1].toFixed(3)}" x2="${outer[0].toFixed(3)}" y2="${outer[1].toFixed(3)}"/>${tick.labelled ? `<text class="cockpit-scale-number${red ? ' cockpit-number-red' : ''}" x="${position[0].toFixed(3)}" y="${position[1].toFixed(3)}" dominant-baseline="central" text-anchor="middle">${label}</text>` : ''}`;
  }).join('');
  const redZone = rpm ? `<path class="cockpit-red-zone" d="${arc(92, cockpitNeedleAngle(rpmLimit, scale)!, START_ANGLE + SWEEP_ANGLE)}" data-redline-start="${rpmLimit}"/>` : '';
  return `<article class="cockpit-dial" data-cockpit-gauge="${key}" data-available="false" data-range="missing">
    <svg class="cockpit-face" viewBox="0 0 220 212" role="img" aria-label="${title}: keine Motordaten">
      <circle class="cockpit-bezel" cx="110" cy="108" r="103"/>
      <circle class="cockpit-black-face" cx="110" cy="108" r="99"/>
      <path class="cockpit-bezel-glint" d="${arc(102, 205, 300)}"/>
      ${redZone}${marks}
      <text class="cockpit-face-unit" x="110" y="153" text-anchor="middle">${unit}</text>
      <g class="cockpit-needle" data-cockpit-needle style="--needle-angle:135deg">
        <path class="cockpit-needle-shadow" d="M97 105L191 107L196 110L191 111L97 111Z"/>
        <path class="cockpit-needle-blade" d="M97 104.5L190 106.8L195 108L190 109.2L97 111.5Z"/>
        <path class="cockpit-needle-highlight" d="M111 105.7L188 107.5"/>
      </g>
      <circle class="cockpit-needle-hub" cx="110" cy="108" r="9"/><circle class="cockpit-hub-highlight" cx="108" cy="106" r="3"/>
    </svg>
    <div class="cockpit-digital"><span class="cockpit-digital-value" data-cockpit-value>—</span><span class="cockpit-digital-unit">${rpm ? '1/min' : 'km/h'}</span><span class="cockpit-scale-overflow" aria-hidden="true"></span></div>
  </article>`;
}

export function installCockpitGauges(container: HTMLElement, options: { rpmLimit?: number } = {}): CockpitGauges {
  const requestedLimit = options.rpmLimit ?? COCKPIT_RPM_LIMIT;
  const rpmLimit = Number.isFinite(requestedLimit) ? Math.max(0, Math.min(COCKPIT_SCALES.rpm.maximum, requestedLimit)) : COCKPIT_RPM_LIMIT;
  const existingRpm = container.querySelector<HTMLElement>('#rpm');
  const existingTorque = container.querySelector<HTMLElement>('#torque');
  const existingPower = container.querySelector<HTMLElement>('#power');
  const existingSpeed = document.getElementById('speed');
  const originalChildren = Array.from(container.childNodes);
  const originalSlots = [existingRpm, existingTorque, existingPower, existingSpeed].filter((value): value is HTMLElement => !!value).map(value => ({ value, parent: value.parentNode!, next: value.nextSibling }));
  const root = document.createElement('div');
  root.className = 'cockpit-cluster';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'BMW-Kombiinstrument: Geschwindigkeit und Drehzahl');
  root.innerHTML = `<div class="cockpit-dials">${dialMarkup('speedKmh', rpmLimit)}${dialMarkup('rpm', rpmLimit)}</div><div class="cockpit-cluster-foot"><span>BMW <b>M54B30</b></span><span class="cockpit-rev-limit">6 ZYLINDER · 3,0 L</span></div><div class="cockpit-retained" hidden></div>`;
  for (const [key, value] of [['rpm', existingRpm], ['speedKmh', existingSpeed]] as const) {
    if (!value) continue;
    value.classList.add('cockpit-digital-value');
    value.setAttribute('data-cockpit-value', '');
    root.querySelector(`[data-cockpit-gauge="${key}"] [data-cockpit-value]`)!.replaceWith(value);
  }
  for (const value of [existingTorque, existingPower]) if (value) root.querySelector('.cockpit-retained')!.append(value);
  // All legacy telemetry IDs were retained or moved by the shell before mount.
  container.replaceChildren(root);
  const gauges = (['speedKmh', 'rpm'] as const).map(key => {
    const element = root.querySelector<HTMLElement>(`[data-cockpit-gauge="${key}"]`)!;
    return { key, element, face: element.querySelector('svg')!, needle: element.querySelector<SVGGElement>('[data-cockpit-needle]')!, value: element.querySelector<HTMLElement>('[data-cockpit-value]')!, overflow: element.querySelector<HTMLElement>('.cockpit-scale-overflow')! };
  });
  let destroyed = false;
  const update = (state: CockpitTelemetry | null) => {
    if (destroyed) return;
    for (const gauge of gauges) {
      const reading = cockpitReading(gauge.key, state?.[gauge.key], rpmLimit);
      gauge.element.dataset.available = String(reading.available);
      gauge.element.dataset.value = reading.value === null ? '' : String(reading.value);
      gauge.element.dataset.angle = reading.angle === null ? '' : String(reading.angle);
      gauge.element.dataset.range = reading.range;
      gauge.element.dataset.warning = String(reading.warning);
      if (reading.angle !== null) gauge.needle.style.setProperty('--needle-angle', `${reading.angle}deg`);
      if (gauge.value.textContent !== reading.display) gauge.value.textContent = reading.display;
      const name = gauge.key === 'rpm' ? 'Drehzahl' : 'Geschwindigkeit', unit = gauge.key === 'rpm' ? '1/min' : 'km/h';
      gauge.face.setAttribute('aria-label', reading.available ? `${name}: ${reading.display} ${unit}` : `${name}: keine Motordaten`);
      gauge.overflow.textContent = reading.range === 'above' ? '↑' : reading.range === 'below' ? '↓' : '';
      gauge.overflow.title = reading.range === 'above' || reading.range === 'below' ? 'Wert außerhalb der Zeigerskala' : '';
    }
  };
  update(null);
  return { update, destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const slot of originalSlots) {
      if (slot.next?.parentNode === slot.parent) slot.parent.insertBefore(slot.value, slot.next);
      else slot.parent.appendChild(slot.value);
    }
    container.replaceChildren(...originalChildren);
  } };
}
