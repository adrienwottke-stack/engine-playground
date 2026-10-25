import {test,expect,type Page,type Locator} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>(window as any).__playground);
async function range(locator:Locator,target:number){const min=Number(await locator.getAttribute('min')),max=Number(await locator.getAttribute('max')),step=Number(await locator.getAttribute('step')||1),lo=Math.round((target-min)/step),hi=Math.round((max-target)/step);await locator.focus();await locator.press(lo<=hi?'Home':'End');for(let i=0;i<Math.min(lo,hi);i++)await locator.press(lo<=hi?'ArrowRight':'ArrowLeft');}

test('cooling warm reset keeps motor heat mode and real-time clock; thermostat and fan status are visible',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();
 await expect(page.locator('#heat-mode')).toHaveValue('estimated');await expect(page.locator('#thermal-rate')).toHaveValue('1');
 await page.locator('#warm-cooling').click();await expect.poll(async()=>(await state(page)).state?.coolantC).toBeGreaterThan(90);
 expect((await state(page)).config.cooling.heatMode).toBe('estimated');expect((await state(page)).thermalRate).toBe(1);
 await expect.poll(async()=>(await state(page)).state?.heatInKw).toBe(0);
 await expect(page.locator('#thermostat-state')).toContainText('% offen');await expect(page.locator('#fan-state')).toContainText('Auto');
 await page.locator('#cold-cooling').click();await expect.poll(async()=>(await state(page)).state?.coolantC).toBe(22);
 await expect(page.locator('#thermostat-state')).toHaveText('Thermostat 0 % offen');await expect(page.locator('#radiator-flow')).toHaveText('Kühlerzweig 0,0 L/min');
 await page.locator('#heat-mode').selectOption('manual');await page.locator('#warm-cooling').click();
 await expect.poll(async()=>(await state(page)).state?.heatInKw).toBe(25);
 const d=await state(page);expect(d.config.cooling.heatMode).toBe('manual');expect(d.thermalRate).toBe(1);expect(d.state.coolantC).toBeLessThan(100);expect(d.state.thermalHalted).toBe(false);
 // Desktop/mobile rendering and motion are captured by cooling-motion.spec.ts; this case checks reset semantics.

 await writeFile('evidence/cooling-v043-browser.json',JSON.stringify({viewport:{width:1280,height:800},state:d.state?Object.fromEntries(['engineC','coolantC','radiatorC','heatInKw','heatOutKw','thermostatOpen','fanDuty','radiatorFlowLMin','thermalHalted','energyResidualJ'].map(k=>[k,d.state[k]])):null,errors},null,2));
 expect(errors).toEqual([]);
});

test('overload ends at liquid-model boundary, reports it explicitly, and resets without mobile overflow',async({page})=>{
 test.setTimeout(35000);await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();
 await page.locator('#heat-mode').selectOption('manual');await range(page.getByRole('slider',{name:'Konstanter Wärmeeintrag',exact:true}),100);
 await range(page.getByRole('slider',{name:'Kühler-Wärmeübergang UA',exact:true}),0);await page.locator('#thermal-rate').selectOption('30');await page.locator('#warm-cooling').click();
 await expect.poll(async()=>(await state(page)).state?.thermalHalted,{timeout:12000}).toBe(true);
 const d=await state(page);expect(d.state.coolantC).toBeLessThanOrEqual(120.000001);expect(d.state.engineC).toBeLessThanOrEqual(160.000001);expect(Math.abs(d.state.energyResidualJ)).toBeLessThan(.001);
 await expect(page.locator('#thermal-alert')).toBeVisible();await expect(page.locator('#cooling-status')).toHaveText('Modellgrenze erreicht');await expect(page.locator('#heat-in')).toHaveText('—');
 const time=d.state.thermalTimeS;await page.waitForTimeout(500);expect((await state(page)).state?.thermalTimeS).toBe(time);
 await page.screenshot({path:'evidence/cooling-v043-overheat.png',fullPage:true});
 await writeFile('evidence/cooling-v043-overload.json',JSON.stringify({heatSourceKw:100,radiatorWPerK:0,clockRate:30,limitState:{engineC:d.state.engineC,coolantC:d.state.coolantC,radiatorC:d.state.radiatorC,thermalTimeS:d.state.thermalTimeS,energyResidualJ:d.state.energyResidualJ,thermalHalted:d.state.thermalHalted}},null,2));
 await page.locator('#reset').click();await page.setViewportSize({width:375,height:812});await page.locator('#warm-cooling').click();
 await expect.poll(async()=>(await state(page)).state?.thermalHalted).toBe(false);await expect(page.locator('#thermal-alert')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.waitForTimeout(4100);await page.locator('#cooling-canvas').screenshot({path:'evidence/cooling-v043-mobile-detail.png'});await page.screenshot({path:'evidence/cooling-v043-mobile.png',fullPage:true});await page.locator('#cold-cooling').click();
});

