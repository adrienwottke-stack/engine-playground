export const COMMAND_LIMITS = { throttle: [0, 1], gear: [0, 5], clutch: [0, 1], holdRpm: [1000, 6500], volume: [0, 0.35] };
const numeric = (value, lo, hi, key) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < lo || value > hi) throw new Error(`Ungültiger Wert: ${key}`);
  return value;
};
const bool = (value, key) => { if (typeof value !== 'boolean') throw new Error(`Ungültiger Schalter: ${key}`); return value; };

export function validateCommand(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Befehl muss ein Objekt sein.');
  const allowed = ['active', 'throttle', 'ignition', 'starter', 'gear', 'clutch', 'dyno', 'holdRpm', 'volume', 'reset'];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('Unbekanntes Befehlsfeld.');
  const out = {};
  for (const key of ['active', 'ignition', 'starter', 'dyno', 'reset']) out[key] = bool(raw[key], key);
  for (const [key, [lo, hi]] of Object.entries(COMMAND_LIMITS)) out[key] = numeric(raw[key], lo, hi, key);
  if (!Number.isInteger(out.gear)) throw new Error('Gang muss ganzzahlig sein.');
  if (!out.active) { out.throttle = 0; out.ignition = false; out.starter = false; out.volume = 0; }
  return out;
}
export function commandLine(command, sequence, timestampMs, resetId) {
  const c = validateCommand(command);
  return [sequence, timestampMs, +c.active, c.throttle, +c.ignition, +c.starter, c.gear, c.clutch, +c.dyno, c.holdRpm, c.volume, resetId].join(' ') + '\n';
}
export function validateTelemetry(raw, now = Date.now()) {
  if (!raw || raw.schemaVersion !== 1 || raw.source !== 'engine-sim-original') throw new Error('Unbekannte native Telemetriequelle.');
  const timestampMs = numeric(raw.timestampMs, 0, Number.MAX_SAFE_INTEGER, 'Zeitstempel');
  if (now - timestampMs > 1000 || timestampMs - now > 1000) throw new Error('Native Telemetrie ist veraltet.');
  const sequence = numeric(raw.sequence, 0, Number.MAX_SAFE_INTEGER, 'Sequenz');
  const appliedSequence = numeric(raw.appliedSequence, 0, Number.MAX_SAFE_INTEGER, 'Bestätigte Sequenz');
  if (!Number.isInteger(sequence) || !Number.isInteger(appliedSequence)) throw new Error('Ungültige Telemetrie-Sequenz.');
  const g = raw.geometry;
  if (!g || g.cylinderCount !== 6) throw new Error('Die Schnittansicht erwartet das native I6-Preset mit sechs Zylindern.');
  const dynoEnabled = bool(raw.dynoEnabled, 'Prüfstand');
  if (!dynoEnabled && raw.dynoTorqueNm !== null) throw new Error('Dyno-Drehmoment ohne aktiven Prüfstand.');
  const gear = numeric(raw.gear, 0, 5, 'Gang');
  if (!Number.isInteger(gear)) throw new Error('Ungültiger nativer Gang.');
  return {
    schemaVersion: 1, source: 'engine-sim-original', timestampMs, sequence, appliedSequence,
    simTimeS: numeric(raw.simTimeS, 0, 1e9, 'Simulationszeit'), rpm: numeric(raw.rpm, 0, 20000, 'Drehzahl'),
    crankAngle: numeric(raw.crankAngle, 0, Math.PI * 4 + 1e-6, 'Kurbelwinkel'), throttle: numeric(raw.throttle, 0, 1, 'Pedal'),
    actualThrottle: numeric(raw.actualThrottle, 0, 1, 'Drossel'), ignition: bool(raw.ignition, 'Zündung'), starter: bool(raw.starter, 'Anlasser'),
    gear, clutch: numeric(raw.clutch, 0, 1, 'Kupplung'), speedMs: numeric(raw.speedMs, -150, 150, 'Geschwindigkeit'), dynoEnabled,
    dynoTorqueNm: raw.dynoTorqueNm === null ? null : numeric(raw.dynoTorqueNm, -5000, 5000, 'Dyno-Drehmoment'),
    geometry: { cylinderCount: 6, boreMm: numeric(g.boreMm, 70, 100, 'Bohrung'), strokeMm: numeric(g.strokeMm, 60, 105, 'Hub'), rodMm: numeric(g.rodMm, 110, 170, 'Pleuel') },
    engineName: typeof raw.engineName === 'string' ? raw.engineName.slice(0, 120) : 'Native I6'
  };
}
