import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

// Continuous WebGL screenshot tracing changes input timing substantially under
// software rendering. Interactions are verified here; images are captured apart.
test.use({trace:'off',launchOptions:{args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']}});
const debug=(page:Page)=>page.evaluate(()=>{
  const d=(window as any).__playground,s=d.state;
  return {state:s?{rpm:s.rpm,fuelRateGS:s.fuelRateGS,ignition:s.ignition,source:s.source,starter:s.starter,t:s.t,gear:s.gear}:null};
});
function observeErrors(page:Page){
  const errors:string[]=[],failures:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>{if(!request.failure()?.errorText.includes('ERR_ABORTED'))failures.push(request.url());});
  return {errors,failures};
}
async function startAndVerifyRunning(page:Page){
  await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await page.locator('#reset').click();
  await expect.poll(async()=>(await debug(page)).state?.rpm??Infinity).toBeLessThan(5);
  // Schedule the focus/change through the actual UI handlers in the browser task
  // immediately after native starter acknowledgement. Driver/renderer latency
  // between separate Playwright calls must not consume the four-second window.
  await page.evaluate(()=>{
    const audit:any={clickedAt:null,selectedAt:null,checkedAt:null,starterAtSelect:null,starterAtCheck:null,nativeTimeAtSelect:null,nativeTimeAtCheck:null,finished:false};
    (window as any).__engine3dStarterAudit=audit;
    document.querySelector('#start')!.addEventListener('click',()=>{
      audit.clickedAt=performance.now();
      const watch=window.setInterval(()=>{
        const now=performance.now(),state=(window as any).__playground.state;
        if(audit.selectedAt===null&&state?.starter){
          const select=document.querySelector<HTMLSelectElement>('#three-camera')!;
          audit.selectedAt=now;audit.starterAtSelect=state.starter;audit.nativeTimeAtSelect=state.t;
          select.focus();select.value='intake';select.dispatchEvent(new Event('change',{bubbles:true}));
        }else if(audit.selectedAt!==null&&now-audit.selectedAt>=300&&state?.t>audit.nativeTimeAtSelect){
          audit.checkedAt=now;audit.starterAtCheck=state.starter;audit.nativeTimeAtCheck=state.t;audit.finished=true;clearInterval(watch);
        }
        if(now-audit.clickedAt>3500){audit.finished=true;audit.timingExpired=true;clearInterval(watch);}
      },25);
    },{once:true,capture:true});
  });
  await page.locator('#start').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__engine3dStarterAudit.finished),{timeout:7000}).toBe(true);
  const timing=await page.evaluate(()=>(window as any).__engine3dStarterAudit);
  expect(timing.timingExpired,`starter regression must finish inside its real click-time window: ${JSON.stringify(timing)}`).not.toBe(true);
  expect(timing.selectedAt-timing.clickedAt).toBeLessThan(3000);expect(timing.checkedAt-timing.clickedAt).toBeLessThan(3500);
  expect(timing.starterAtSelect).toBe(true);expect(timing.nativeTimeAtCheck).toBeGreaterThan(timing.nativeTimeAtSelect);
  expect(timing.starterAtCheck,`select focus preserves starter in a later native state while its timer is active: ${JSON.stringify(timing)}`).toBe(true);
  // Independently prove self-sustaining combustion beyond the timed starter.
  await page.waitForTimeout(Math.max(0,4800-(timing.checkedAt-timing.clickedAt)));
  await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:15000}).toBeGreaterThan(700);
  await expect.poll(async()=>(await debug(page)).state?.fuelRateGS,{timeout:10000}).toBeGreaterThan(0);
  const state=(await debug(page)).state;
  expect(state?.ignition).toBe(true);expect(state?.source).toBe('ange-physical');
  await page.waitForTimeout(700);
  expect((await debug(page)).state?.rpm,'RPM remains self-sustaining after the timed starter').toBeGreaterThan(700);
  return timing;
}
async function observeSlowCycle(page:Page){
  await page.locator('#slow').check();
  return page.evaluate(async()=>{
    const cycle=4*Math.PI,samples:{angle:number;elapsedMs:number;rpm:number;nativeTime:number;mesh:any;rodMm:number}[]=[];
    const started=performance.now();let previous=(window as any).__playground.visualAngle,travel=0;
    // The visual clock caps each step on slow software GPUs. Collect the full
    // cycle rather than assuming the former simple mesh's frame throughput.
    while(travel<cycle&&performance.now()-started<20000){
      const frameAt=await new Promise<number>(resolve=>requestAnimationFrame(resolve));
      const d=(window as any).__playground,angle=d.visualAngle;
      const step=(angle-previous+cycle)%cycle;
      if(step>0){
        travel+=step;const scene=d.engine3d.scene;
        const mesh={frame:scene.frame,angle:scene.angle,occlusion:scene.occlusion,parts:scene.parts.map((part:any)=>({piston:part.piston,wristPin:part.wristPin,rodEnds:part.rodEnds,crankPin:part.crankPin,opaque:part.opaque}))};
        samples.push({angle,elapsedMs:frameAt-started,rpm:d.state?.rpm,nativeTime:d.state?.t,mesh,rodMm:d.state.geometry.rodMm});
      }
      previous=angle;
    }
    return {travel,samples,elapsedMs:performance.now()-started};
  });
}

