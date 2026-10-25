import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.RESPONSIVE_BASE||'http://127.0.0.1:4194';
const output=process.env.RESPONSIVE_OUTPUT||'evidence/responsive-20261025/browser-private.json';
const duration=Number(process.env.RESPONSIVE_SECONDS||92);
await mkdir('evidence/responsive-20261025',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
if(process.env.RESPONSIVE_PREVIEW==='1')await page.context().addCookies([{url:base,name:'EngineAudioPreview',value:'responsive01-20261025',secure:true,sameSite:'Lax'}]);
const network=await page.context().newCDPSession(page);await network.send('Network.enable');
const audioSocketIds=new Set(),networkAudioFrames=[];
network.on('Network.webSocketCreated',e=>{if(e.url.includes('/api/core/audio-socket'))audioSocketIds.add(e.requestId);});
network.on('Network.webSocketFrameReceived',e=>{if(audioSocketIds.has(e.requestId))networkAudioFrames.push(e.timestamp*1000);});
const networkEmulated=process.env.RESPONSIVE_NETWORK!=='real';
if(networkEmulated)await network.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:1250000,uploadThroughput:625000,connectionType:'wifi'});
const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
await page.addInitScript(()=>{
 const p=window.__audioProbe={context:null,played:[],meters:[],stats:[],inputs:[],commands:[],states:[],packets:[]};
 const W=window.Worker;window.Worker=class extends W{constructor(...args){super(...args);if(String(args[0]).includes('native-control.js'))this.addEventListener('message',({data})=>{if(data.type==='command-observed'&&data.accepted)p.commands.push({issuedAt:data.sentAt-performance.timeOrigin,receivedAt:data.receivedAt-performance.timeOrigin,sequence:data.sequence,throttle:data.throttle,ignition:data.ignition,maxGapMs:data.maxGapMs,transport:data.transport});});if(String(args[0]).includes('native-stream.js'))this.addEventListener('message',({data})=>{if(data.type==='timing')p.packets.push({...data,at:performance.now()});});}};
 const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...args){super(...args);p.context=this;}};
 const AW=window.AudioWorkletNode;window.AudioWorkletNode=class extends AW{constructor(...args){super(...args);const context=args[0];
  this.port.addEventListener('message',({data})=>{
   const stamp=context.getOutputTimestamp?.(),now=performance.now();
   const outputAt=stamp?.contextTime>0?stamp.performanceTime+(data.contextTime-stamp.contextTime)*1000:now+(data.contextTime-context.currentTime)*1000+(context.baseLatency+(context.outputLatency||0))*1000;
   if(data.type==='played')p.played.push({...data,outputAt,seenAt:now});
   if(data.type==='meter')p.meters.push({...data,outputAt,seenAt:now});
   if(data.type==='stats')p.stats.push({...data,at:now});
  });this.port.start();this.port.postMessage({type:'meter',enabled:true});
 }};
 const original=window.fetch;window.fetch=async function(...args){const issuedAt=performance.now(),response=await original.apply(this,args);
  if(String(args[0]).includes('/api/core/command')&&args[1]?.body){const body=JSON.parse(args[1].body);response.clone().json().then(reply=>{if(reply.accepted)p.commands.push({issuedAt,receivedAt:performance.now(),sequence:reply.sequence,throttle:body.controls.throttle,ignition:body.ignition});}).catch(()=>{});}
  return response;
 };
});
let report={base,errors,network:networkEmulated?{emulated:true,latencyMs:20,downloadMbit:10,uploadMbit:5}:{emulated:false,connection:'actual desktop internet, mobile viewport'}};
try{
 const routed=await(await page.request.get(base+'/api/health')).json();
 if(routed.release!==(process.env.RESPONSIVE_EXPECTED_RELEASE||'responsive01-preview'))throw Error('Unexpected target before any controls: '+routed.release);
 await page.goto(base+'/#mechanics',{waitUntil:'networkidle',timeout:40000});
 report.renderer=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2'),d=g?.getExtension('WEBGL_debug_renderer_info');return g&&d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unavailable';});
 if(/SwiftShader|software/i.test(report.renderer))throw Error('This acceptance requires actual GPU rendering; software rendering is a separate stress test.');
 await page.waitForFunction(()=>document.querySelector('.engine-three-host')?.dataset.audioWarm==='ready'||document.querySelector('.engine-three-host')?.dataset.webgl==='unavailable',{},{timeout:150000});
 report.graphicsReadyMs=await page.evaluate(()=>performance.now());
 report.entry=await page.locator('script[type="module"][src]').first().getAttribute('src');
 report.graphicsWarmup=await page.evaluate(()=>{const d=document.querySelector('.engine-three-host')?.dataset;return{state:d?.audioWarm,batches:Number(d?.audioWarmBatches),maxBatchMs:Number(d?.audioWarmMaxBatchMs)};});
 await page.locator('#start').click();await page.waitForFunction(()=>window.__playground?.state?.rpm>700,{},{timeout:30000});
 await page.waitForTimeout(2200);
 await page.evaluate(testDuration=>{
  const p=window.__audioProbe;p.duration=testDuration;p.startAt=performance.now();p.first=window.__playground.state;p.firstStats=p.stats.at(-1);let previous=0;
  p.timer=setInterval(()=>{const t=(performance.now()-p.startAt)/1000,phase=t%12,value=t<p.duration-3&&phase>=6&&phase<7.8?25:0;
   if(t>46&&!p.blocked){p.blocked=true;const until=performance.now()+450;while(performance.now()<until){};}
   if(value!==previous){const el=document.querySelector('#throttle'),at=performance.now();el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));p.inputs.push({at,value});previous=value;}
   const s=window.__playground.state;p.states.push({at:performance.now(),t:s?.t,rpm:s?.rpm,ignition:s?.ignition});
  },100);
 },duration);
 await page.waitForTimeout(duration*1000);
 const data=await page.evaluate(()=>{const p=window.__audioProbe;clearInterval(p.timer);return {...p,context:undefined,timer:undefined,outputTiming:{sampleRate:p.context.sampleRate,baseMs:p.context.baseLatency*1000,outputMs:(p.context.outputLatency||0)*1000},last:window.__playground.state,endAt:performance.now(),health:null,audioTransport:document.getElementById('app').dataset.audioStreamTransport};});
 const health=await page.evaluate(async()=>await(await fetch('/api/health')).json());
 const first=data.firstStats,last=data.stats.at(-1),stats=data.stats.filter(s=>s.at>=data.startAt),meters=data.meters.filter(m=>m.outputAt>=data.startAt&&m.outputAt<=data.endAt);
 const inputs=data.inputs.map(input=>{
  const command=data.commands.filter(c=>c.issuedAt>=input.at-.5&&c.issuedAt<input.at+1000&&Math.abs(c.throttle-input.value/100)<.001).sort((a,b)=>a.issuedAt-b.issuedAt)[0];
  const played=command&&data.played.find(p=>p.sequence>=command.sequence);
  const baseline=data.meters.filter(m=>m.outputAt<input.at&&m.outputAt>input.at-400);
  const baselineRms=baseline.reduce((s,m)=>s+m.rms,0)/Math.max(1,baseline.length);
  const sound=input.value>0&&command?data.meters.find(m=>m.sequence>=command.sequence&&m.outputAt>=input.at&&m.outputAt<input.at+1200&&m.rms>Math.max(.06,baselineRms*1.8)):null;
  return {...input,sequence:command?.sequence,pcmResponseMs:played?played.outputAt-input.at:null,signalResponseMs:sound?sound.outputAt-input.at:null,baselineRms};
 });
 const percentile=(v,q)=>{const a=v.filter(Number.isFinite).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*q)];};
 const pcm=inputs.map(i=>i.pcmResponseMs).filter(v=>v!==null),onsets=inputs.filter(i=>i.value>0);
 const wallS=(data.endAt-data.startAt)/1000;
 report={...report,health,wallS,realtimeRatio:(data.last.t-data.first.t)/wallS,underruns:last.underruns-first.underruns,droppedSamples:last.droppedSamples-first.droppedSamples,pcmRate:(last.receivedSamples-first.receivedSamples)/wallS,
  bufferMeanMs:stats.reduce((s,x)=>s+x.bufferMs,0)/stats.length,bufferMaxMs:Math.max(...stats.map(x=>x.maxBufferMs)),bufferTargetMs:last.targetBufferMs,
  totalUnderruns:last.underruns,totalDroppedSamples:last.droppedSamples,
  pcmResponseP50Ms:percentile(pcm,.5),pcmResponseP95Ms:percentile(pcm,.95),pcmResponseMaxMs:Math.max(...pcm),signalResponseP95Ms:percentile(onsets.map(i=>i.signalResponseMs),.95),
  minOutputRms:Math.min(...meters.map(m=>m.rms)),inputs,data};
 report.maxCommandGapMs=Math.max(...data.commands.map(c=>c.maxGapMs??0));
 report.audioTransport=data.audioTransport;report.controlTransports=[...new Set(data.commands.map(c=>c.transport).filter(Boolean))];
 report.outputTiming=data.outputTiming;
 report.workerPcmMaxGapMs=Math.max(...data.packets.map(p=>p.maxPacketGapMs));
 const packetGaps=networkAudioFrames.slice(1).map((at,i)=>({atMs:at-networkAudioFrames[0],gapMs:at-networkAudioFrames[i]}));
 report.networkPcmMaxGapMs=Math.max(...packetGaps.map(p=>p.gapMs));report.networkPcmPauses=packetGaps.filter(p=>p.gapMs>60);
 report.passed=!errors.length&&wallS>=85&&report.realtimeRatio>=.995&&report.underruns===0&&report.droppedSamples===0&&report.bufferMaxMs<=245&&pcm.length===inputs.length&&inputs.length>=12&&pcm.every(ms=>ms>=0)&&report.pcmResponseP95Ms<=300&&report.pcmResponseMaxMs<=350&&onsets.every(i=>i.signalResponseMs!==null)&&report.signalResponseP95Ms<=450&&report.minOutputRms>.00001&&data.states.every(s=>s.ignition);
 report.passed&&=report.audioTransport==='websocket'&&report.controlTransports.length===1&&report.controlTransports[0]==='websocket';
 report.passed&&=report.totalUnderruns===0&&report.totalDroppedSamples===0;
 report.passed&&=report.graphicsWarmup.state==='ready';
 report.audioAssets=Object.fromEntries(await Promise.all(['native-audio.js','native-stream.js','native-control.js','native-control-client.js','native-render-prewarm.js'].map(async file=>[file,createHash('sha256').update(await(await page.request.get(base+'/'+file)).body()).digest('hex')])));
 await page.screenshot({path:output.replace('.json','.png')});
}catch(e){report.error=e.stack;report.passed=false;process.exitCode=1;}
finally{
 await page.evaluate(()=>{clearInterval(window.__audioProbe?.timer);if(window.__playground?.state?.ignition)document.querySelector('#start')?.click();}).catch(()=>{});
 try{await page.waitForFunction(()=>window.__playground?.state?.ignition===false&&window.__playground?.state?.rpm<15,{},{timeout:5000});report.cleanupStop={confirmed:true,rpm:await page.evaluate(()=>window.__playground.state.rpm)};}catch{report.cleanupStop={confirmed:false};report.passed=false;}
 await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,data:undefined,inputs:report.inputs}));await browser.close();
}
