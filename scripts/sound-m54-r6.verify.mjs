import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, 'evidence/sound-m54-r6');
const analysis = JSON.parse(readFileSync(resolve(root, 'analysis.json')));
const reports = ['before','after'].map(name => JSON.parse(readFileSync(resolve(root, `${name}-capture.json`))));
assert.equal(reports[0].binarySha256, reports[1].binarySha256);
assert.ok(reports.every(r => r.exit.code===0 && !r.error && r.rows.every(s => s.simulationHz===4000)));
assert.equal(analysis.physicsComparison.maxNativeTimeDelta,0);
assert.ok(analysis.physicsComparison.maxMatchedRpmDelta<10,'A/B operating condition drift too large');
assert.equal(analysis.runs[1].raw.clipped,0,'Candidate native output clips before WAV conversion');
assert.ok(analysis.runs.every(r => r.outputDurationS===11.5 && r.output.peak<.95 && Math.abs(r.output.rms-.12)<1e-6));
const baseline = JSON.parse(readFileSync(resolve(root, 'source-manifest-before.json'),'utf8').replace(/^\uFEFF/,''));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
const sourceChanges = baseline.map(row => ({file:row.file,changed:row.sha256!==sha(resolve(project,row.file))}));
// The independent latency owner can change shared transport files concurrently.
// This offline bench imports neither transport nor worklets. Do not revert them.
const independentInputs = ['native/headless/assets/engines/bmw/M54B30.mr','native/reference-settings.mjs','native/tuning-settings.mjs'];
assert.ok(sourceChanges.filter(r=>independentInputs.includes(r.file)).every(r=>!r.changed),'Offline bench input changed; review capture provenance');
const parallelUnownedSourceDrift=sourceChanges.filter(r=>r.changed&&r.file!=='native/headless/core_host.cpp');
const processes = execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Name 'sound-m54-r6','clang++','ld.lld' -ErrorAction SilentlyContinue | Select-Object Id,ProcessName | ConvertTo-Json -Compress; exit 0`],{windowsHide:true,encoding:'utf8'}).trim();
assert.equal(processes,'','Own native/compiler process remains active');
const browser = await chromium.launch({headless:true});
const decoded = [];
try {
  const page = await browser.newPage();
  for(const name of ['before','after']) {
    const base64 = readFileSync(resolve(root,`${name}.wav`)).toString('base64');
    const result = await page.evaluate(async data => {
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      const context=new OfflineAudioContext(1,1,44100),buffer=await context.decodeAudioData(bytes.buffer);
      const samples=buffer.getChannelData(0);
      return {sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,samples:buffer.length,duration:buffer.duration,allFinite:samples.every(Number.isFinite)};
    },base64);
    assert.deepEqual(result,{sampleRate:44100,channels:1,samples:507150,duration:11.5,allFinite:true});
    decoded.push({name,...result});
  }
} finally { await browser.close(); }
const result = {at:new Date().toISOString(),technicalPass:true,subjectiveListeningAcceptance:false,sharedSourceChanges:sourceChanges,parallelUnownedSourceDrift,ownNativeOrCompilerProcesses:[],browserDecoded:decoded,assertions:'Same binary, actual 4000 Hz, comparable telemetry, native headroom unclipped, matched WAV RMS/duration, independent bench inputs unchanged, browser WAV decoding. Shared transport drift is reported for Root review, not reverted.'};
writeFileSync(resolve(root,'verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
