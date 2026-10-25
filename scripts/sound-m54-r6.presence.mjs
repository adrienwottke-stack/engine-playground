// Lightweight offline round 2. Reuses R6 native PCM; never starts an engine/server.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { M54Presence, M54_R6_PRESENCE } from '../native/sound-m54-r6.presence.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const evidence=resolve(project,'evidence/sound-m54-r6'),output=resolve(evidence,'round2');
mkdirSync(output,{recursive:true});
const source=readFileSync(resolve(evidence,'after-raw.wav'));
assert.equal(source.toString('ascii',0,4),'RIFF');assert.equal(source.toString('ascii',36,40),'data');
const rate=source.readUInt32LE(24);assert.equal(rate,44100);assert.equal(source.readUInt16LE(22),1);assert.equal(source.readUInt16LE(34),16);
const input=Float64Array.from({length:(source.length-44)/2},(_,i)=>source.readInt16LE(44+2*i)/32768);
const eq=new M54Presence(rate),filtered=new Float64Array(input.length),blockTimes=[];
// Preserve filter state across the entire original run, before taking a crop.
const started=performance.now();
for(let i=0;i<input.length;i+=441){
  const end=Math.min(input.length,i+441),at=performance.now();
  eq.processBlock(input.subarray(i,end),filtered.subarray(i,end));blockTimes.push(performance.now()-at);
}
const elapsed=performance.now()-started,clip=filtered.slice(1.5*rate,13*rate);
function stats(samples){let sum=0,peak=0,clipped=0,zero=0,maxZero=0;for(const x of samples){assert.ok(Number.isFinite(x));sum+=x*x;peak=Math.max(peak,Math.abs(x));clipped+=Math.abs(x)>=32767/32768;zero=x===0?zero+1:0;maxZero=Math.max(maxZero,zero);}return {samples:samples.length,rms:Math.sqrt(sum/samples.length),peak,clipped,longestZeroMs:maxZero/rate*1000};}
const beforeGain=stats(clip),gain=Math.min(.12/beforeGain.rms,.9/beforeGain.peak);
const matched=Float64Array.from(clip,x=>x*gain),wave=Buffer.alloc(44+matched.length*2);
wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(matched.length*2,40);
matched.forEach((x,i)=>wave.writeInt16LE(Math.round(x*32768),44+2*i));
writeFileSync(resolve(output,'clearer.wav'),wave);
copyFileSync(resolve(evidence,'after.wav'),resolve(output,'previous.wav'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={at:new Date().toISOString(),feedback:'klingt noch sehr dumpf',source:'Existing final R6 native M54 PCM, no new native/audio load test.',
  sourceSha256:hash(source),previousSha256:hash(readFileSync(resolve(output,'previous.wav'))),candidateSha256:hash(wave),
  sampleRate:rate,nativeWindow:[1.5,13],durationS:matched.length/rate,settings:M54_R6_PRESENCE,
  responseDb:Object.fromEntries([50,100,200,400,800,1150,1600,2500,4000,6000].map(hz=>[hz,eq.responseDb(hz)])),
  beforeGain,gain,output:stats(matched),runtime:{processedNativeSeconds:input.length/rate,totalMs:elapsed,p95Block10ms: [...blockTimes].sort((a,b)=>a-b)[Math.floor(blockTimes.length*.95)],maxBlock10ms:Math.max(...blockTimes)},
  invariants:{sampleCountPreserved:matched.length===507150,noNewNativeProcess:true,noNewAudioTransport:true,noArtificialSoundSource:true,causalNoLookahead:true},
  limitations:['Corrective signal processing informed by native IR analysis and user feedback; not a measured matching filter fitted to the real recordings.','The 4000Hz solver and its bandwidth remain; EQ cannot recover missing real intake/valvetrain detail.','RMS matching is a single constant gain and not an assertion of equal perceived loudness.','No new live latency, mobile loudness or server performance acceptance.']};
assert.equal(report.output.clipped,0);assert.equal(report.durationS,11.5);assert.ok(Math.abs(report.output.rms-.12)<1e-6);
writeFileSync(resolve(output,'presence.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
