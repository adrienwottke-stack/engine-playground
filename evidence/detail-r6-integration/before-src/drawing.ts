import { FIRING_ORDER, TAU, mod, pistonGeometry, type Config, type State } from './model';

const palette = { ink: '#dce8e7', muted: '#77949f', line: '#30434c', teal: '#6dc9be', amber: '#ddb17b', blue: '#82a9d2', purple: '#aea1cf' };
export type ViewState = Partial<State> & { source?:string;valveCurves?:{samples:number[][][]};cycles?:{cylinder:number;samples:(number[]|null)[]}[];simulationHz?:number;processingMs?:number;reference?:boolean;engineName?:string;tdcRad?:number;journalAngles?:number[];cycle?:{cylinder:number;samples:(number[]|null)[]}; totalRatio?: number; manifoldKpa?: number; estimatedHeatKw?: number; fuelRateGS?: number; cylinders?: { pressureKpa: number; gasTemperatureK: number; intakeLiftMm: number; exhaustLiftMm: number; fuelFraction: number; burning: boolean; intakeMolS?:number;exhaustMolS?:number }[] };

const canvasSizes = new WeakMap<HTMLCanvasElement, { width: number; height: number }>();
const canvasResize = new ResizeObserver(entries => {
  for (const entry of entries) {
    canvasSizes.set(entry.target as HTMLCanvasElement, { width: entry.contentRect.width, height: entry.contentRect.height });
  }
});

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let bounds = canvasSizes.get(canvas);
  if (!bounds) { bounds = canvas.getBoundingClientRect(); canvasSizes.set(canvas,bounds); canvasResize.observe(canvas); }
  const pixelW = Math.round(Math.max(1, bounds.width) * dpr), pixelH = Math.round(Math.max(1, bounds.height) * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) { canvas.width = pixelW; canvas.height = pixelH; }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(pixelW / width, 0, 0, pixelH / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

export function drawEngine(canvas: HTMLCanvasElement, state: ViewState | null, config: Config, angle: number, slow: boolean, frozen = false) {
  const W = 900, H = 370, ctx = prepareCanvas(canvas, W, H);
  const r = config.engine.strokeMm / 2, l = config.engine.rodMm, scale = 0.82;
  const crankY = 275, top = crankY - (r + l) * scale - 30;
  const positions = [102, 236, 370, 504, 638, 772];
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#1e3038';
  for (let x = 30; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, 310); ctx.stroke(); }
  for (let y = 28; y < 320; y += 24) { ctx.beginPath(); ctx.moveTo(26, y); ctx.lineTo(872, y); ctx.stroke(); }
  ctx.fillStyle = '#18262d'; ctx.strokeStyle = '#3b505a';
  ctx.beginPath(); ctx.roundRect(46, top + 4, 782, 164, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#22353e'; ctx.strokeStyle = '#5b737c';
  ctx.beginPath(); ctx.roundRect(39, top - 20, 796, 33, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#4b626b';
  for (let x = 60; x < 824; x += 30) { ctx.beginPath(); ctx.moveTo(x, top - 18); ctx.lineTo(x, top + 11); ctx.stroke(); }
  // Bearing axis and counterweights are drawn behind the rods.
  ctx.strokeStyle = '#67838d'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(47, crankY); ctx.lineTo(826, crankY); ctx.stroke();
  ctx.strokeStyle = '#243942'; ctx.lineWidth = 2;
  positions.forEach(x => { ctx.beginPath(); ctx.arc(x, crankY, r * scale + 12, 0, TAU); ctx.stroke(); });
  for (let i = 0; i < 6; i++) {
    const x = positions[i], geometry = pistonGeometry(angle, i + 1, config.engine.strokeMm, config.engine.rodMm);
    const pistonY = crankY + geometry.pistonY * scale;
    const pinX = x + geometry.crankX * scale, pinY = crankY + geometry.crankY * scale;
    const bore = config.engine.boreMm * scale;
    ctx.fillStyle = '#0d1a20'; ctx.fillRect(x - bore / 2, top + 13, bore, 138);
    ctx.strokeStyle = '#709099'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - bore / 2, top + 14); ctx.lineTo(x - bore / 2, top + 149); ctx.moveTo(x + bore / 2, top + 14); ctx.lineTo(x + bore / 2, top + 149); ctx.stroke();
    if (state?.ignition && (state.rpm || 0) > 150) {
      const colors = [palette.amber, palette.purple, palette.teal, palette.blue];
      ctx.globalAlpha = geometry.stage === 0 ? 0.42 * Math.sin(geometry.phase / 2 + 0.25) : 0.14;
      ctx.fillStyle = colors[geometry.stage];
      ctx.fillRect(x - bore / 2 + 2, top + 14, bore - 4, Math.max(0, pistonY - 12 - top - 14));
      ctx.globalAlpha = 1;
    }
    // Exact connecting-rod endpoints: distance equals rod length at every crank angle.
    ctx.strokeStyle = '#2a424c'; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, pistonY); ctx.lineTo(pinX, pinY); ctx.stroke();
    ctx.strokeStyle = '#91a7af'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x, pistonY); ctx.lineTo(pinX, pinY); ctx.stroke();
    ctx.strokeStyle = '#d0dcdd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 2, pistonY); ctx.lineTo(pinX - 2, pinY); ctx.stroke();
    const pistonGradient = ctx.createLinearGradient(x - bore / 2, 0, x + bore / 2, 0);
    pistonGradient.addColorStop(0, '#647e88'); pistonGradient.addColorStop(0.45, '#c5d4d7'); pistonGradient.addColorStop(1, '#526e79');
    ctx.fillStyle = pistonGradient; ctx.strokeStyle = '#d0dcdc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x - bore / 2 + 3, pistonY - 15, bore - 6, 31, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#375360'; ctx.lineWidth = 2;
    for (let ring = 0; ring < 3; ring++) { ctx.beginPath(); ctx.moveTo(x - bore / 2 + 4, pistonY - 10 + ring * 5); ctx.lineTo(x + bore / 2 - 4, pistonY - 10 + ring * 5); ctx.stroke(); }
    ctx.fillStyle = '#172b35'; ctx.strokeStyle = '#b3cbd0';
    ctx.beginPath(); ctx.arc(x, pistonY, 4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#536e78'; ctx.strokeStyle = '#b7cdce';
    ctx.beginPath(); ctx.arc(pinX, pinY, 11, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#172b35'; ctx.beginPath(); ctx.arc(pinX, pinY, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = palette.ink; ctx.textAlign = 'center'; ctx.font = '13px "Cascadia Mono", Consolas, monospace';
    ctx.fillText(String(i + 1).padStart(2, '0'), x, 53);
    ctx.fillStyle = state ? [palette.amber, palette.purple, palette.teal, palette.blue][geometry.stage] : palette.muted;
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText(state ? ['Arbeit', 'Ausstoß', 'Ansaugen', 'Verdichten'][geometry.stage] : '—', x, 330);
    // Intake and exhaust poppets follow the 4-stroke phase.
    for (const [offset, active, color] of [[-14, geometry.stage === 2, palette.teal], [14, geometry.stage === 1, palette.blue]] as const) {
      const lift = active ? Math.sin(mod(geometry.phase, Math.PI)) * 8 : 0;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + offset, top - 6); ctx.lineTo(x + offset, top + 13 + lift); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + offset - 6, top + 13 + lift); ctx.lineTo(x + offset + 6, top + 13 + lift); ctx.stroke();
    }
  }
  ctx.textAlign = 'left'; ctx.font = '11px "Cascadia Mono", Consolas, monospace'; ctx.fillStyle = palette.muted;
  ctx.fillText(frozen ? 'STANDANSICHT · PHYSIK + TON LIVE' : slow ? 'VISUELLE ZEITLUPE · PHYSIK + TON IN ECHTZEIT' : 'KURBELWINKEL · 720° ARBEITSZYKLUS', 46, 360);
  ctx.textAlign = 'right'; ctx.fillText('ZÜNDFOLGE  ' + FIRING_ORDER.join(' · '), 827, 360);
  ctx.lineCap = 'butt';
}