test('native 3D: complete slow cycle, independent visibility, input and 2D continuity',async({page},testInfo)=>{
  test.setTimeout(180000);await page.setViewportSize({width:1500,height:1100});
  const observed=observeErrors(page);
  await page.goto('/#mechanics');
  const host=page.locator('.engine-three-host'),canvas=page.locator('#engine-3d-canvas');
  await expect(host).toHaveAttribute('data-webgl','ready',{timeout:30000});await expect(canvas).toBeVisible();
  const commands:any[]=[];
  page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/core/command'){
    const request=response.request().postDataJSON();
    commands.push({at:Date.now(),ignition:request.ignition,starter:request.starter,reset:request.reset,claim:request.claim,status:response.status(),reply:await response.json().catch(()=>null)});
  }});
  try{
    const starterTiming=await startAndVerifyRunning(page);
    const cycle=await observeSlowCycle(page);
    expect(cycle.travel).toBeGreaterThanOrEqual(4*Math.PI);expect(cycle.samples.length).toBeGreaterThan(20);
    expect(cycle.elapsedMs).toBeGreaterThan(1800);expect(cycle.samples.every(s=>s.rpm>700)).toBe(true);
    expect(cycle.samples.at(-1)!.nativeTime-cycle.samples[0].nativeTime).toBeGreaterThan(1);
    const distance=(a:number[],b:number[])=>Math.hypot(...a.map((value,i)=>value-b[i]));
    expect(new Set(cycle.samples.map(s=>s.mesh.frame)).size,'real rendered frames across the cycle').toBeGreaterThan(20);
    // Aggregate numerical evidence before invoking reporter-instrumented matchers.
    // Thousands of individual Playwright steps compete with the real-time engine.
    const meshCheck={sixParts:true,sharedDepth:true,opaque:true,pinError:0,upperJointError:0,lowerJointError:0,rodLengthError:0,angularOvershoot:0};
    for(const sample of cycle.samples){
      meshCheck.sixParts&&=sample.mesh.parts.length===6;meshCheck.sharedDepth&&=sample.mesh.occlusion==='shared-depth';
      for(const part of sample.mesh.parts){
        meshCheck.pinError=Math.max(meshCheck.pinError,distance(part.wristPin,part.piston));
        meshCheck.upperJointError=Math.max(meshCheck.upperJointError,distance(part.wristPin,part.rodEnds[0]));
        meshCheck.lowerJointError=Math.max(meshCheck.lowerJointError,distance(part.crankPin,part.rodEnds[1]));
        meshCheck.rodLengthError=Math.max(meshCheck.rodLengthError,Math.abs(distance(part.rodEnds[0],part.rodEnds[1])-sample.rodMm));
        meshCheck.opaque&&=part.opaque===true;
      }
    }
    for(let i=1;i<cycle.samples.length;i++){
      const a=cycle.samples[i-1],b=cycle.samples[i],step=(b.angle-a.angle+4*Math.PI)%(4*Math.PI);
      meshCheck.angularOvershoot=Math.max(meshCheck.angularOvershoot,step-((b.elapsedMs-a.elapsedMs)/1000*2*Math.PI+.04));
    }
    expect(meshCheck.sixParts).toBe(true);expect(meshCheck.sharedDepth).toBe(true);expect(meshCheck.opaque).toBe(true);
    expect(meshCheck.pinError,'actual wrist-pin centering').toBeLessThan(1e-6);
    expect(meshCheck.upperJointError,'actual upper rod connection').toBeLessThan(1e-6);
    expect(meshCheck.lowerJointError,'actual lower rod connection').toBeLessThan(1e-6);
    expect(meshCheck.rodLengthError,'fixed native rod length across all samples').toBeLessThan(5e-7);
    expect(meshCheck.angularOvershoot,'continuous progression bounded by 60 visual RPM using the shared RAF timestamp').toBe(0);
    await writeFile(testInfo.outputPath('engine-3d-cycle-before-flow.json'),JSON.stringify({cycle,state:(await debug(page)).state,app:await page.locator('#app').evaluate(h=>({...((h as HTMLElement).dataset)})),host:await host.evaluate(h=>({...((h as HTMLElement).dataset)}))},null,2));
    await expect.poll(async()=>Number(await host.getAttribute('data-flowing-routes'))).toBeGreaterThan(10);

    await canvas.scrollIntoViewIfNeeded();const bounds=(await canvas.boundingBox())!,before=await host.getAttribute('data-camera');
    await page.mouse.move(bounds.x+bounds.width*.6,bounds.y+bounds.height*.55);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.5,{steps:6});await page.mouse.up();
    await expect.poll(()=>host.getAttribute('data-camera')).not.toBe(before);
    const rotated=await host.getAttribute('data-camera');await page.mouse.wheel(0,-180);
    await expect.poll(()=>host.getAttribute('data-camera')).not.toBe(rotated);
    const presets:Record<string,string|null>={};
    for(const preset of ['overview','intake','exhaust','front','top']){
      await page.locator('#three-camera').selectOption(preset);await page.waitForTimeout(180);
      presets[preset]=await host.getAttribute('data-camera');await expect(canvas).toBeVisible();
    }
    expect(new Set(Object.values(presets)).size).toBe(5);
    await page.locator('#three-camera-reset').click();await expect(page.locator('#three-camera')).toHaveValue('overview');

    const gear=(await debug(page)).state?.gear;await canvas.focus();
    for(const key of ['ArrowLeft','ArrowUp','ArrowDown','+','-']){
      await canvas.focus();await expect(canvas).toBeFocused();
      const cameraBefore=await host.getAttribute('data-camera');await canvas.press(key);
      await expect.poll(()=>host.getAttribute('data-camera'),{message:`${key} changes the focused canvas camera`}).not.toBe(cameraBefore);
      expect((await debug(page)).state?.gear,`${key} remains a camera command`).toBe(gear);
    }
    await page.keyboard.press('Home');

    await page.locator('#three-housing').check();
    for(const name of ['Rohre','Transparent','Nur Flow']){
      await page.getByRole('button',{name,exact:true}).click();
      await expect(page.locator('#three-extras')).toBeChecked();await expect(page.locator('#three-housing')).toBeChecked();
    }
    await expect(host).toHaveAttribute('data-visible-pipes','0');
    await expect.poll(async()=>Number(await host.getAttribute('data-visible-streams'))).toBeGreaterThan(20);
    await page.locator('#three-extras').uncheck();await page.locator('#three-housing').uncheck();
    await page.getByRole('button',{name:'Rohre',exact:true}).click();await expect(page.locator('#three-extras')).not.toBeChecked();
    await expect.poll(async()=>Number(await host.getAttribute('data-visible-pipes'))).toBeGreaterThan(20);
    await page.getByLabel('Wasser: Rohrdarstellung',{exact:true}).selectOption('flow');
    await page.getByLabel('Benzin: Rohrdarstellung',{exact:true}).selectOption('transparent');
    const modes=JSON.parse((await host.getAttribute('data-pipe-modes'))!);
    expect(modes).toMatchObject({water:'flow',fuel:'transparent',air:'solid'});

    await page.locator('#engine-view-2d').click();await expect(page.locator('#engine-canvas')).toBeVisible();await expect(canvas).toBeHidden();
    await expect(page.locator('#engine-canvas')).toHaveAttribute('data-valve-timing','native-angle');
    const hiddenFrame=await host.getAttribute('data-frame-serial');await page.waitForTimeout(700);
    expect(await host.getAttribute('data-frame-serial'),'hidden 3D render is suspended').toBe(hiddenFrame);
    await page.locator('#engine-view-3d').click();await expect(canvas).toBeVisible();
    expect(JSON.parse((await host.getAttribute('data-pipe-modes'))!)).toEqual(modes);await expect(page.locator('#three-extras')).not.toBeChecked();
    await page.getByRole('button',{name:'Kühlung',exact:true}).click();await expect(canvas).toBeHidden();await page.waitForTimeout(100);
    const offPageFrame=await host.getAttribute('data-frame-serial');await page.waitForTimeout(700);
    expect(await host.getAttribute('data-frame-serial'),'off-page 3D render is suspended').toBe(offPageFrame);
    await page.getByRole('button',{name:'Mechanik',exact:true}).click();await expect(canvas).toBeVisible();

    const selections=page.locator('[data-medium]');for(let i=0;i<await selections.count();i++)await selections.nth(i).selectOption('off');
    await expect(host).toHaveAttribute('data-visible-pipes','0');await expect(host).toHaveAttribute('data-visible-streams','0');
    for(const part of ['pistons','rods','crank-throws'])await expect(host).toHaveAttribute(`data-visible-${part}`,'6');
    await page.locator('#stop').click();await expect.poll(async()=>(await debug(page)).state?.ignition).toBe(false);
    await page.locator('#reset').click();await expect.poll(async()=>(await debug(page)).state?.rpm??Infinity).toBeLessThan(5);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await writeFile(testInfo.outputPath('engine-3d-acceptance.json'),JSON.stringify({...observed,starterTiming,cycle,meshCheck,presets,host:await host.evaluate(h=>({...((h as HTMLElement).dataset)})),scope:'C++ native state and displayed 720-degree slow cycle in Chromium/WebGL. Flow is schematic; no CFD or speaker-listening acceptance.'},null,2));
    expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
  }finally{
    await writeFile(testInfo.outputPath('engine-3d-final-state.json'),JSON.stringify({commands,state:(await debug(page)).state,starterTiming:await page.evaluate(()=>(window as any).__engine3dStarterAudit),app:await page.locator('#app').evaluate(h=>({...((h as HTMLElement).dataset)})),host:await host.evaluate(h=>({...((h as HTMLElement).dataset)}))},null,2));
    await page.locator('#stop').click();
  }
});

