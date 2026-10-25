import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {DEFAULT_TUNING,completeTuningSupport,tuningKey} from '../../native/tuning-settings.mjs';
test.use({trace:'off',launchOptions:{args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']}});
test('expanded parts are previewed, confirmed natively, retained on reload and restored',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1280,height:800});
 const errors:string[]=[],failed:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failed.push(r.url());});
 const read=()=>page.evaluate(()=>{const d=(window as any).__playground;return {tuning:d.tuning,selection:d.config.tuning,state:d.state?{rpm:d.state.rpm,ignition:d.state.ignition,maxLift:d.state.valveCurves?Math.max(...d.state.valveCurves.samples.flatMap((rows:number[][])=>rows.map(p=>p[0]))):null}:null};});
 await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:20000});
 if(await page.locator('[data-reset]').isEnabled()){await page.locator('[data-reset]').click();await expect(page.locator('[data-installed]')).toHaveText('Serie eingebaut',{timeout:25000});}
 const race=page.locator('[data-part="camshaft"][data-value="race"]');await race.hover();
 await expect(page.locator('[data-effect-name]')).toHaveText('Racing-Nocken');expect((await read()).selection).toEqual(DEFAULT_TUNING);
 await race.click();await expect(page.locator('[data-apply]')).toBeDisabled();await page.locator('[data-support]').click();
 await expect(page.locator('[data-selection-count]')).toContainText('7.600');
 await page.locator('[data-apply]').click();await expect(page.locator('[data-installed]')).toContainText('5 Teile',{timeout:25000});
 const racing=completeTuningSupport({camshaft:'race'});
 await expect.poll(async()=>(await read()).tuning.confirmedKey).toBe(tuningKey(racing));
 await expect.poll(async()=>(await read()).state?.maxLift).toBeCloseTo(11.5,1);expect((await read()).state?.ignition).toBe(false);
 await page.reload();await expect(page.locator('[data-installed]')).toContainText('5 Teile',{timeout:20000});expect((await read()).selection).toEqual(racing);
 await expect(page.locator('[data-part="camshaft"][data-value="race"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#reset').click();await expect.poll(async()=>(await read()).state?.maxLift).toBeCloseTo(11.5,1);
 await mkdir('evidence/tuning-sauger',{recursive:true});await page.locator('#garage-tuning-slot').screenshot({path:'evidence/tuning-sauger/integrated-desktop.png'});
 await page.setViewportSize({width:375,height:812});await page.locator('[data-group="1"]').click();await page.locator('[data-part="throttleBody"][data-value="itb"]').click();
 await expect(page.locator('[data-effect-name]')).toHaveText('Einzeldrosseln');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.tuning-effect').scrollIntoViewIfNeeded();await page.screenshot({path:'evidence/tuning-sauger/integrated-mobile.png'});
 await page.locator('[data-apply]').click();await expect(page.locator('[data-installed]')).toContainText('6 Teile',{timeout:25000});
 await page.locator('[data-reset]').click();await expect(page.locator('[data-installed]')).toHaveText('Serie eingebaut',{timeout:25000});
 await expect.poll(async()=>(await read()).state?.maxLift).toBe(9.7);
 expect(errors).toEqual([]);expect(failed).toEqual([]);
 await writeFile('evidence/tuning-sauger/integration.json',JSON.stringify({passed:true,errors,failed,racingKey:tuningKey(racing),racingNativeLiftMm:11.5,checks:['hover only previews','support required','native install confirmed','reload and motor reset preserve build','ITB installation confirmed','375px no overflow','series restored']},null,2));
});

