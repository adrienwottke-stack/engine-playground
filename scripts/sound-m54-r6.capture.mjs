// Serial, local-only native bench. Shared runtime/ports receive GETs only.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DEFAULT_SOUND, referenceScript } from '../native/reference-settings.mjs';
import { balancedM54Exhaust, M54_R6_SOUND } from '../native/sound-m54-r6.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const headless = resolve(project, 'native/headless');
const evidence = resolve(project, 'evidence/sound-m54-r6');
const binary = resolve(evidence, 'build/sound-m54-r6.exe');
const original = readFileSync(resolve(headless, 'assets/engines/bmw/M54B30.mr'), 'utf8');
const hash = b => createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const duration = 13;
const preflight = [];
async function checkIdle() {
  const states = [];
  for (const port of [4196, 4198]) {
    const state = await fetch(`http://127.0.0.1:${port}/api/core/state`, { signal: AbortSignal.timeout(1500) }).then(r => r.json()).catch(() => null);
    const s = state?.state;
    states.push({ port, connected: state?.connected, rpm: s?.rpm, ignition: s?.ignition, starter: s?.starter });
    if (s && (s.ignition || s.starter || Math.abs(s.rpm) > 1)) throw Error(`Port ${port} engine is active; no parallel native test.`);
  }
  const script = `Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^engine-core|^sound-m54-r6|^ssh|^ffmpeg' } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress`;
  const processes = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, encoding: 'utf8' });
  const list = processes.trim() ? [].concat(JSON.parse(processes)) : [];
  if (list.some(p => /^sound-m54-r6|^ssh|^ffmpeg/.test(p.Name))) throw Error('Another native/audio transport process exists; postpone bench.');
  // Both existing native child processes must belong to the verified stopped previews.
  const allowedParents = new Set([42012, 52968]);
  if (list.some(p => /^engine-core/.test(p.Name) && !allowedParents.has(p.ParentProcessId))) throw Error('Unknown native process; postpone bench.');
  preflight.push({ at: new Date().toISOString(), states, processes: list });
  writeFileSync(resolve(evidence, 'preflight.json'), JSON.stringify(preflight, null, 2));
}
function wave(pcm) {
  const h = Buffer.alloc(44); h.write('RIFF'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function capture(name, sound, balance) {
  await checkIdle();
  const runtime = resolve(evidence, `runtime-${name}`);
  mkdirSync(resolve(runtime, 'bin'), { recursive: true });
  cpSync(resolve(headless, 'assets'), resolve(runtime, 'assets'), { recursive: true });
  cpSync(resolve(headless, 'es'), resolve(runtime, 'es'), { recursive: true });
  let script = referenceScript(original, sound, [84, 89.6, 135]);
  if (balance) script = balancedM54Exhaust(script);
  writeFileSync(resolve(runtime, 'assets/runtime_i6.mr'), script);
  writeFileSync(resolve(runtime, 'assets/main.mr'), 'import "engine_sim.mr"\nimport "runtime_i6.mr"\nmain()\n');
  writeFileSync(resolve(evidence, `${name}-runtime.mr`), script);
  const child = spawn(binary, [], { cwd: resolve(runtime, 'bin'), windowsHide: true,
    env: { ...process.env, EP_CORE_SIMULATION_HZ: '4000', EP_CORE_SYNCHRONOUS_AUDIO: '1', EP_CORE_FLUSH_SUBNORMALS: '1', EP_CORE_SOUND_M54_R6_HEADROOM: balance ? '1' : '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending = Buffer.alloc(0), stderr = '', error, finished = false, sequence = 0;
  const chunks = [], rows = [], commands = [], arrivals = [];
  const start = performance.now(); let firstAudioMs = null, lastState;
  child.stderr.on('data', d => stderr = (stderr + d).slice(-10000));
  child.stdin.on('error', () => {}); child.on('error', e => { error = e; });
  const exitPromise = new Promise(ok => child.once('exit', (code, signal) => { finished = true; ok({ code, signal }); }));
  function send(t, rpm = 0, stop = false) {
    const starter = !stop && t < 1.3;
    let throttle = t < 1.3 ? .04 : t < 4 ? 0 : t < 4.7 ? .22 : t < 7.2 ? 0 : .20;
    const dyno = !stop && t >= 7.2;
    const load = dyno ? Math.max(0, Math.min(200, 80 + (rpm - 4200) * .24)) : 0;
    if (stop) throttle = 0;
    const fields = [++sequence, Date.now(), +!stop, throttle, +!stop, +starter, 0, 0, +dyno, load, .08, 0,
      .18, 0, 1450, 3.15, .31, .65, .012, 0, 4.2, 2.5, 1.65, 1.2, 1, 0, 0,
      sound.hfGain, sound.noise, sound.jitter, sound.convolution, 1];
    if (child.stdin.writable) child.stdin.write(fields.join(' ') + '\n');
    commands.push({ atNativeT: t, throttle, starter, dyno, loadNm: load, stop });
  }
  send(0);
  child.stdout.on('data', data => {
    pending = Buffer.concat([pending, data]);
    while (pending.length >= 8) {
      const type = pending.readUInt32LE(0), length = pending.readUInt32LE(4);
      if (length > 200000 || ![1, 2, 3, 4].includes(type)) { error = Error('Invalid native frame'); child.kill(); return; }
      if (pending.length < 8 + length) break;
      const payload = pending.subarray(8, 8 + length); pending = pending.subarray(8 + length);
      if (type === 2 && !finished) {
        if (firstAudioMs === null) firstAudioMs = performance.now() - start;
        chunks.push(Buffer.from(payload)); arrivals.push({ wallMs: performance.now() - start, samples: payload.length / 2, t: lastState?.t ?? 0 });
      }
      if (type === 1) {
        const s = JSON.parse(payload); lastState = s;
        rows.push({ t: s.t, rpm: s.rpm, simulationHz: s.simulationHz, sequence: s.sequence, starter: s.starter,
          ignition: s.ignition, throttle: s.actualThrottle, manifoldKpa: s.manifoldKpa, torqueNm: s.torqueNm,
          processingMs: s.processingMs, wallMs: performance.now() - start, sound: s.sound });
        if (s.simulationHz !== 4000) { error = Error('Actual native simulation must report 4000 Hz.'); child.kill(); return; }
        if (s.t < duration) send(s.t, s.rpm);
        else if (!finished) { finished = true; send(s.t, s.rpm, true); child.stdin.end(); }
      }
    }
  });
  const deadline = setTimeout(() => { error = Error('Bounded capture timed out (45s wall)'); child.kill(); }, 45000);
  const heartbeat = setInterval(() => { if (lastState && !finished) send(lastState.t, lastState.rpm); }, 500);
  let exit;
  try { exit = await exitPromise; } finally { clearTimeout(deadline); clearInterval(heartbeat); }
  const pcm = Buffer.concat(chunks);
  const report = { name, recordedAt: new Date().toISOString(), binarySha256: hash(readFileSync(binary)), sound, balance, nativeOutputGain: balance ? .35 : 1,
    requestedDurationS: duration, actualAudioDurationS: pcm.length / 88200, firstAudioMs, wallMs: performance.now() - start,
    sourceScriptSha256: hash(script), exit, stderr, error: error?.message, rows, commands, arrivals };
  writeFileSync(resolve(evidence, `${name}-capture.json`), JSON.stringify(report, null, 2));
  writeFileSync(resolve(evidence, `${name}-raw.wav`), wave(pcm));
  console.log(JSON.stringify({ name, audioSeconds: pcm.length / 88200, wallMs: report.wallMs, rpmPeak: Math.max(...rows.map(r => r.rpm)), error: error?.message }));
  if (error) throw error;
  if (exit.code !== 0 || pcm.length < 44100 * 10 * 2) throw Error('Incomplete native capture.');
  return report;
}
if (!existsSync(binary)) throw Error('Build isolated current core first.');
if (!process.argv.includes('--after-only')) await capture('before', DEFAULT_SOUND, false);
await sleep(250);
await capture('after', M54_R6_SOUND, true);
