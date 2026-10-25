/// <reference lib="webworker" />
import { runExperiment } from './model';
self.addEventListener('message', ({ data }) => {
  try { self.postMessage({ result: runExperiment(data.kind, data.A, data.B) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Experiment fehlgeschlagen.' }); }
});
