import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// Keep continuous WebGL captures separate from native motor interactions.
test.use({trace:'off',launchOptions:{args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']}});
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((value,i)=>value-b[i]));
const snapshot=(page:Page):Promise<any>=>page.evaluate(()=>{
  const d=(window as any).__playground,s=d.state,scene=d.engine3d.scene;
  return {
    state:s?{rpm:s.rpm,ignition:s.ignition,t:s.t,fuelRateGS:s.fuelRateGS,rodMm:s.geometry?.rodMm}:null,
    scene:scene?{frame:scene.frame,component:scene.component,asset:scene.asset,inspection:scene.inspection,camera:scene.camera,resources:scene.resources,visibility:scene.visibility,
      parts:scene.parts.map((p:any)=>({piston:p.piston,wristPin:p.wristPin,crown:p.crown,rodEnds:p.rodEnds,crankPin:p.crankPin,opaque:p.opaque}))}:null,
  };
});
function observeErrors(page:Page){
  const errors:string[]=[],failures:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>{if(!request.failure()?.errorText.includes('ERR_ABORTED'))failures.push(request.url());});
  return {errors,failures};
}
async function ready(page:Page){
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:60000});
  await expect.poll(async()=>(await snapshot(page)).scene?.frame??0,{timeout:15000}).toBeGreaterThan(3);
}
function piecesByName(scene:any){return new Map<string,number[]>(scene.inspection.pieces.map((piece:any)=>[piece.name,piece.position]));}
function checkNativeMounts(data:Awaited<ReturnType<typeof snapshot>>){
  expect(data.scene.parts).toHaveLength(6);
  for(const part of data.scene.parts){
    expect(distance(part.piston,part.wristPin)).toBeLessThan(1e-5);
    expect(distance(part.wristPin,part.rodEnds[0])).toBeLessThan(1e-5);
    expect(distance(part.crankPin,part.rodEnds[1])).toBeLessThan(1e-5);
    expect(distance(part.rodEnds[0],part.rodEnds[1])).toBeCloseTo(data.state!.rodMm,5);
    expect(part.crown[1]-part.wristPin[1],'actual asset compression height in world millimetres').toBeCloseTo(31.82,4);
    expect(part.crown[0]).toBeCloseTo(part.wristPin[0],5);expect(part.crown[2]).toBeCloseTo(part.wristPin[2],5);
    expect(part.opaque).toBe(true);
  }
}

