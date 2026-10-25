import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../evidence/sound-m54-r6/', import.meta.url));
const rate = 44100;
function stats(pcm, from = 0, to = pcm.length) {
  let energy = 0, peak = 0, clipped = 0, longestZero = 0, zero = 0;
  for (let i = from; i < to; i++) { const x = pcm[i]; energy += x*x; peak = Math.max(peak, Math.abs(x)); clipped += Math.abs(x) >= 32767/32768; zero = x === 0 ? zero+1 : 0; longestZero = Math.max(zero, longestZero); }
  return { rms: Math.sqrt(energy/(to-from)), peak, clipped, clippedFraction: clipped/(to-from), longestZeroMs: longestZero/rate*1000 };
}
function spectrum(pcm, start) {
  const n = 32768, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = pcm[start+i] * (.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  for (let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let len=2;len<=n;len*=2)for(let a=0;a<n;a+=len)for(let j=0;j<len/2;j++){const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),k=a+j,l=k+len/2,vr=re[l]*c-im[l]*s,vi=re[l]*s+im[l]*c;re[l]=re[k]-vr;im[l]=im[k]-vi;re[k]+=vr;im[k]+=vi;}
  return Float64Array.from({length:n/2},(_,i)=>re[i]**2+im[i]**2);
}
const quantile = (x, q) => [...x].sort((a,b)=>a-b)[Math.floor((x.length-1)*q)];
function wave(samples) {
  const buf = Buffer.alloc(44+samples.length*2); buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(samples.length*2,40);
  samples.forEach((x,i)=>buf.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(x*32768))),44+2*i));return buf;
}
const report = { at: new Date().toISOString(), sampleRate: rate, listeningClipNativeWindow: [1.5,13], listeningTargetRms: .12, gainMethod: 'One constant RMS-matching gain per entire clip; no EQ or time stretching.', runs: [] };
const captures = [];
for (const name of ['before','after']) {
  const source = readFileSync(resolve(root, `${name}-raw.wav`));
  const pcm = Float64Array.from({length:(source.length-44)/2},(_,i)=>source.readInt16LE(44+2*i)/32768);
  const capture = JSON.parse(readFileSync(resolve(root, `${name}-capture.json`))); captures.push(capture);
  const clip = pcm.slice(1.5*rate,13*rate), inputStats = stats(clip), gain = Math.min(.12/inputStats.rms,.95/inputStats.peak);
  const audible = Float64Array.from(clip,x=>x*gain), out = wave(audible), file = `${name}.wav`;
  writeFileSync(resolve(root,file),out);
  const windows = [['idle',2,3.8],['blip',4,7.2],['higherRpm',10,13]].map(([label,start,end])=>{
    const rows = capture.rows.filter(r=>r.t>=start&&r.t<end), rpmMean=rows.reduce((s,r)=>s+r.rpm,0)/rows.length;
    const fft = spectrum(pcm,Math.round((start+(end-start)/2-.3715)*rate));
    const hz = rate/32768, band=(a,b)=>{let sum=0;for(let i=Math.ceil(a/hz);i<=Math.min(fft.length-1,Math.floor(b/hz));i++)sum+=fft[i];return sum;};
    const order3=band(rpmMean/20-5,rpmMean/20+5),order15=band(rpmMean/40-5,rpmMean/40+5);
    return {label,nativeWindow:[start,end],rpmMean,rpmMin:Math.min(...rows.map(r=>r.rpm)),rpmMax:Math.max(...rows.map(r=>r.rpm)),...stats(pcm,start*rate,end*rate),
      spectrumMethod:'Single 32768-sample Hann FFT, centered in this window; not a whole-window spectrum average.',
      order15To3Db:label==='blip'?null:10*Math.log10(order15/order3),
      orderMeasurementValid:label!=='blip',energyAbove2kHzFraction:band(2000,20000)/band(20,20000)};
  });
  const steady = capture.rows.filter(r=>r.t>1);
  const arrivals = capture.arrivals.slice(1).map((r,i)=>r.wallMs-capture.arrivals[i].wallMs);
  const drift = steady.map(r=>(r.wallMs-steady[0].wallMs)-(r.t-steady[0].t)*1000);
  report.runs.push({ name, file, sha256:createHash('sha256').update(out).digest('hex'), sound:capture.sound,balance:capture.balance,nativeOutputGain:capture.nativeOutputGain,
    raw:stats(pcm),windows, gain, output:stats(audible), outputDurationS:audible.length/rate,
    firstAudioMs:capture.firstAudioMs, audioDurationS:capture.actualAudioDurationS,
    nativeSimulationHz:[...new Set(capture.rows.map(r=>r.simulationHz))],
    nativeToWallFactor:(steady.at(-1).t-steady[0].t)/((steady.at(-1).wallMs-steady[0].wallMs)/1000),
    telemetryProcessingMsSmoothed:{median:quantile(steady.map(r=>r.processingMs),.5),p95:quantile(steady.map(r=>r.processingMs),.95)},
    packetGapMs:{median:quantile(arrivals,.5),p95:quantile(arrivals,.95),max:Math.max(...arrivals)},
    maxTelemetryClockDriftMs:Math.max(...drift.map(Math.abs)) });
}
const [a,b]=captures;
report.physicsComparison = { telemetryRows: [a.rows.length,b.rows.length], maxMatchedRpmDelta:Math.max(...a.rows.map((r,i)=>Math.abs(r.rpm-b.rows[i].rpm))), maxMatchedManifoldKpaDelta:Math.max(...a.rows.map((r,i)=>Math.abs(r.manifoldKpa-b.rows[i].manifoldKpa))), maxNativeTimeDelta:Math.max(...a.rows.map((r,i)=>Math.abs(r.t-b.rows[i].t))) };
report.limitations = ['Baseline native PCM clipping is retained and counted. Final WAV level matching cannot repair baseline clipping.', 'R6 headroom reduces live raw level by 9.12dB; production gain staging needs explicit integration and verification. WAVs use documented constant level matching.', 'Short Windows local bench only; no Linux hosted timing or long-run acceptance.', 'Idle is about 1000rpm in this model, not an OEM warm-idle calibration.', 'Generic impulse, fixed cam phase and simplified generic intake remain. No sample-based real M54 matching claim.'];
writeFileSync(resolve(root,'analysis.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