test('375px: touch orbit and pinch, presets, media and 2D continuity stay contained',async({browser},testInfo)=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true,baseURL:testInfo.project.use.baseURL as string});
  const page=await context.newPage(),observed=observeErrors(page);
  try{
    await page.goto('/#mechanics');const host=page.locator('.engine-three-host'),canvas=page.locator('#engine-3d-canvas');
    await expect(host).toHaveAttribute('data-webgl','ready',{timeout:30000});await expect(canvas).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!,x=box.x+box.width*.5,y=box.y+box.height*.55;
    // Exercise Chromium's input pipeline, producing trusted pointer events.
    const cdp=await context.newCDPSession(page),before=await host.getAttribute('data-camera');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+45,y,id:1}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+45-i*15,y:y-i*3,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>host.getAttribute('data-camera')).not.toBe(before);
    const rotated=await host.getAttribute('data-camera');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-30-i*6,y,id:1},{x:x+30+i*6,y,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>host.getAttribute('data-camera')).not.toBe(rotated);await cdp.detach();
    const presets:Record<string,string|null>={};
    for(const preset of ['overview','intake','exhaust','front','top']){
      await page.locator('#three-camera').selectOption(preset);await page.waitForTimeout(180);presets[preset]=await host.getAttribute('data-camera');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(new Set(Object.values(presets)).size).toBe(5);
    await page.getByRole('button',{name:'Nur Flow',exact:true}).click();await expect(host).toHaveAttribute('data-visible-pipes','0');
    await page.getByLabel('Wasser: Rohrdarstellung',{exact:true}).selectOption('transparent');
    await page.locator('#engine-view-2d').click();await expect(page.locator('#engine-canvas')).toBeVisible();
    await page.locator('#engine-view-3d').click();await expect(canvas).toBeVisible();
    await expect(page.getByLabel('Wasser: Rohrdarstellung',{exact:true})).toHaveValue('transparent');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await writeFile(testInfo.outputPath('engine-3d-mobile.json'),JSON.stringify({...observed,presets},null,2));
    expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
  }finally{await context.close();}
});