test('piston studio: nine real pieces, all views, explosion, independent engine state and cleanup',async({page},testInfo)=>{
  test.setTimeout(180000);const observed=observeErrors(page);
  await page.goto('/#mechanics');await ready(page);
  await expect(page.locator('#three-component')).toHaveValue('engine');
  await page.locator('#three-extras').uncheck();await page.locator('#three-housing').check();
  await page.getByLabel('Wasser: Rohrdarstellung',{exact:true}).selectOption('off');
  await page.locator('#three-camera').selectOption('exhaust');
  await page.locator('#three-component').selectOption('piston');
  await expect.poll(async()=>(await snapshot(page)).scene?.component).toBe('piston');
  for(const selector of ['.three-presets','.three-media','.three-options','#three-camera'])await expect(page.locator(selector)).toBeHidden();
  await expect(page.locator('#three-part-view')).toBeVisible();await expect(page.locator('#three-part-source')).toBeVisible();
  const assembled=await snapshot(page),base=piecesByName(assembled.scene);
  expect(base.size).toBe(9);expect(assembled.scene.asset.id).toBeTruthy();
  expect(assembled.scene.asset.heroTriangles).toBeGreaterThan(assembled.scene.asset.engineTriangles);
  expect(assembled.scene.asset.engineTriangles).toBeGreaterThan(0);
  // Inspect real hierarchy visibility; photographs separately check legibility.
  expect(assembled.scene.visibility).toBeDefined();expect(assembled.scene.visibility.studio).toBe(true);
  for(const name of ['mechanical','extras','housing','engineFloor'])expect(assembled.scene.visibility[name]).toBe(false);
  expect(assembled.scene.visibility.flowGroups.length).toBeGreaterThan(0);
  expect(assembled.scene.visibility.flowGroups.every((visible:boolean)=>!visible)).toBe(true);
  const presets:Record<string,number[]>={};
  for(const name of ['overview','crown','underside','pin','side']){
    await page.locator('#three-part-view').selectOption(name);
    await expect.poll(async()=>(await snapshot(page)).scene?.camera.preset).toBe(name);
    presets[name]=(await snapshot(page)).scene.camera.position;
  }
  expect(new Set(Object.values(presets).map(position=>position.map(v=>v.toFixed(2)).join(','))).size).toBe(5);
  const range=page.locator('#three-exploded');await range.focus();await range.press('End');
  await expect(page.locator('#three-exploded-value')).toHaveText('100 %');
  await expect.poll(async()=>(await snapshot(page)).scene?.inspection.exploded).toBe(1);
  const exploded=await snapshot(page),apart=piecesByName(exploded.scene);
  const moved=[...base.keys()].filter(name=>distance(base.get(name)!,apart.get(name)!)>1e-5);
  expect(moved).toContain('wrist_pin');expect(moved).toContain('compression_ring_top');
  expect(moved).toHaveLength(8);
  const stationary=[...base.keys()].filter(name=>!moved.includes(name));expect(stationary).toHaveLength(1);
  await page.waitForTimeout(400);expect(piecesByName((await snapshot(page)).scene)).toEqual(apart);
  await range.focus();await range.press('Home');
  await expect.poll(async()=>(await snapshot(page)).scene?.inspection.exploded).toBe(0);
  expect(piecesByName((await snapshot(page)).scene)).toEqual(base);
  await test.step('Desktop: Studio to 2D and back to Studio',async()=>{
    console.info(`[piston-studio desktop ${new Date().toISOString()}] before 2D click`);
    await page.locator('#engine-view-2d').click();await expect(page.locator('#engine-canvas')).toBeVisible();
    console.info(`[piston-studio desktop ${new Date().toISOString()}] 2D visible; before 3D click`);
    await page.locator('#engine-view-3d').click();await expect(page.locator('#three-component')).toHaveValue('piston');
    await expect(page.locator('#three-part-view')).toHaveValue('side');
    console.info(`[piston-studio desktop ${new Date().toISOString()}] 3D restored; before engine component selection`);
  });
  await test.step('Desktop: restore engine component',async()=>{
    await page.locator('#three-component').selectOption('engine');
    console.info(`[piston-studio desktop ${new Date().toISOString()}] engine component selected`);
  });
  await expect(page.locator('#three-extras')).not.toBeChecked();await expect(page.locator('#three-housing')).toBeChecked();
  await expect(page.getByLabel('Wasser: Rohrdarstellung',{exact:true})).toHaveValue('off');
  await expect(page.locator('#three-camera')).toHaveValue('exhaust');
  checkNativeMounts(await snapshot(page));
  await page.locator('#three-component').selectOption('piston');
  const beforeDispose=await snapshot(page);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
  const disposed=JSON.parse((await page.locator('.engine-three-host').getAttribute('data-disposed'))!);
  expect(disposed.geometries).toBeGreaterThan(9);expect(disposed.materials).toBeGreaterThan(0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false})));
  await ready(page);await expect(page.locator('#engine-3d-canvas')).toHaveCount(1);
  // Match the pre-disposal upload history: both engine and studio were rendered.
  const recreatedFrame=(await snapshot(page)).scene.frame;
  await page.locator('#three-component').selectOption('engine');
  await expect.poll(async()=>(await snapshot(page)).scene?.frame??0).toBeGreaterThan(recreatedFrame+2);
  const engineFrame=(await snapshot(page)).scene.frame;
  await page.locator('#three-component').selectOption('piston');
  await expect.poll(async()=>(await snapshot(page)).scene?.frame??0).toBeGreaterThan(engineFrame+2);
  const rebuilt=await snapshot(page);expect(rebuilt.scene.inspection.pieces).toHaveLength(9);
  expect(rebuilt.scene.asset).toEqual(beforeDispose.scene.asset);
  // First visit initially displayed all extras. Recreated hidden extras may
  // stay unuploaded; a lower GPU count is allowed, an increase is not.
  expect(rebuilt.scene.resources.geometries,'recreation does not multiply shared asset geometries').toBeLessThanOrEqual(beforeDispose.scene.resources.geometries+2);
  await writeFile(testInfo.outputPath('piston-studio-desktop.json'),JSON.stringify({...observed,presets,moved,stationary,asset:assembled.scene.asset,disposed,resourcesBefore:beforeDispose.scene.resources,resourcesAfter:rebuilt.scene.resources},null,2));
  expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
});

