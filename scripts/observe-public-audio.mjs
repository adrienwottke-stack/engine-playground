// Passive observer: no engine commands, claims, start or stop requests.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const base='https://engine.127.0.0.1.sslip.io';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await page.goto(base+'/api/health');
await page.evaluate(async()=>{
 const context=new AudioContext();await context.audioWorklet.addModule('/native-audio.js?v=0.4.8');
 const node=new AudioWorkletNode(context,'native-engine-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{hostedRealtime:true}});
 const stream=new Worker('/native-stream.js?v=0.3.1'),channel=new MessageChannel();
 window.observer={context,node,stream,stats:null,timing:null};
 node.port.onmessage=({data})=>{if(data.type==='stats')window.observer.stats={...data,at:performance.now()};};
 stream.onmessage=({data})=>{if(data.type==='timing')window.observer.timing=data;};
 node.port.postMessage({type:'volume',value:.5,muted:false});node.connect(context.destination);
 node.port.postMessage({type:'connect',port:channel.port1},[channel.port1]);stream.postMessage({type:'connect',port:channel.port2},[channel.port2]);
 await context.resume();
});
const rows=[],start=performance.now();
try{
 while(performance.now()-start<65000){
  rows.push(await page.evaluate(async()=>{const s=await(await fetch('/api/core/state')).json();return {at:performance.now(),audio:window.observer.stats,timing:window.observer.timing,connected:s.connected,state:s.state&&{rpm:s.state.rpm,t:s.state.t,simulationHz:s.state.simulationHz,processingMs:s.state.processingMs,hostIdle:s.state.hostIdle,sequence:s.state.sequence}};}));
  await page.waitForTimeout(500);
 }
 const valid=rows.filter(r=>r.audio),first=valid[0],last=valid.at(-1);
 const report={passive:true,wallS:(last.at-first.at)/1000,underruns:last.audio.underruns-first.audio.underruns,droppedSamples:last.audio.droppedSamples-first.audio.droppedSamples,runningSamples:valid.filter(r=>r.state?.rpm>650).length,maxPacketGapMs:Math.max(...valid.map(r=>r.timing?.maxPacketGapMs??0)),first,last,rows};
 await writeFile(process.env.AUDIO_OUTPUT||'evidence/audio-fix-20261025/public-passive.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,first:undefined,last:undefined,rows:undefined}));
}finally{await page.evaluate(async()=>{window.observer.stream.terminate();await window.observer.context.close();});await browser.close();}