export interface Series { name: string; color: string; values: [number, number][] }
export function drawChart(canvas: HTMLCanvasElement, series: Series[], yUnit: string, maxY?: number) {
  const W = 900, H = 235, ctx = prepareCanvas(canvas, W, H);
  const left = 60, right = 880, top = 15, bottom = 191;
  const valid = series.map(s => ({ ...s, values: s.values.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) }));
  const all = valid.flatMap(s => s.values);
  const x0 = all.length ? Math.min(...all.map(p => p[0])) : 0;
  const x1 = all.length ? Math.max(x0 + 1, ...all.map(p => p[0])) : 60;
  const minValue = all.length ? Math.min(0, ...all.map(p => p[1])) : 0;
  const minY = minValue < 0 ? Math.floor(minValue / 10) * 10 : 0;
  const upper = maxY ?? (all.length ? Math.max(10, ...all.map(p => p[1])) * 1.1 : 100);
  const niceY = maxY ?? Math.ceil(upper / (upper > 1000 ? 1000 : upper > 100 ? 20 : 10)) * (upper > 1000 ? 1000 : upper > 100 ? 20 : 10);
  const x = (t: number) => left + (t - x0) / (x1 - x0) * (right - left);
  const y = (v: number) => bottom - (v - minY) / (niceY - minY) * (bottom - top);
  ctx.font = '11px "Cascadia Mono", Consolas, monospace'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const value = minY + (niceY - minY) * i / 4, py = y(value);
    ctx.strokeStyle = '#2a3d45'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    ctx.fillStyle = palette.muted; ctx.fillText(Math.round(value).toLocaleString('de-DE'), left - 12, py + 4);
  }
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) { const t = x0 + (x1 - x0) * i / 4; ctx.fillText(t.toFixed(x1 > 60 ? 0 : 1) + ' s', x(t), bottom + 24); }
  ctx.textAlign = 'left'; ctx.fillText(yUnit, 8, 228);
  for (const s of valid) {
    ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = 2.3;
    s.values.forEach(([t, v], i) => i === 0 ? ctx.moveTo(x(t), y(v)) : ctx.lineTo(x(t), y(v)));
    ctx.stroke();
  }
  if (!all.length) { ctx.textAlign = 'center'; ctx.fillStyle = palette.muted; ctx.font = '14px "Segoe UI", sans-serif'; ctx.fillText('Hier erscheint dein gemessener Verlauf.', W / 2, H / 2); }
}