test('unavailable WebGL opens usable 2D and retains a visible explanation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:any[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return (original as any).call(this,type,...args);
    } as typeof original;
  });
  await page.goto('/#mechanics');
  await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('.three-fallback')).toBeVisible();
  await expect(page.locator('.three-fallback')).toContainText('2D-Schnitt');
  await expect(page.locator('#engine-view-2d')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#engine-view-3d')).toBeDisabled();
  await page.getByRole('button',{name:'Kühlung',exact:true}).click();await page.getByRole('button',{name:'Mechanik',exact:true}).click();
  await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('.three-fallback')).toBeVisible();expect(errors).toEqual([]);
});

test('a preset chosen while the lazy 3D chunk loads is applied after initialization',async({page})=>{
  await page.goto('/?view=2d#mechanics');
  const chunk=/\/assets\/engine-three-[^/]+\.js(?:\?.*)?$/;
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route(chunk,async route=>{await gate;await route.continue();});
  await page.locator('#engine-view-3d').click();await page.locator('#three-camera').selectOption('top');release();
  const host=page.locator('.engine-three-host');await expect(host).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect.poll(async()=>{
    const values=(await host.getAttribute('data-camera')??'').split(',').map(Number);
    return values.length===3&&values.every(Number.isFinite)&&values[1]>Math.abs(values[0])+Math.abs(values[2]);
  }).toBe(true);
  await expect(page.locator('#three-camera')).toHaveValue('top');
  await expect(host).toHaveAttribute('data-camera-preset','top');
});

