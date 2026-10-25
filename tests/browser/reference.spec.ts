import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const debug=(page:any)=>page.evaluate(()=>(window as any).__playground);

test('fixed M52, six independent cycles and native angle-aligned valve profiles; live DSP and exhaust reload',async({page})=>{
 test.setTimeout(55000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?view=2d');await expect(page.locator('#connection')).toHaveText('Physischer Kern');
 await expect(page.locator('#backend')).toBeHidden();await expect(page.locator('#engine-preset')).toHaveCount(0);
 await expect(page.locator('#slow')).not.toBeChecked();await expect(page.locator('#engine-canvas')).toHaveAttribute('data-cylinder-layout','inline-six');
 await page.locator('#start').click();await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
 await expect.poll(async()=>(await debug(page)).audio.rms).toBeGreaterThan(.0001);
 await expect.poll(async()=>(await debug(page)).state?.cycles?.filter((c:any)=>c.samples.filter(Boolean).length===144).length,{timeout:12000}).toBe(6);
 await expect(page.locator('#engine-canvas')).toHaveAttribute('data-valve-timing','native-angle');
 const first=await debug(page);expect(first.state.engineName).toBe('BMW M52B28');expect(first.state.simulationHz).toBe(10000);expect(first.state.geometry.strokeMm).toBeCloseTo(84,6);expect(first.state.reference).toBe(true);
 expect(first.state.valveCurves.samples).toHaveLength(6);
 expect(new Set(first.state.cycles.map((c:any)=>JSON.stringify(c.samples))).size).toBe(6);
 const comparison=[];
 for(let i=0;i<24;i++){
   const s=(await debug(page)).state;let maxError=0;
   for(let c=0;c<6;c++){
     const curve=s.valveCurves.samples[c],pos=((s.crankAngle%(4*Math.PI))+4*Math.PI)%(4*Math.PI)/(4*Math.PI)*curve.length,index=Math.floor(pos),fraction=pos-index;
     for(let v=0;v<2;v++){const lift=curve[index][v]+(curve[(index+1)%curve.length][v]-curve[index][v])*fraction,actual=s.cylinders[c][v===0?'intakeLiftMm':'exhaustLiftMm'];maxError=Math.max(maxError,Math.abs(lift-actual));}
   }
   comparison.push(maxError);await page.waitForTimeout(35);
 }
 expect(Math.max(...comparison)).toBeLessThan(.12);
 await page.locator('.sound-details>summary').click();
 await page.getByRole('slider',{name:'Strömungsrauigkeit',exact:true}).focus();await page.getByRole('slider',{name:'Strömungsrauigkeit',exact:true}).press('Home');
 await expect.poll(async()=>(await debug(page)).state.sound.noise).toBe(0);
 await page.locator('#sound-reset').click();await expect.poll(async()=>(await debug(page)).state.sound.noise).toBe(1);
 await page.locator('.sound-details>summary').click();
 await page.locator('#slow').check();await expect(page.locator('#slow')).toBeChecked();
 await page.screenshot({path:'evidence/v04-six-cylinders-slow.png'});await page.locator('#slow').uncheck();
 await page.screenshot({path:'evidence/v04-six-cylinders-desktop.png'});
 await page.locator('#exhaust-ir').selectOption('sharp_0');await expect.poll(async()=>(await debug(page)).state.ignition).toBe(false);
 await page.locator('#start').click();await expect.poll(async()=>(await debug(page)).state.rpm,{timeout:12000}).toBeGreaterThan(700);
 await expect(page.locator('#engine-canvas')).toHaveAttribute('data-valve-timing','native-angle');
 await page.locator('#stop').click();await page.locator('#reset').click();
 await writeFile('evidence/v04-native-valves.json',JSON.stringify({scope:'24 live snapshots x6 cylinders x2 valves compared to native instantaneous lift; phase interpolation at288 bins. Separate from sound/speaker acceptance.',maxErrorMm:Math.max(...comparison),errors,sixCycles:first.state.cycles.map((c:any)=>({cylinder:c.cylinder,captured:c.samples.filter(Boolean).length})),engineName:first.state.engineName},null,2));
 expect(errors).toEqual([]);
});

test('375px whole engine, requested six metrics and fixed engine settings fit without overflow',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.goto('/?view=2d');await expect(page.locator('#connection')).toHaveText('Physischer Kern');
 await expect(page.locator('#engine-canvas')).toBeVisible();await expect(page.locator('#throttle')).toBeHidden();await expect(page.locator('#wave-tab')).toHaveCount(0);
 expect(await page.locator('[data-gauge]').evaluateAll(elements=>elements.map(e=>(e as HTMLElement).dataset.gauge))).toEqual(['rpm','speedKmh','powerKw','torqueNm','coolantC','fuelRateGS']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'evidence/v04-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Antrieb',exact:true}).click();await expect(page.getByRole('slider',{name:'Bohrung',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Mechanik',exact:true}).click();await page.locator('#stop').click();
});
