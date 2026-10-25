/// <reference lib="webworker" />
import { Simulation, DEFAULT_CONFIG, runExperiment, type Config, type Controls, type ExperimentKind } from './model';

let simulation = new Simulation(DEFAULT_CONFIG);
let paused = false;
let nativeThermal = false;
let nativeSample: { heatW: number; speedMs: number } | null = null;
let last = performance.now();
let accumulator = 0;
let thermalRate = 1;
const post = (type = 'state') => self.postMessage({ type, state: { ...simulation.snapshot(), simPaused: paused }, config: simulation.config });

self.addEventListener('message', (event: MessageEvent) => {
  const m = event.data;
  try {
    if (m.type === 'start') simulation.start();
    if (m.type === 'stop') simulation.stop();
    if (m.type === 'ignition') simulation.setIgnition(!!m.value);
    if (m.type === 'starter') simulation.setStarter(!!m.value);
    if (m.type === 'controls') simulation.setControls(m.value as Partial<Controls>);
    if (m.type === 'reset') { simulation = new Simulation(m.config as Config); accumulator = 0; thermalRate=1; }
    if (m.type === 'cooling') simulation.setCooling(m.value);
    if (m.type === 'configure') simulation.setLiveConfig(m.config);
    if (m.type === 'thermalReset') simulation.resetThermal(m.value);
    if (m.type === 'thermalRate') thermalRate = [1, 10, 30].includes(m.value) ? m.value : 1;
    if (m.type === 'pause' && paused !== !!m.value) { paused = !!m.value; last = performance.now(); accumulator = 0; }
    if (m.type === 'backend') { nativeThermal = m.value === 'core'; nativeSample = null; }
    if (m.type === 'nativeHeat') nativeSample = m.value;
    if (m.type === 'experiment') {
      const result = runExperiment(m.kind as ExperimentKind, m.A, m.B);
      self.postMessage({ type: 'experiment', result });
      last = performance.now();
      accumulator = 0;
    }
    post();
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Simulationsfehler.' }); }
});

setInterval(() => {
  const now = performance.now();
  // Never fast-forward minutes after an inactive tab or stalled event loop.
  const elapsed = Math.max(0, Math.min((now - last) / 1000, 0.06));
  last = now;
  if (paused || (nativeThermal && !nativeSample)) return;
  accumulator += elapsed;
  while (accumulator >= 0.001) {
    if (nativeThermal) {
      simulation.state.t += 0.001;
      const heat = simulation.config.cooling.heatMode === 'manual' ? simulation.config.cooling.manualHeatKw * 1000 : nativeSample!.heatW;
      simulation.thermalStep(0.001 * thermalRate, heat, nativeSample!.speedMs);
    } else {
      simulation.step();
      if (thermalRate > 1) simulation.thermalStep(0.001 * (thermalRate - 1), simulation.state.heatInKw * 1000, simulation.state.velocity);
    }
    accumulator -= 0.001;
  }
  post();
}, 20);

post();