test('page lifecycle suspends a cached view and disposes/recreates an uncached renderer',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/#mechanics');const host=page.locator('.engine-three-host'),canvas=page.locator('#engine-3d-canvas');
  await expect(host).toHaveAttribute('data-webgl','ready',{timeout:30000});
  await expect.poll(()=>host.getAttribute('data-frame-serial')).not.toBeNull();
  await page.locator('#three-camera').selectOption('exhaust');
  await page.getByLabel('Wasser: Rohrdarstellung',{exact:true}).selectOption('off');
  // Exercise the persisted lifecycle handlers. Browser cache eligibility itself
  // depends on the streaming connection and is outside this handler regression.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  const frame=await host.getAttribute('data-frame-serial');await page.waitForTimeout(700);
  expect(await host.getAttribute('data-frame-serial')).toBe(frame);await expect(canvas).toHaveCount(1);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect.poll(()=>host.getAttribute('data-frame-serial')).not.toBe(frame);
  await expect(host).toHaveAttribute('data-camera-preset','exhaust');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  await expect(canvas).toHaveCount(0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false})));
  await expect(canvas).toHaveCount(1);await expect(host).toHaveAttribute('data-webgl','ready');
  await expect(host).toHaveAttribute('data-camera-preset','exhaust');
  await expect(page.getByLabel('Wasser: Rohrdarstellung',{exact:true})).toHaveValue('off');
});

