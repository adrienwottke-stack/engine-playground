import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.use({trace:'off',launchOptions:{args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']}});

test('complete 3D workshop moves its actual mechanism, ignition and timing drive from native data',async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width:1280,height:800});
  const errors:string[]=[],failures:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>{if(!request.failure()?.errorText.includes('ERR_ABORTED'))failures.push(request.url());});
  await mkdir('evidence/garage-round',{recursive:true});
  await page.goto('/');
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:30000});
  const read=()=>page.evaluate(()=>(window as any).__playground.engine3d);
  const initial=await read();
  expect(initial.component).toBe('engine');
  expect(initial.scene.occlusion).toBe('shared-depth');
  expect(initial.scene.visibility.housing).toBe(true);
  expect(initial.scene.parts).toHaveLength(6);
  for(const name of ['M54B30 Gussblock im Schnitt','M54B30 Kopfkanaele im Schnitt','M54B30 vollstaendiger Gussblock','M54B30 geschlossener Kopf Ventildeckel DoppelVANOS','Verschraubte Ansaug und Abgasflansche','Gegossene Oelwanne','M54B30 DISA Ansaugbruecke Filter Drosselklappe','M54B30 DISA Resonanzklappe','M54B30 Doppel VANOS Stellkolben im Schnitt','Kraftstoffleiste Injektoren','Abgasnachbehandlung','Kuehler Pumpe Thermostat Ausgleich','Ausgleichsbehaelter','Steuerkettenschienen'])expect(initial.scene.assembly.parts).toContain(name);
  expect(initial.scene.assembly.timing.chains).toHaveLength(2);
  expect(initial.scene.assembly.timing.chains.every((chain:any)=>chain.links>20)).toBe(true);
  expect(initial.scene.drawCalls).toBeLessThan(400);
  for(const preset of ['overview','intake','exhaust','front','top']){
    await page.locator('#three-camera').selectOption(preset);
    await expect.poll(async()=>(await read()).scene.camera.preset).toBe(preset);
    await page.locator('.engine-three-stage').screenshot({path:`evidence/garage-round/assembly-${preset}.png`,timeout:20000});
  }
  await page.locator('#three-camera-reset').click();
  await page.screenshot({path:'evidence/garage-round/after-desktop.png',fullPage:true,timeout:20000});
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#start').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.rpm??0),{timeout:20000}).toBeGreaterThan(600);
  await page.locator('#slow').check();
  const animation=await page.evaluate(async()=>{
    const frames:any[]=[],started=performance.now(),cycle=4*Math.PI;
    let travel=0,previous=(window as any).__playground.visualAngle;
    while(travel<cycle&&performance.now()-started<20000){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const d=(window as any).__playground,angle=d.visualAngle,step=(angle-previous+cycle)%cycle;
      if(step>0){
        travel+=step;const scene=d.engine3d.scene;
        frames.push({angle:scene.angle,source:d.state?.source,chains:scene.assembly.timing.chains.map((chain:any)=>({phase:chain.phase,firstMatrix:chain.firstMatrix})),sprockets:scene.assembly.timing.sprockets,fan:scene.assembly.fan,throttle:scene.assembly.throttle,fire:scene.parts.map((part:any)=>part.combustion),rodEnds:scene.parts[0].rodEnds,rodMm:d.state?.geometry?.rodMm});
      }
      previous=angle;
    }
    return {travel,elapsedMs:performance.now()-started,frames};
  });
  expect(animation.travel).toBeGreaterThanOrEqual(4*Math.PI);
  expect(animation.frames.length).toBeGreaterThan(20);
  expect(animation.frames.every(frame=>frame.source==='ange-physical')).toBe(true);
  expect(new Set(animation.frames.map(frame=>frame.chains[0].phase.toFixed(4))).size).toBeGreaterThan(15);
  expect(new Set(animation.frames.map(frame=>frame.fan.toFixed(4))).size).toBeGreaterThan(15);
  expect(animation.frames.some(frame=>frame.fire.some((fire:any)=>fire.flame))).toBe(true);
  expect(animation.frames.some(frame=>frame.fire.some((fire:any)=>fire.spark))).toBe(true);
  for(const frame of animation.frames){
    const [a,b]=frame.rodEnds;
    expect(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])-frame.rodMm)).toBeLessThan(.001);
    for(const gear of frame.sprockets)expect(Math.abs(gear.rotation-frame.angle*gear.ratio)).toBeLessThan(.00001);
  }
  await page.locator('#start').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__playground.state?.ignition)).toBe(false);
  await page.setViewportSize({width:375,height:812});
  await page.locator('#three-camera-reset').click();
  await expect(page.locator('.engine-three-stage')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'evidence/garage-round/after-mobile.png',fullPage:true,timeout:20000});
  await page.locator('.engine-three-stage').screenshot({path:'evidence/garage-round/assembly-mobile.png',timeout:20000});
  expect(errors).toEqual([]);expect(failures).toEqual([]);
  await writeFile('evidence/garage-round/assembly-browser.json',JSON.stringify({passed:true,initial,animation,final:await read(),errors,failures},null,2));
});
