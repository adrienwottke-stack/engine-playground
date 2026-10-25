// Read-only live diagnosis. Compare the existing hosted and local buffer modes.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base='https://engine.127.0.0.1.sslip.io';
const source=await(await fetch(base+'/native-audio.js')).text();
if(!source.includes('this.startSamples=this.hosted?52920:2646'))throw Error('Unexpected current worklet');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
let mutations=0;
await page.route('**/api/core/command',route=>{mutations++;return route.abort();});
const health=await(await fetch(base+'/api/health')).json();
try{
 await page.goto(base+'/api/health');
 await page.evaluate(async()=>{
  const context=new AudioContext();
  await context.audioWorklet.addModule('/native-audio.js?v=latency-audit');
  const silent=context.createGain();silent.gain.value=0;silent.connect(context.destination);
  window.latencyAudit={context,profiles:{}};
  for(const key of ['live1200','probe60']){
   const node=new AudioWorkletNode(context,'native-engine-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{hostedRealtime:key==='live1200'}});
   const stream=new Worker('/native-stream.js?v=0.3.1'),channel=new MessageChannel();
   const profile={node,stream,stats:null,timing:null};window.latencyAudit.profiles[key]=profile;
   node.port.onmessage=({data})=>{if(data.type==='stats')profile.stats=data;};
   stream.onmessage=({data})=>{if(data.type==='timing')profile.timing=data;};
   node.port.postMessage({type:'volume',value:.5,muted:false});node.connect(silent);
   node.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);
   stream.postMessage({type:'connect',port:channel.port2},[channel.port2]);
  }
  await context.resume();
 });
 await page.waitForTimeout(2200);
 const rows=[],start=performance.now();
 while(performance.now()-start<20000){
  rows.push(await page.evaluate(async()=>{
   const a=window.latencyAudit,s=await(await fetch('/api/core/state')).json();
   return {at:performance.now(),baseLatencyMs:a.context.baseLatency*1000,outputLatencyMs:(a.context.outputLatency??0)*1000,
    profiles:Object.fromEntries(Object.entries(a.profiles).map(([k,p])=>[k,{...p.stats,...p.timing}])),
    state:s.state&&{rpm:s.state.rpm,t:s.state.t,hostIdle:s.state.hostIdle,processingMs:s.state.processingMs,ageMs:Date.now()-s.state.timestampMs}};
  }));
  await page.waitForTimeout(500);
 }
 const summary={health,mutations,sourceSha256:createHash('sha256').update(source).digest('hex'),runningSamples:rows.filter(r=>r.state?.rpm>650).length,profiles:{}};
 for(const key of ['live1200','probe60']){
  const vals=rows.map(r=>r.profiles[key]),first=vals[0],last=vals.at(-1);
  summary.profiles[key]={targetMs:last.targetBufferMs,minMs:Math.min(...vals.map(v=>v.bufferMs)),meanMs:vals.reduce((s,v)=>s+v.bufferMs,0)/vals.length,maxMs:Math.max(...vals.map(v=>v.bufferMs)),underruns:last.underruns-first.underruns,droppedSamples:last.droppedSamples-first.droppedSamples};
 }
 summary.baseLatencyMs=rows.at(-1).baseLatencyMs;summary.outputLatencyMs=rows.at(-1).outputLatencyMs;
 await mkdir('evidence/audio-latency-r5b-20261025',{recursive:true});
 await writeFile('evidence/audio-latency-r5b-20261025/audit.json',JSON.stringify({...summary,rows},null,2));
 console.log(JSON.stringify(summary));
}finally{await page.evaluate(async()=>{if(window.latencyAudit){for(const p of Object.values(window.latencyAudit.profiles))p.stream.terminate();await window.latencyAudit.context.close();}}).catch(()=>{});await browser.close();}
