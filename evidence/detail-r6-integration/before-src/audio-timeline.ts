import './audio-timeline.css';
import type { EngineAudio } from './audio';
import type { ViewState } from './drawing';

type Sample = { time: number; rpm: number | null; speedKmh: number | null; level: number };
type Options = { audio: EngineAudio; state: () => ViewState | null; mode: () => string; config: () => unknown; stopMotor: () => void };

// Captures the existing output signal locally. No microphone or new sound generator.
export function installAudioTimeline(options: Options) {
  const host = document.querySelector('[data-page="mechanics"]');
  if (!host) return;
  const panel = document.createElement('article');
  panel.className = 'panel audio-timeline';
  panel.innerHTML = `<div class="panel-heading"><div><span class="panel-kicker">SOUND-ZEITLEISTE</span><h2>Deinen Motorlauf wieder anhören</h2></div><span class="mini-tag">Lokal · bis 30 s</span></div>
    <p class="panel-note">Motor starten, Aufnahme beginnen und Gas geben. Danach kannst du den aufgenommenen Ton zurückspulen und langsamer anhören.</p>
    <div class="timeline-actions"><button class="primary-button" data-action="record">Aufnahme starten</button><button class="secondary-button" data-action="finish" disabled>Aufnahme beenden</button><button class="secondary-button" data-action="play" disabled>Wiedergeben</button><button class="text-button" data-action="pause" disabled>Pause</button></div>
    <div class="timeline-screen"><canvas aria-label="Lautstärkeverlauf der Aufnahme" role="img"></canvas><label class="timeline-seek">Position <input type="range" min="0" max="0" step="0.01" value="0" aria-label="Position in der Tonaufnahme" disabled /></label><div class="timeline-readings"><output data-value="time">0,0 / 0,0 s</output><output data-value="rpm">Aufnahme · — 1/min</output><output data-value="speed">— km/h</output></div></div>
    <div class="timeline-actions"><label>Wiedergabetempo <select aria-label="Tempo der Tonaufnahme"><option value="0.5">0,5× · tiefere Tonhöhe</option><option value="1" selected>1× · Original</option><option value="2">2× · höhere Tonhöhe</option></select></label><button class="text-button" data-action="audio" disabled>Ton herunterladen</button><button class="text-button" data-action="data" disabled>Messverlauf herunterladen</button></div>
    <p class="panel-note timeline-status" role="status">Noch keine Aufnahme. Starte zuerst den Motor.</p><p class="panel-note">Wiedergabe stoppt den laufenden Motor. Der obere Motorschnitt bleibt eine Live-Ansicht. Aufnahme-Messwerte sind zeitlich angenäherte Browserwerte; die Physik wird nicht zurückgespult. Beim Neuladen geht die Aufnahme verloren.</p>`;
  host.append(panel);
  const button = (name: string) => panel.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
  const status = panel.querySelector<HTMLElement>('.timeline-status')!;
  const seek = panel.querySelector<HTMLInputElement>('input')!;
  const tempo = panel.querySelector<HTMLSelectElement>('select')!;
  const canvas = panel.querySelector<HTMLCanvasElement>('canvas')!;
  const player = new Audio();
  player.preservesPitch = false;
  player.preload = 'auto';
  let recorder: MediaRecorder | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let sourceNode: AudioWorkletNode | null = null;
  let chunks: Blob[] = [], samples: Sample[] = [];
  let blob: Blob | null = null, url = '', start = 0, duration = 0, recordingMode = '', initialConfig: unknown;
  let timer = 0, starting = false, finishing = false;
  const fmt = (n: number, digits = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : null;
  const recording = () => recorder?.state === 'recording';
  function controls() {
    button('record').disabled = !!recorder || starting || finishing;
    button('finish').disabled = !recording();
    for (const name of ['play', 'audio', 'data']) button(name).disabled = !blob || !!recorder || starting || finishing;
    button('pause').disabled = player.paused;
    seek.disabled = !blob || !!recorder;
  }
  function disconnect() {
    if (destination && sourceNode) { try { sourceNode.disconnect(destination); } catch { /* Context may have closed on backend change. */ } }
    destination?.stream.getTracks().forEach(track => track.stop());
    destination = null; sourceNode = null;
  }
  function draw() {
    const width = Math.max(1, canvas.clientWidth), height = 90, dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== height * dpr) { canvas.width = Math.round(width * dpr); canvas.height = height * dpr; }
    const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#30434c'; ctx.beginPath(); ctx.moveTo(0, 45); ctx.lineTo(width, 45); ctx.stroke();
    const span = Math.max(duration, .1), peak = Math.max(.005, ...samples.map(s => s.level));
    ctx.strokeStyle = '#6dc9be';
    for (const sample of samples) { const x = sample.time / span * width, h = Math.min(38, sample.level / peak * 38); ctx.beginPath(); ctx.moveTo(x, 45 - h); ctx.lineTo(x, 45 + h); ctx.stroke(); }
    const position = recording() ? duration : Math.min(duration, player.currentTime || 0);
    ctx.strokeStyle = '#ddb17b'; ctx.beginPath(); ctx.moveTo(position / span * width, 3); ctx.lineTo(position / span * width, 87); ctx.stroke();
    panel.querySelector('[data-value="time"]')!.textContent = `${fmt(position)} / ${fmt(duration)} s`;
    const sample = samples.length ? samples.reduce((best, value) => Math.abs(value.time - position) < Math.abs(best.time - position) ? value : best) : null;
    panel.querySelector('[data-value="rpm"]')!.textContent = `Aufnahme · ${sample?.rpm == null ? '—' : fmt(sample.rpm, 0)} 1/min`;
    panel.querySelector('[data-value="speed"]')!.textContent = `${sample?.speedKmh == null ? '—' : fmt(sample.speedKmh)} km/h`;
    if (!recording()) seek.value = String(position);
  }
  function stopRecording(reason = 'Aufnahme abgeschlossen. Wiedergeben oder herunterladen.') {
    if (!recording()) return;
    finishing = true; window.clearInterval(timer); duration = (performance.now() - start) / 1000;
    seek.max = String(duration); status.textContent = reason;
    recorder!.stop(); controls();
  }
  button('record').addEventListener('click', async () => {
    if (starting || recorder) return;
    if (typeof MediaRecorder === 'undefined') { status.textContent = 'Dieser Browser unterstützt keine Tonaufnahme.'; return; }
    const state = options.state();
    if (!state || !(Number(state.rpm) > 100)) { status.textContent = 'Starte zuerst den Motor, dann die Aufnahme.'; return; }
    starting = true; controls(); player.pause();
    try {
      recordingMode = options.mode(); await options.audio.enable(recordingMode as 'core' | 'demo');
      if (options.mode() !== recordingMode) throw new Error('Der Motormodus hat gewechselt. Starte die Aufnahme erneut.');
      if (options.audio.muted || options.audio.volume <= 0) throw new Error('Schalte den Ton ein und erhöhe die Lautstärke vor der Aufnahme.');
      const context = options.audio.context, node = options.audio.node;
      if (!context || !node) throw new Error('Ton ist noch nicht verfügbar.');
      destination = context.createMediaStreamDestination(); sourceNode = node;
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = mimeType ? new MediaRecorder(destination.stream, { mimeType }) : new MediaRecorder(destination.stream);
      sourceNode.connect(destination);
      const activeRecorder = recorder;
      chunks = []; samples = []; blob = null; initialConfig = structuredClone(options.config());
      if (url) URL.revokeObjectURL(url); url = ''; player.removeAttribute('src'); player.load();
      activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onerror = () => { status.textContent = 'Tonaufnahme fehlgeschlagen. Bitte erneut versuchen.'; stopRecording(status.textContent); };
      activeRecorder.onstop = () => {
        blob = chunks.length ? new Blob(chunks, { type: activeRecorder.mimeType }) : null;
        if (blob) { url = URL.createObjectURL(blob); player.src = url; }
        else status.textContent = 'Keine Audiodaten aufgenommen. Prüfe den Ton und versuche es erneut.';
        disconnect(); recorder = null; finishing = false; controls(); draw();
      };
      activeRecorder.start(250); start = performance.now(); duration = 0;
      status.textContent = `${recordingMode === 'core' ? 'Physischer Motor' : 'Demo-Ton'} wird aufgenommen. Gib Gas; nach 30 s endet die Aufnahme automatisch.`;
      timer = window.setInterval(() => {
        duration = (performance.now() - start) / 1000;
        const current = options.state();
        samples.push({ time: duration, rpm: number(current?.rpm), speedKmh: number(current?.speedKmh), level: options.audio.signal().rms }); draw();
        if (options.audio.node !== sourceNode || options.mode() !== recordingMode || !current) stopRecording('Aufnahme beendet: Motorverbindung oder Modus hat gewechselt.');
        else if (document.hidden) stopRecording('Aufnahme beendet: Werkbank ist im Hintergrund.');
        else if (duration >= 30) stopRecording();
      }, 100);
    } catch (error) { recorder = null; disconnect(); status.textContent = error instanceof Error ? error.message : 'Aufnahme fehlgeschlagen.'; }
    finally { starting = false; controls(); }
  });
  button('finish').addEventListener('click', () => stopRecording());
  button('play').addEventListener('click', async () => {
    if (!blob || recording()) return;
    options.stopMotor(); options.audio.silence();
    if (player.ended || player.currentTime >= duration - .02) player.currentTime = 0;
    player.playbackRate = Number(tempo.value);
    try { await player.play(); status.textContent = 'Du hörst die Aufnahme. Der laufende Motor wurde gestoppt.'; } catch { status.textContent = 'Wiedergabe fehlgeschlagen. Lade den Ton herunter oder nimm erneut auf.'; }
    controls();
  });
  button('pause').addEventListener('click', () => { player.pause(); controls(); });
  tempo.addEventListener('change', () => { player.playbackRate = Number(tempo.value); });
  seek.addEventListener('input', () => { if (blob) { player.currentTime = Math.min(duration, Number(seek.value)); draw(); } });
  for (const event of ['timeupdate', 'ended', 'pause']) player.addEventListener(event, () => {
    if (event === 'ended') status.textContent = 'Wiedergabe beendet. Du kannst erneut abspielen oder eine neue Aufnahme starten.';
    else if (event === 'pause' && blob && !recorder && !player.ended) status.textContent = 'Wiedergabe pausiert. Verschiebe die Position oder spiele weiter.';
    draw(); controls();
  });
  function download(name: string, payload: Blob) {
    const link = document.createElement('a'), downloadUrl = URL.createObjectURL(payload); link.href = downloadUrl; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
  }
  button('audio').addEventListener('click', () => { if (blob) download(`engine-playground-${recordingMode}.${blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'}`, blob); });
  button('data').addEventListener('click', () => download('engine-playground-aufnahme.json', new Blob([JSON.stringify({ schemaVersion: 1, source: recordingMode, durationS: duration, mimeType: blob?.type, alignment: 'Browser wall clock; telemetry approximate, not sample-synchronous', initialConfig, samples }, null, 2)], { type: 'application/json' })));
  document.querySelector('#start')?.addEventListener('click', () => { player.pause(); controls(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopRecording('Aufnahme beendet: Werkbank ist im Hintergrund.'); player.pause(); } });
  window.addEventListener('pagehide', () => { window.clearInterval(timer); if (recording()) recorder!.stop(); player.pause(); disconnect(); if (url) URL.revokeObjectURL(url); });
  new ResizeObserver(draw).observe(canvas);
  controls(); draw();
}