test('cold 2D to 3D initialization preserves the running native motor and SSE connection',async({page},testInfo)=>{
  test.setTimeout(120000);const observed=observeErrors(page);
  await page.addInitScript(()=>{
    const NativeEventSource=window.EventSource;(window as any).__engine3dSseErrors=[];
    window.EventSource=class extends NativeEventSource{
      constructor(url:string|URL,options?:EventSourceInit){
        super(url,options);
        this.addEventListener('error',()=>{(window as any).__engine3dSseErrors.push({at:Date.now(),url:this.url,readyState:this.readyState});});
      }
    };
  });
  await page.goto('/?view=2d#mechanics');await expect(page.locator('#connection')).toHaveText('Physischer Kern');
  await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
  await page.locator('#reset').click();await expect.poll(async()=>(await debug(page)).state?.rpm??Infinity).toBeLessThan(5);
  await page.locator('#start').click();
  try{
    await page.waitForTimeout(4800);await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:15000}).toBeGreaterThan(700);
    await expect.poll(async()=>(await debug(page)).state?.fuelRateGS).toBeGreaterThan(0);
    await page.evaluate(()=>{
      const started=performance.now(),samples:any[]=[];
      (window as any).__engine3dColdSamples=samples;
      (window as any).__engine3dColdTimer=setInterval(()=>{
        const state=(window as any).__playground.state;
        samples.push({elapsedMs:performance.now()-started,rpm:state?.rpm,ignition:state?.ignition,nativeTime:state?.t});
      },100);
    });
    await page.locator('#engine-view-3d').click();
    await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:60000});
    await expect(page.locator('#engine-3d-canvas')).toBeVisible();await page.waitForTimeout(1000);
    await expect.poll(async()=>(await debug(page)).state?.rpm).toBeGreaterThan(700);expect((await debug(page)).state?.ignition).toBe(true);
    await expect(page.locator('#connection')).toHaveText('Physischer Kern');
    const evidence=await page.evaluate(()=>{
      clearInterval((window as any).__engine3dColdTimer);
      return {samples:(window as any).__engine3dColdSamples,sseErrors:(window as any).__engine3dSseErrors};
    });
    await writeFile(testInfo.outputPath('engine-3d-cold-start.json'),JSON.stringify({...observed,...evidence},null,2));
    expect(evidence.samples.length).toBeGreaterThan(5);expect(evidence.samples.every((s:any)=>s.ignition===true&&s.rpm>700)).toBe(true);
    expect(evidence.sseErrors).toEqual([]);expect(observed.errors).toEqual([]);expect(observed.failures).toEqual([]);
  }finally{
    const finalEvidence=await page.evaluate(()=>{
      clearInterval((window as any).__engine3dColdTimer);
      const state=(window as any).__playground.state;
      return {samples:(window as any).__engine3dColdSamples,sseErrors:(window as any).__engine3dSseErrors,
        host:{...(document.querySelector('.engine-three-host') as HTMLElement)?.dataset},
        finalState:state?{rpm:state.rpm,ignition:state.ignition,t:state.t}:null};
    });
    await writeFile(testInfo.outputPath('engine-3d-cold-start.json'),JSON.stringify({...observed,...finalEvidence},null,2));
    await page.locator('#stop').click();
  }
});
