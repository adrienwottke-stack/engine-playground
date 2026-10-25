import {test,expect,type Page} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const debug=(p:Page)=>p.evaluate(()=>(window as any).__playground);
async function pixels(page:Page,part:'engine'|'radiator'|'all'){
 return page.locator('#cooling-canvas').evaluate((node:HTMLCanvasElement,part)=>{
  const w=node.width/900,h=node.height/610,c=node.getContext('2d')!;
  const box=part==='engine'?[28,162,340,210]:part==='radiator'?[660,161,220,215]:[0,0,900,610];
  const d=c.getImageData(Math.round(box[0]*w),Math.round(box[1]*h),Math.round(box[2]*w),Math.round(box[3]*h)).data;
  let hash=2166136261;for(const b of d)hash=Math.imul(hash^b,16777619);return hash>>>0;
 },part);
}
test('cold thermostat leaves radiator still while coolant circulates through the block; zero pump stops it',async({page})=>{
 await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#cold-cooling').click();
 await expect.poll(async()=>(await debug(page)).state?.coolantC).toBe(22);
 await expect(page.locator('#engine-3d-canvas')).toHaveCount(0);
 const e1=await pixels(page,'engine'),r1=await pixels(page,'radiator');await page.waitForTimeout(260);
 expect(await pixels(page,'engine')).not.toBe(e1);expect(await pixels(page,'radiator')).toBe(r1);
 const flow=page.getByRole('slider',{name:'Pumpen-Durchfluss',exact:true});await flow.focus();await flow.press('Home');
 await expect.poll(async()=>(await debug(page)).config.cooling.flowLMin).toBe(0);await page.waitForTimeout(180);
 const stopped=await pixels(page,'all');await page.waitForTimeout(260);expect(await pixels(page,'all')).toBe(stopped);
});
test('native motor moves in cooling, slow motion keeps audio and RPM live, warm radiator flows on desktop and mobile',async({page})=>{
 test.setTimeout(45000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();
 try{
  await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
  await page.locator('#cooling-slow').check();const before=await debug(page),engine=await pixels(page,'engine');await page.waitForTimeout(240);const after=await debug(page);
  expect(after.visualAngle).not.toBe(before.visualAngle);expect(await pixels(page,'engine')).not.toBe(engine);expect(after.slow).toBe(true);expect(after.state.rpm).toBeGreaterThan(700);
  await page.locator('#warm-cooling').click();await expect.poll(async()=>(await debug(page)).state?.radiatorFlowLMin).toBeGreaterThan(1);
  const radiator=await pixels(page,'radiator');await page.waitForTimeout(300);expect(await pixels(page,'radiator')).not.toBe(radiator);
  await page.waitForTimeout(4000);
  if(process.env.EP_CAPTURE_MOTION){
   const dir='../../work/cooling-v044-frames';await mkdir(dir,{recursive:true});const times:number[]=[];
   for(let i=0;i<16;i++){times.push(Date.now());await page.locator('#cooling-canvas').screenshot({path:`${dir}/${String(i).padStart(2,'0')}.png`});await page.waitForTimeout(90);}
   await writeFile(`${dir}/times.json`,JSON.stringify(times));
  }
  await page.locator('#cooling-canvas').screenshot({path:'evidence/cooling-v044-desktop-detail.png'});
  await page.screenshot({path:'evidence/cooling-v044-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(150);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#cooling-canvas').screenshot({path:'evidence/cooling-v044-mobile-detail.png'});
  await page.screenshot({path:'evidence/cooling-v044-mobile.png',fullPage:true});
  await writeFile('evidence/cooling-v044-motion.json',JSON.stringify({angleBefore:before.visualAngle,angleAfter:after.visualAngle,rpmAfter:after.state.rpm,slow:after.slow,errors},null,2));expect(errors).toEqual([]);
 }finally{await page.locator('#stop').click();}
});

test('reduced motion freezes mechanism and fluid markers until the user opts into animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#cold-cooling').click();
 const a=await pixels(page,'all');await page.waitForTimeout(250);expect(await pixels(page,'all')).toBe(a);
 await page.locator('#cooling-slow').check();const b=await pixels(page,'engine');await page.waitForTimeout(250);expect(await pixels(page,'engine')).not.toBe(b);
});

test('throttle, clutch and gear controls still operate while the cooling canvas animates',async({page})=>{
 test.setTimeout(45000);await page.goto('/#cooling');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#reset').click();await page.locator('#start').click();
 try{
  await expect.poll(async()=>(await debug(page)).state?.rpm,{timeout:12000}).toBeGreaterThan(700);
  await page.keyboard.down('Shift');await expect.poll(async()=>(await debug(page)).state?.clutch).toBe(0);
  await page.keyboard.press('ArrowUp');await expect.poll(async()=>(await debug(page)).state?.gear).toBe(1);
  await page.keyboard.down('w');await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(.1);
  await page.keyboard.up('Shift');await expect.poll(async()=>(await debug(page)).state?.clutch).toBe(1);
  await page.keyboard.up('w');await expect.poll(async()=>(await debug(page)).state?.pedal).toBe(0);
 }finally{await page.keyboard.up('Shift');await page.keyboard.up('w');await page.locator('#stop').click();}
});
