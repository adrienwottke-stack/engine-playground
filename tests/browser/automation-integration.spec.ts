import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const url='/automation-preview/index.html?workshop=automation#mechanics';
const evidence='evidence/automation-integration';
test.use({actionTimeout:10000,trace:'off',launchOptions:{args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']}});
const read=(page:any)=>page.evaluate(()=>{const d=(window as any).__playground;return {tuning:d.tuning,state:d.state?{rpm:d.state.rpm,ignition:d.state.ignition,gear:d.state.gear,source:d.state.source,geometry:d.state.geometry}:null,scene:d.engine3d.scene};});

test('integrated editor uses confirmed native intake parts and keeps camera, keyboard and lighting through rebuilds',async({page})=>{
  test.setTimeout(180000);await mkdir(evidence,{recursive:true});
  const errors:string[]=[],failures:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>{if(!request.failure()?.errorText.includes('ERR_ABORTED'))failures.push(request.url());});
  await page.goto(url);
  await expect(page.locator('.automation-workshop')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-workshop','automation');
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:60000});
  await expect(page.locator('#start')).toBeEnabled({timeout:20000});
  await page.locator('#reset').click();
  const ui=page.locator('.automation-workshop');
  if(await ui.locator('[data-reset]').isEnabled())await ui.locator('[data-reset]').click();
  if(await ui.locator('[data-apply]').isEnabled())await ui.locator('[data-apply]').click();
  await expect(ui).toHaveAttribute('data-pending','false',{timeout:25000});
  await expect.poll(async()=>(await read(page)).scene?.assembly.intakeVariant?.intake,{timeout:25000}).toBe('standard');
  await page.locator('#three-camera').selectOption('intake');
  const original=await read(page);expect(original.state?.source).toBe('ange-physical');
  await ui.locator('[data-stage="2"]').click();
  await page.keyboard.press('Home');await expect(ui.locator('[data-stage="0"]')).toBeFocused();
  await page.keyboard.press('End');await expect(ui.locator('[data-stage="4"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect(ui.locator('[data-stage="3"]')).toBeFocused();
  for(const key of ['a','s','r','ArrowUp','ArrowDown','Shift'])await page.keyboard.press(key);
  await expect.poll(async()=>(await read(page)).state?.ignition).toBe(false);
  expect((await read(page)).state?.gear).toBe(0);expect(await page.locator('#throttle').inputValue()).toBe('0');
  await page.locator('#engine-3d-canvas').click();await page.keyboard.press('ArrowUp');
  await expect.poll(async()=>(await read(page)).state?.gear).toBe(1);
  await page.keyboard.press('ArrowDown');await expect.poll(async()=>(await read(page)).state?.gear).toBe(0);
  const switches:any[]=[];
  for(const intake of ['sport','race','standard']){
    await ui.locator('[data-stage="2"]').click();
    const before=await read(page),revision=before.scene.assembly.revision;
    await ui.locator(`[data-part="intake"][data-value="${intake}"]`).click();
    await expect(ui).toHaveAttribute('data-pending','true');
    const draft=await read(page);expect(draft.tuning.confirmedKey).toBe(before.tuning.confirmedKey);
    expect(draft.scene.assembly.revision).toBe(revision);expect(draft.scene.assembly.intakeVariant.intake).toBe(before.scene.assembly.intakeVariant.intake);
    await ui.locator('[data-apply]').click();
    await expect(ui).toHaveAttribute('data-pending','false',{timeout:25000});
    await expect.poll(async()=>(await read(page)).scene.assembly.revision,{timeout:40000}).toBe(revision+1);
    const after=await read(page);expect(after.scene.assembly.intakeVariant.intake).toBe(intake);
    expect(after.tuning.visualKey).toBe(after.tuning.confirmedKey);
    expect(after.scene.camera.preset).toBe('intake');
    for(let i=0;i<3;i++)expect(Math.abs(after.scene.camera.position[i]-before.scene.camera.position[i])).toBeLessThan(1);
    await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready');
    switches.push({intake,revision:after.scene.assembly.revision,resources:after.scene.resources,confirmedKey:after.tuning.confirmedKey});
    if(intake==='sport'){
      await page.locator('button[data-presentation="closed"]').click();
      await page.screenshot({path:`${evidence}/desktop.png`,fullPage:true,timeout:25000});
      await page.locator('.engine-three-stage').screenshot({path:`${evidence}/installed-sport.png`,timeout:25000});
      await page.reload();await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:60000});
      await expect.poll(async()=>(await read(page)).scene?.assembly.intakeVariant.intake,{timeout:10000}).toBe('sport');
      await page.locator('#three-camera').selectOption('intake');
    }
  }
  expect(switches[2].resources.textures).toBeLessThanOrEqual(switches[0].resources.textures+2);
  await page.locator('#start').click();
  await expect.poll(async()=>(await read(page)).state?.rpm??0,{timeout:20000}).toBeGreaterThan(650);
  await page.locator('#start').press('Enter');await expect.poll(async()=>(await read(page)).state?.ignition).toBe(false);
  expect(errors).toEqual([]);expect(failures).toEqual([]);
  await writeFile(`${evidence}/native-browser.json`,JSON.stringify({passed:true,original,switches,final:await read(page),errors,failures},null,2));
});

test('375px integrated workshop keeps all five stages and touch controls accessible',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:375,height:812});await page.goto(url);
  const ui=page.locator('.automation-workshop');await expect(ui).toBeVisible();
  await expect(page.locator('.engine-three-host')).toHaveAttribute('data-webgl','ready',{timeout:60000});
  for(let i=0;i<5;i++){await ui.locator(`[data-stage="${i}"]`).click();await expect(ui.locator(`[data-stage="${i}"]`)).toHaveAttribute('aria-selected','true');}
  await ui.locator('[data-stage="2"]').click();await ui.locator('[data-more]').click();
  await expect(ui.locator('[data-part="filter"]').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const selector of ['[data-more]','[data-apply]','[data-metric="torqueNm"]'])expect((await ui.locator(selector).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:`${evidence}/mobile.png`,fullPage:true,timeout:25000});
});
