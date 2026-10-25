import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { examplePair, runExperiment, timeSeriesCsv, type ExperimentKind, type State } from '../src/model';
const directory = new URL('../examples/', import.meta.url);
await mkdir(directory, { recursive: true });
const summary: Record<string, unknown> = { model: 'Engine Playground demo 0.1.0', native: false, date: '2026-10-14', experiments: {} };
for (const kind of ['inertia', 'gearing', 'cooling'] as ExperimentKind[]) {
  const pair = examplePair(kind);
  const run = runExperiment(kind, pair.A, pair.B);
  const repeated = runExperiment(kind, pair.A, pair.B);
  const json = JSON.stringify(run, null, 2);
  const hash = createHash('sha256').update(JSON.stringify(run)).digest('hex');
  const reproduced = createHash('sha256').update(JSON.stringify(repeated)).digest('hex') === hash;
  if (!reproduced) throw new Error('Reference run was not reproduced.');
  await writeFile(new URL(`reference-${kind}.json`, directory), json);
  const a = timeSeriesCsv(run.A, 'A', kind), b = timeSeriesCsv(run.B, 'B', kind);
  await writeFile(new URL(`reference-${kind}.csv`, directory), a + b.slice(b.indexOf('\n') + 1));
  const first = (data: State[], minT: number, check: (s: State) => boolean) => data.find(s => s.t >= minT && check(s))?.t;
  const metrics = kind === 'inertia' ? { riseTo4000AfterGasS: { A: first(run.A, 2, s => s.rpm >= 4000)! - 2, B: first(run.B, 2, s => s.rpm >= 4000)! - 2 }, fallTo2000AfterGasOffS: { A: first(run.A, 5, s => s.rpm <= 2000)! - 5, B: first(run.B, 5, s => s.rpm <= 2000)! - 5 } } : kind === 'gearing' ? { finalSpeedKmh: { A: run.A.at(-1)!.speedKmh, B: run.B.at(-1)!.speedKmh } } : { finalCoolantC: { A: run.A.at(-1)!.coolantC, B: run.B.at(-1)!.coolantC }, finalEngineC: { A: run.A.at(-1)!.engineC, B: run.B.at(-1)!.engineC } };
  (summary.experiments as any)[kind] = { durationS: run.durationS, samplesPerRun: run.A.length, dtS: run.dtS, sha256: hash, reproduced, metrics, maximumThermalBalanceErrorJ: Math.max(...run.A.concat(run.B).map(s => Math.abs(s.energyResidualJ))) };
}
await writeFile(new URL('../evidence/reference-results.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