test('cold studio choice during GLB loading preserves self-sustaining native operation',async({page},testInfo)=>{
  test.setTimeout(120000);const observed=observeErrors(page);
  await page.addInitScript(()=>{
    const NativeEventSource=window.EventSource;(window as any).__pistonSseErrors=[];
    window.EventSource=class extends NativeEventSource{
      constructor(url:string|URL,options?:EventSourceInit){super(url,options);this.addEventListener('error',()=>{(window as any).__pistonSseErrors.push({url:this.url,at:Date.now()});});}
    };
    const longTasks:{duration:number;startTime:number}[]=[];(window as any).__pistonLongTasks=longTasks;
    if(PerformanceObserver.supportedEntryTypes.includes('longtask')){
      const observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries())longTasks.push({duration:entry.duration,startTime:entry.startTime});
        if(longTasks.length>50)longTasks.splice(0,longTasks.length-50);
      });
      observer.observe({type:'longtask',buffered:true});(window as any).__pistonLongTaskObserver=observer;
    }
  });
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/models/m52-piston-reference.glb',async route=>{await gate;await route.continue();});
  await page.goto('/?view=2d#mechanics');await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click();await expect.poll(async()=>(await snapshot(page)).state?.rpm??Infinity).toBeLessThan(5);
  await page.locator('#start').click();
  try{
    await page.waitForTimeout(4800);await expect.poll(async()=>(await snapshot(page)).state?.rpm,{timeout:15000}).toBeGreaterThan(700);
    await expect.poll(async()=>(await snapshot(page)).state?.fuelRateGS).toBeGreaterThan(0);
    const requested=page.waitForRequest('**/models/m52-piston-reference.glb');
    await page.locator('#engine-view-3d').click();await requested;
    await page.locator('#three-component').selectOption('piston');await page.locator('#three-part-view').selectOption('pin');release();
    await ready(page);await expect(page.locator('#three-component')).toHaveValue('piston');
    const samples=[];
    for(let i=0;i<3;i++){
      const sample=await snapshot(page);samples.push(sample);
      const diagnostic=await page.evaluate(()=>({
        observedAt:new Date().toISOString(),performanceNow:performance.now(),
        sseErrors:(window as any).__pistonSseErrors,longTasks:(window as any).__pistonLongTasks,
        host:{...document.querySelector<HTMLElement>('.engine-three-host')!.dataset},
      }));
      await writeFile(testInfo.outputPath(`piston-studio-cold-sample-${i}.json`),JSON.stringify({...observed,...diagnostic,sampleIndex:i,sample},null,2));
      expect(sample.state?.ignition).toBe(true);expect(sample.state?.rpm).toBeGreaterThan(700);
      expect(sample.scene.component).toBe('piston');expect(sample.scene.camera.preset).toBe('pin');checkNativeMounts(sample);
      await page.waitForTimeout(200);
    }
    expect(samples.at(-1)!.state!.t).toBeGreaterThan(samples[0].state!.t);
    const sseErrors=await page.evaluate(()=>(window as any).__pistonSseErrors);
    await expect(page.locator('#connection')).toHaveText('Physischer Kern');
    await writeFile(testInfo.outputPath('piston-studio-cold-native.json'),JSON.stringify({...observed,sseErrors,samples},null,2));
    expect(sseErrors).toEqual([]);expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
  }finally{release();await page.locator('#stop').click();}
});

test('375px piston studio supports real touch orbit/pinch with contained 44px controls',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true,baseURL:testInfo.project.use.baseURL as string});
  const page=await context.newPage(),observed=observeErrors(page);
  try{
    await page.goto('/#mechanics');await ready(page);await page.locator('#three-component').selectOption('piston');
    for(const selector of ['#three-component','#three-part-view','#three-exploded','#three-camera-reset']){
      await expect(page.locator(selector)).toBeVisible();expect((await page.locator(selector).boundingBox())!.height,`${selector} touch target`).toBeGreaterThanOrEqual(44);
    }
    for(const name of ['overview','crown','underside','pin','side']){
      await page.locator('#three-part-view').selectOption(name);await expect.poll(async()=>(await snapshot(page)).scene?.camera.preset).toBe(name);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.locator('#three-camera-reset').click();
    const canvas=page.locator('#engine-3d-canvas');await canvas.scrollIntoViewIfNeeded();
    const box=(await canvas.boundingBox())!,x=box.x+box.width*.5,y=box.y+box.height*.55;
    const cdp=await context.newCDPSession(page),before=(await snapshot(page)).scene.camera.position;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+40,y,id:1}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40-i*12,y:y-i*2,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>distance((await snapshot(page)).scene.camera.position,before)).toBeGreaterThan(1);
    const camera=(await snapshot(page)).scene.camera,radius=distance(camera.position,camera.target);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-30-i*6,y,id:1},{x:x+30+i*6,y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>{const c=(await snapshot(page)).scene.camera;return Math.abs(distance(c.position,c.target)-radius);}).toBeGreaterThan(1);
    await cdp.detach();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await writeFile(testInfo.outputPath('piston-studio-mobile.json'),JSON.stringify({...observed,camera:(await snapshot(page)).scene.camera},null,2));
    expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
  }finally{await context.close();}
});

test('missing local piston GLB leaves a usable 2D section and clear fallback',async({page},testInfo)=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/models/m52-piston-reference.glb',route=>route.abort('failed'));
  await page.goto('/#mechanics');
  await expect(page.locator('.three-fallback')).toBeVisible({timeout:60000});
  await expect(page.locator('.three-fallback')).toContainText('2D-Schnitt');
  await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('#engine-view-3d')).toBeDisabled();
  await expect(page.locator('#engine-view-2d')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'Kühlung',exact:true}).click();await page.getByRole('button',{name:'Mechanik',exact:true}).click();
  await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('.three-fallback')).toBeVisible();
  await writeFile(testInfo.outputPath('piston-studio-missing-asset.json'),JSON.stringify({errors,scope:'Reference GLB request intentionally aborted; network/loader console errors are expected, unhandled page errors are not.'},null,2));
  expect(errors).toEqual([]);
});