export function drawCooling(canvas: HTMLCanvasElement, state: ViewState | null, config: Config) {
  const ctx = prepareCanvas(canvas, 900, 250);
  const temp = (v?: number) => v === undefined ? '—' : v.toFixed(1).replace('.', ',') + ' °C';
  const blocks = [
    { x: 40, label: 'Motorblock', value: temp(state?.engineC), color: palette.amber, subtitle: `${config.cooling.engineCapacityKjK} kJ/K` },
    { x: 342, label: 'Kühlmittel', value: temp(state?.coolantC), color: palette.teal, subtitle: `${config.cooling.coolantL} L · ${config.cooling.flowLMin} L/min` },
    { x: 643, label: 'Kühler', value: temp(state?.radiatorC), color: palette.blue, subtitle: `${config.cooling.radiatorWPerK} W/K · Lüfter ${config.cooling.fan}` }
  ];
  blocks.forEach(b => {
    ctx.strokeStyle = b.color; ctx.fillStyle = '#192a32'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.roundRect(b.x, 52, 205, 115, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = palette.ink; ctx.font = '14px "Segoe UI", sans-serif'; ctx.fillText(b.label, b.x + 18, 78);
    ctx.fillStyle = b.color; ctx.font = '26px "Cascadia Mono", Consolas, monospace'; ctx.fillText(b.value, b.x + 18, 117);
    ctx.fillStyle = palette.muted; ctx.font = '12px "Segoe UI", sans-serif'; ctx.fillText(b.subtitle, b.x + 18, 147);
  });
  ctx.strokeStyle = palette.teal; ctx.lineWidth = 3;
  for (const [x0, x1] of [[245, 342], [547, 643]]) { ctx.beginPath(); ctx.moveTo(x0, 109); ctx.lineTo(x1 - 10, 109); ctx.stroke(); ctx.fillStyle = palette.teal; ctx.beginPath(); ctx.moveTo(x1 - 6, 109); ctx.lineTo(x1 - 16, 102); ctx.lineTo(x1 - 16, 116); ctx.fill(); }
  ctx.strokeStyle = '#436373'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(745, 167); ctx.lineTo(745, 203); ctx.lineTo(442, 203); ctx.lineTo(442, 167); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = palette.muted; ctx.font = '12px "Cascadia Mono", Consolas, monospace';
  ctx.fillText('PUMPE / RÜCKLAUF', 590, 228);
  ctx.fillStyle = palette.amber; ctx.fillText(`${(state?.heatInKw ?? 0).toFixed(1)} kW →`, 142, 32);
  ctx.fillStyle = palette.blue; ctx.fillText(`→ Umgebung ${config.cooling.ambientC} °C`, 749, 32);
}
