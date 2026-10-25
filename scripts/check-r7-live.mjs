/** Real main/__playground smoke check. Does not start the engine, audio or tuning.
 * Required: R7_BASE_URL, R7_EVIDENCE. Optional: R7_PATH (also supports the main /).
 * Every API GET is stubbed locally; every non-GET/HEAD request is aborted.
 * No server, build, deployment or physical-core request is performed here.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const base=process.env.R7_BASE_URL,evidenceSetting=process.env.R7_EVIDENCE;
if(!base||!evidenceSetting)throw new Error('R7_BASE_URL und R7_EVIDENCE muessen gesetzt sein.');
const baseUrl=new URL(base);
if(!['http:','https:'].includes(baseUrl.protocol)||baseUrl.username||baseUrl.password)throw new Error('R7_BASE_URL muss eine HTTP(S)-Adresse ohne Zugangsdaten sein.');
const path=process.env.R7_PATH||'/automation-preview/index.html?workshop=automation&detail=r7-live#mechanics';
if(!path.startsWith('/')||path.startsWith('//'))throw new Error('R7_PATH muss ein Pfad auf dem angegebenen Server sein.');
const target=new URL(path,baseUrl).href,evidence=resolve(evidenceSetting),timeout=180_000;
const readonlyApi=process.env.R7_READONLY_API==='true';
const report={
  passed:false,url:target,startedAt:new Date().toISOString(),nativeRun:false,audioRun:false,
  scope:readonlyApi?'Real deployed main/__playground with read-only telemetry; writes and audio blocked.':'Real deployed main/__playground, disconnected static inspection only; API traffic is intercepted.',
  apiForwarded:readonlyApi,blockedMutations:[],apiStubs:[],blockedSockets:[],
  pageErrors:[],consoleErrors:[],networkFailures:[],httpFailures:[],captures:[],checks:[],
};
const intentionalAborts=new WeakSet(),blockedUrls=new Set();
let browser;
await mkdir(evidence,{recursive:true});
try{
  report.health=await fetch(new URL('/api/health',baseUrl)).then(r=>r.json());
  assert.equal(report.health.release,process.env.R7_EXPECTED_RELEASE||'r7-visual-audio03-20261025','Unexpected deployed release');
  browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(!['GET','HEAD'].includes(method)){
      report.blockedMutations.push({method,url:url.href});intentionalAborts.add(request);blockedUrls.add(url.href);return route.abort('blockedbyclient');
    }
    if(/^\/api(?:\/|$)/.test(url.pathname)){
      if(readonlyApi && !url.pathname.endsWith('/audio'))return route.continue();
      report.apiStubs.push({method,url:url.href});
      const disconnected={connected:false,state:null,reason:'Statische Sichtpruefung: API lokal getrennt.',tuningKey:null,tuningSequence:null};
      if(url.pathname.endsWith('/events'))return route.fulfill({status:200,contentType:'text/event-stream',headers:{'Cache-Control':'no-store'},body:method==='HEAD'?'':`retry: 60000\ndata: ${JSON.stringify(disconnected)}\n\n`});
      return route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:method==='HEAD'?'':JSON.stringify(disconnected)});
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{report.blockedSockets.push(socket.url());socket.close({code:1000,reason:'Static smoke: no motor/audio connection'});});
  const page=await context.newPage();page.setDefaultTimeout(timeout);
  page.on('pageerror',error=>report.pageErrors.push(error.stack||error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({text:message.text(),location:message.location()});});
  page.on('requestfailed',request=>report.networkFailures.push({method:request.method(),url:request.url(),failure:request.failure()?.errorText,intentionalBlock:intentionalAborts.has(request)}));
  page.on('response',response=>{if(response.status()>=400)report.httpFailures.push({url:response.url(),status:response.status()});});
  await page.goto(target,{waitUntil:'domcontentloaded',timeout});
  await page.waitForFunction(()=>{const p=window.__playground;return p?.engine3d?.ready||p?.engine3d?.failed;},undefined,{timeout});
  assert.equal(await page.evaluate(()=>window.__playground.engine3d.failed),false,'Real EngineView initialization failed');

  async function sample(){
    return page.evaluate(()=>{
      const p=window.__playground,host=document.querySelector('.engine-three-host'),panel=document.querySelector('.engine-three-panel');
      return {mode:p.mode,state:p.state===null?null:{rpm:p.state?.rpm,ignition:p.state?.ignition},engine3d:p.engine3d,
        engine:p.config.engine,tuning:p.tuning,audio:p.audio,body:{...document.body.dataset},host:{...host.dataset},
        ui:{presentation:panel.dataset.presentation,camera:document.querySelector('#three-camera').value,
          pressed:[...document.querySelectorAll('[data-presentation][aria-pressed="true"]')].map(button=>button.dataset.presentation),
          overflow:document.documentElement.scrollWidth>innerWidth,canvas:{width:host.querySelector('canvas')?.width,height:host.querySelector('canvas')?.height}},
        viewport:{width:innerWidth,height:innerHeight}};
    });
  }
  async function capture(device,presentation,camera){
    const frame=await page.evaluate(()=>window.__playground.engine3d.scene.frame);
    await page.waitForFunction(({presentation,camera,frame})=>{
      const d=window.__playground.engine3d,host=document.querySelector('.engine-three-host');
      return d.ready&&!d.failed&&host.dataset.webgl==='ready'&&host.dataset.geometry==='84:89.6:135'&&d.scene.presentation===presentation&&d.scene.camera.preset===camera&&d.scene.frame>=frame+3;
    },{presentation,camera,frame},{timeout});
    const snapshot=await sample(),scene=snapshot.engine3d.scene;
    assert.equal(snapshot.tuning.renderer,'automation','The real application did not install the automation renderer');
    assert.equal(snapshot.body.workshop,'automation');assert.equal(snapshot.host.geometry,'84:89.6:135');
    assert.equal(snapshot.engine.boreMm,84);assert.equal(snapshot.engine.strokeMm,89.6);assert.equal(snapshot.engine.rodMm,135);
    assert.equal(snapshot.engine3d.component,'engine');assert.equal(scene.component,'engine');
    assert.equal(scene.assembly.accessoryDrive.wheels.length,9);assert.equal(scene.assembly.accessoryDrive.belts.length,2);
    assert.ok(scene.assembly.revision>0);assert.equal(snapshot.host.assemblyRevision,String(scene.assembly.revision));
    assert.equal(snapshot.host.radiatorInspection,camera==='front'?'transparent':'solid');
    assert.equal(scene.visibility.mechanical,presentation==='cutaway');assert.equal(scene.visibility.closedHousing,presentation==='closed');
    assert.equal(scene.visibility.housing,true);assert.equal(scene.visibility.extras,true);assert.equal(scene.visibility.studio,false);
    assert.equal(snapshot.ui.presentation,presentation);assert.deepEqual(snapshot.ui.pressed,[presentation]);assert.equal(snapshot.ui.camera,camera);
    assert.equal(snapshot.ui.overflow,false,'Horizontal page overflow');
    if(readonlyApi){assert.ok(snapshot.state,'Public app did not receive real native telemetry');}
    else assert.equal(snapshot.state,null,'Static smoke unexpectedly received/runs motor telemetry');
    assert.equal(snapshot.audio.state,'not-enabled','Static smoke unexpectedly enabled audio');
    assert.ok(snapshot.ui.canvas.width>0&&snapshot.ui.canvas.height>0);
    const filename=`${device}-${presentation}-${camera}.png`;
    // The real application panel includes its original toolbar and canvas. This
    // avoids a very tall mobile full-page capture without replacing the UI.
    await page.locator('.engine-three-panel').screenshot({path:resolve(evidence,filename),timeout});
    report.captures.push({device,presentation,camera,screenshot:filename,screenshotScope:'Real engine-three-panel',...snapshot});
  }
  for(const [device,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:375,height:812}]]){
    await page.setViewportSize(viewport);
    for(const camera of ['front','intake']){
      await page.locator('#three-camera').selectOption(camera);
      for(const presentation of ['closed','cutaway']){
        await page.locator(`[data-presentation="${presentation}"]`).click();
        await capture(device,presentation,camera);
      }
    }
    report.checks.push(`${device}: real app ready; automation; M54 geometry; nine wheels/two belts; front/intake inspection; closed/cutaway; no horizontal overflow; engine/audio inactive`);
  }
  report.unexpectedNetworkFailures=report.networkFailures.filter(item=>!item.intentionalBlock);
  report.unexpectedConsoleErrors=report.consoleErrors.filter(item=>!(blockedUrls.has(item.location.url)&&/net::ERR_|Failed to load resource/i.test(item.text)));
  assert.deepEqual(report.pageErrors,[],'Browser page errors');
  assert.deepEqual(report.unexpectedConsoleErrors,[],'Unexpected browser console errors');
  assert.deepEqual(report.unexpectedNetworkFailures,[],'Unexpected network failures');
  assert.deepEqual(report.httpFailures,[],'HTTP errors loading application/assets');
  assert.equal(report.captures.length,8);report.passed=true;
}catch(error){report.failure=error?.stack||String(error);process.exitCode=1;}
finally{
  // No stop/start/control action even during cleanup. Guards remain active until
  // closing the browser, so pagehide commands cannot reach the real server.
  try{await browser?.close();}catch(error){report.cleanupFailure=String(error);report.passed=false;process.exitCode=1;}
  report.finishedAt=new Date().toISOString();
  await writeFile(resolve(evidence,'browser-audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,url:target,captures:report.captures.length,apiForwarded:readonlyApi,apiStubs:report.apiStubs.length,
    blockedMutations:report.blockedMutations.length,blockedSockets:report.blockedSockets.length,pageErrors:report.pageErrors,
    consoleErrors:report.consoleErrors,networkFailures:report.networkFailures,httpFailures:report.httpFailures,failure:report.failure,evidence}));
}
