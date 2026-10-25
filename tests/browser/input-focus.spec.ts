import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const debug=(p:any)=>p.evaluate(()=>(window as any).__playground);

test('throttle resumes after a cooling dropdown keeps keyboard focus',async({page})=>{
 const sent:number[]=[];page.on('request',request=>{if(request.url().endsWith('/api/core/command'))try{sent.push(request.postDataJSON().controls.throttle);}catch{}});
 await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();
 await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
 await page.locator('#thermal-rate').focus();await page.locator('#thermal-rate').selectOption('10');
 expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('SELECT');
 sent.length=0;await page.keyboard.down('r');
 try{
  await page.waitForTimeout(350);const d=await debug(page);await writeFile('evidence/throttle-dropdown-observed.json',JSON.stringify({focusedTag:await page.evaluate(()=>document.activeElement?.tagName),pedal:d.state?.pedal,rpm:d.state.rpm,ignition:d.state.ignition,sentPedals:sent},null,2));
  expect(sent.some(value=>value===1),'this tab must actually transmit full throttle after dropdown selection').toBe(true);
  await expect.poll(async()=>(await debug(page)).state?.pedal,{timeout:1500}).toBe(1);
  await page.screenshot({path:'evidence/input-v042-desktop.png'});await page.setViewportSize({width:375,height:812});await expect(page.locator('#stop')).toBeVisible();await page.screenshot({path:'evidence/input-v042-mobile.png',fullPage:true});
 }finally{await page.keyboard.up('r');await page.locator('#stop').click();}
});

test('successive dropdowns keep arrows for option selection and return Q/W/E/R to engine control',async({page})=>{
 await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();
 await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
 for(const [selector,value,key,pedal]of[['#thermal-rate','10','q',.01],['#heat-mode','manual','w',.1],['#thermal-metric','heat','e',.2],['#thermal-rate','1','r',1]]as const){
  const field=page.locator(selector);await field.focus();await field.selectOption(value);await page.keyboard.down(key);
  try{await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(pedal);expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('SELECT');}
  finally{await page.keyboard.up(key);}
  await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(0);
 }
 await page.locator('#thermal-rate').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await expect(page.locator('#thermal-rate')).toHaveValue('10');expect((await debug(page)).state?.gear).toBe(0);
 await page.keyboard.press('Escape');await page.keyboard.down('r');try{await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(1);}finally{await page.keyboard.up('r');await page.locator('#stop').click();}
});

test('editing gear numbers blocks engine shortcuts until Escape explicitly returns to driving',async({page})=>{
 await page.goto('/#gearing');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
 const field=page.getByRole('spinbutton',{name:'Übersetzung Gang 1',exact:true});await field.focus();await page.keyboard.down('r');
 try{await page.waitForTimeout(300);expect((await debug(page)).state?.pedal).toBe(0);await expect(field).toBeFocused();}finally{await page.keyboard.up('r');}
 await page.keyboard.press('Escape');await expect(field).not.toBeFocused();await page.keyboard.down('r');try{await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(1);}finally{await page.keyboard.up('r');await page.locator('#stop').click();}
});

test('after tab switches a fresh throttle press claims control and passive tabs cannot cancel it',async({page,context})=>{
 test.setTimeout(60000);let other:Page|undefined,passive:Page|undefined;
 try{
  await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
  other=await context.newPage();await other.goto('/?view=2d#mechanics');await expect(other.locator('#connection')).toHaveText('Physischer Kern');
  passive=await context.newPage();await passive.goto('/#cooling');await expect(passive.locator('#connection')).toHaveText('Physischer Kern');
  for(let i=0;i<2;i++){
   await other.bringToFront();await other.keyboard.down('w');try{await expect.poll(async()=>(await debug(other)).state?.pedal).toBe(.1);}finally{await other.keyboard.up('w');}
   await page.bringToFront();await page.locator('#thermal-rate').focus();await page.locator('#thermal-rate').selectOption('1');await page.keyboard.down('r');
   try{await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(1);await page.waitForTimeout(450);expect((await debug(page)).state?.pedal).toBe(1);}finally{await page.keyboard.up('r');}
   await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(0);
  }
 }finally{
  try{await passive?.close();}finally{
   try{await other?.close();}finally{await page.locator('#stop').click();}
  }
 }
});