test('the shared motor button can still request stop during an injected telemetry gap',async({page})=>{
 test.setTimeout(60000);let telemetryLost=false;
 await page.route('**/api/core/events',route=>route.abort());
 await page.route('**/api/core/state',async route=>{if(telemetryLost)await route.fulfill({json:{connected:false,state:null,reason:'Gezielte Telemetrielücke in der Browserprüfung.'}});else await route.continue();});
 await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:15000});
 if(await page.locator('#start').innerText()==='Motor stoppen'){await page.locator('#start').click();await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition)).toBe(false);}
 await page.locator('#start').click();await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition)).toBe(true);telemetryLost=true;
 try{await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state===null),{timeout:10000}).toBe(true);await expect(page.locator('#start')).toHaveText('Motor stoppen');await expect(page.locator('#start')).toBeEnabled();await page.locator('#start').click();await expect(page.locator('#start')).toHaveText('Motor starten');}
 finally{telemetryLost=false;}
 await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition),{timeout:12000}).toBe(false);
});

test('racing camshaft build starts with zero pedal and holds its own rough idle after automatic starter release',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:960,height:640});
 const commands:unknown[]=[];page.on('request',request=>{if(request.url().endsWith('/api/core/command')){const d=request.postDataJSON();commands.push({wall:Date.now(),ignition:d.ignition,starter:d.starter,throttle:d.controls.throttle,claim:d.claim});}});
 await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:20000});
 await page.getByRole('button',{name:'Geschlossen',exact:true}).click();
 // The shared renderer uploads and warms its meshes asynchronously; measure
 // the engine after initialization, rather than mixing GPU startup with idle.
 await expect.poll(()=>page.evaluate(()=>(window as any).__playground.engine3d.ready),{timeout:60000}).toBe(true);
 if(await page.locator('#start').innerText()==='Motor stoppen')await page.locator('#start').click();
 if(await page.locator('[data-reset]').isEnabled()){await page.locator('[data-reset]').click();await expect(page.locator('[data-installed]')).toHaveText('Serie eingebaut',{timeout:25000});}
 await page.locator('[data-part="camshaft"][data-value="race"]').click();await page.locator('[data-support]').click();await page.locator('[data-apply]').click();
 await expect(page.locator('[data-installed]')).toContainText('5 Teile',{timeout:25000});await expect(page.locator('#throttle')).toHaveValue('0');
 const startedAt=Date.now();await page.locator('#start').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition),{timeout:12000}).toBe(true);
 // Wait through the existing four-second automatic starter, then verify combustion sustains idle.
 await expect.poll(async()=>Date.now()-startedAt>7000&&await page.evaluate(()=>(window as any).__playground.state?.starter===false),{timeout:16000}).toBe(true);
 // Read native telemetry outside the renderer so software WebGL cannot starve the sampler.
 const rows:{rpm:number;throttle:number;starter:boolean;ignition:boolean;t:number}[]=[],gaps:unknown[]=[],sampleStarted=Date.now();
 while(Date.now()-sampleStarted<4500){const d=await (await page.request.get('/api/core/state')).json();if(d.connected)rows.push({rpm:d.state.rpm,throttle:d.state.actualThrottle,starter:d.state.starter,ignition:d.state.ignition,t:d.state.t});else gaps.push({wall:Date.now(),reason:d.reason});await new Promise(r=>setTimeout(r,50));}
 const mean=rows.reduce((s,r)=>s+r.rpm,0)/rows.length;
 await mkdir('evidence/camshaft-character',{recursive:true});await writeFile('evidence/camshaft-character/browser-zero-pedal-start.json',JSON.stringify({passed:false,meanRpm:mean,rows,gaps,commands},null,2));
 expect(rows.length).toBeGreaterThan(30);expect(mean).toBeGreaterThan(450);expect(mean).toBeLessThan(1600);
 expect(rows.every(r=>!r.starter&&r.throttle===0&&r.ignition)).toBe(true);
 expect(Math.max(...rows.map(r=>r.rpm))-Math.min(...rows.map(r=>r.rpm))).toBeGreaterThan(65);
 await page.locator('#start').click();await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition)).toBe(false);
 await writeFile('evidence/camshaft-character/browser-zero-pedal-start.json',JSON.stringify({passed:true,meanRpm:mean,rows,gaps,commands},null,2));
});
