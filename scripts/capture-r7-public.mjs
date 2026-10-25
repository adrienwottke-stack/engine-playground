/** Two actual public native-telemetry views, with commands and audio blocked. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const origin='https://engine.127.0.0.1.sslip.io',folder='evidence/r7-live-20261025/public';
const report={passed:false,commandForwarded:false,audioRun:false,errors:[],captures:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const context=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',r=>!['GET','HEAD'].includes(r.request().method())||new URL(r.request().url()).pathname==='/api/core/audio'?r.abort():r.continue());
 await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();page.setDefaultTimeout(180000);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/?workshop=automation#mechanics',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__playground?.engine3d?.ready&&window.__playground?.state?.source==='ange-physical',undefined,{timeout:180000});
 report.health=await page.evaluate(async()=>await(await fetch('/api/health')).json());
 assert.equal(report.health.release,'r7-visual-audio03-20261025');
 for(const [device,viewport,presentation,camera] of [['mobile',{width:375,height:812},'cutaway','section'],['desktop',{width:1280,height:800},'closed','intake']]){
  await page.setViewportSize(viewport);await page.locator('button[data-presentation="'+presentation+'"]').click();await page.locator('#three-camera').selectOption(camera);
  await page.waitForFunction(({presentation,camera})=>window.__playground.engine3d.scene.presentation===presentation&&window.__playground.engine3d.scene.camera.preset===camera,{presentation,camera});
  await page.waitForTimeout(300);
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,source:window.__playground.state.source,rpm:window.__playground.state.rpm,ignition:window.__playground.state.ignition,audio:window.__playground.audio.state}));
  assert.equal(state.overflow,false);assert.equal(state.audio,'not-enabled');
  const screenshot=device+'-connected.png';await page.locator('.engine-three-panel').screenshot({path:folder+'/'+screenshot});report.captures.push({device,viewport,presentation,camera,screenshot,...state});
 }
 await page.goto(origin+'/zwischenstaende/klang/index.html',{waitUntil:'domcontentloaded'});
 await page.locator('audio').evaluateAll(items=>items.forEach(audio=>audio.load()));
 await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.readyState>=1||a.error),undefined,{timeout:30000});
 report.soundClips=await page.locator('audio').evaluateAll(items=>items.map(a=>({duration:a.duration,error:a.error?.message??null,readyState:a.readyState})));
 assert.equal(report.soundClips.length,2);for(const clip of report.soundClips)assert.equal(clip.error,null);
 // The retained server streams WAV without a finite HTML media duration.
 // Decode the actual fetched bytes to verify sample rate/length independently.
 report.decodedSoundClips=await page.evaluate(async()=>{const context=new AudioContext();try{return await Promise.all([...document.querySelectorAll('audio')].map(async a=>{const data=await(await fetch(a.src)).arrayBuffer(),buffer=await context.decodeAudioData(data);return{duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};}));}finally{await context.close();}});
 for(const clip of report.decodedSoundClips)assert.ok(Math.abs(clip.duration-11.5)<.01);
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();await writeFile(folder+'/connected-proof.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
