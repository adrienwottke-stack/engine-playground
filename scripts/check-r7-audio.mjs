import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.AUDIO_BASE || 'http://127.0.0.1:4193';
const seconds = Number(process.env.AUDIO_SECONDS || 35);
const output = process.env.AUDIO_OUTPUT || 'evidence/audio-fix-20261025/preview-before.json';
await mkdir(new URL('../evidence/audio-fix-20261025/', import.meta.url), { recursive: true });
const browser = await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
let ownedClient=null,ownedConfig=null;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/core/command'){try{const p=r.postDataJSON();ownedClient=p.clientId;ownedConfig=p.config;}catch{}}});
const sample=()=>page.evaluate(()=>{const p=window.__playground,s=p.state;return{wall:performance.now(),state:s?{t:s.t,rpm:s.rpm,ignition:s.ignition,simulationHz:s.simulationHz}:null,audio:p.audio,root:{...document.querySelector('#app').dataset},frame:p.engine3d.scene.frame};});
let report={base,errors};
try {
  await page.goto(base+'/?workshop=automation#mechanics',{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__playground?.engine3d?.ready,undefined,{timeout:180000});
  report.initialHealth=await page.evaluate(async()=>await(await fetch('/api/health')).json());
  if(report.initialHealth.release!=='r7-visual-audio03-20261025')throw Error('Unexpected public release');
  await page.waitForFunction(()=>window.__playground?.state,undefined,{timeout:30000});
  if(await page.evaluate(()=>window.__playground.state.ignition)){await page.locator('#start').click();await page.waitForFunction(()=>window.__playground.state&&!window.__playground.state.ignition,undefined,{timeout:10000});}
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__playground?.state?.rpm>650,{},{timeout:30000});
  await page.waitForTimeout(1500);
  const first=await sample(),rows=[];report.first=first;report.rows=rows;
  const started=performance.now();
  while(performance.now()-started<seconds*1000){
    const t=(performance.now()-started)/1000;
    const throttle=t<8?0:t<12?.25:t<16?.45:t<21?0:t<25?.2:0;
    await page.locator('#throttle').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},throttle*100);
    const s=await sample();
    rows.push({wallS:(s.wall-first.wall)/1000,t:s.state?.t,rpm:s.state?.rpm,simulationHz:s.state?.simulationHz,audio:s.audio,root:s.root,frame:s.frame});
    await page.waitForTimeout(500);
  }
  const last=await sample(),wallS=(last.wall-first.wall)/1000;report.last=last;if(!first.state||!last.state)throw Error("Native telemetry missing at measurement boundary");
  report={...report,wallS,simS:last.state.t-first.state.t,realtimeRatio:(last.state.t-first.state.t)/wallS,
    underruns:last.audio.underruns-first.audio.underruns,droppedSamples:last.audio.droppedSamples-first.audio.droppedSamples,
    receivedSamples:last.audio.receivedSamples-first.audio.receivedSamples,pcmRate:(last.audio.receivedSamples-first.audio.receivedSamples)/wallS,
    rms:last.audio.rms,volume:last.audio.volume,first,last,rows};
  report.minRunningRms=Math.min(...rows.filter(r=>r.rpm>650).map(r=>r.audio.rms));
  report.health=await page.evaluate(async()=>await(await fetch('/api/health')).json());
  if(process.env.AUDIO_CONTROLS==='1'){
    const changeVolume=async value=>page.locator('#volume').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await changeVolume(100);await page.waitForTimeout(400);
    const full=await sample();
    await page.locator('#mute').click();await page.waitForTimeout(400);
    const muted=await sample();
    await page.locator('#mute').click();await changeVolume(50);await page.waitForTimeout(400);
    const restored=await sample();
    await page.locator('#start').click();await page.waitForFunction(()=>window.__playground.state&&!window.__playground.state.ignition&&window.__playground.state.rpm<5,undefined,{timeout:15000});await page.waitForTimeout(1500);
    const stopped=await sample();
    report.controls={fullVolume:full.audio.volume,fullRms:full.audio.rms,muted:muted.audio.muted,mutedRms:muted.audio.rms,restoredVolume:restored.audio.volume,restoredRms:restored.audio.rms,stoppedRms:stopped.audio.rms,stoppedRpm:stopped.state?.rpm,stoppedIgnition:stopped.state?.ignition,volumeMax:await page.locator('#volume').getAttribute('max')};
  }
  report.passed=!errors.length&&report.underruns===0&&report.droppedSamples===0&&report.realtimeRatio>=.995&&report.pcmRate>43500&&report.pcmRate<44700&&report.minRunningRms>.001;
  if(report.controls)report.passed&&=report.controls.fullVolume===1&&report.controls.muted&&report.controls.mutedRms<.00001&&report.controls.restoredRms>.001&&report.controls.stoppedRms<.00001;
  await page.screenshot({path:output.replace('.json','.png')});
} catch(e) {report.error=e.stack;process.exitCode=1;}
finally {
  await page.evaluate(()=>{if(window.__playground?.state?.ignition)document.getElementById('start').click();}).catch(()=>{});
  if(ownedClient){try{const r=await fetch(base+'/api/core/command',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({clientId:ownedClient,claim:false,active:false,ignition:false,starter:false,reset:false,config:ownedConfig,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}}),signal:AbortSignal.timeout(5000)});report.cleanupStop=await r.json();}catch(e){report.cleanupError=String(e);}}
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,first:undefined,last:undefined,rows:undefined}));
  await browser.close();
  if(!report.passed)process.exitCode=1;
}
