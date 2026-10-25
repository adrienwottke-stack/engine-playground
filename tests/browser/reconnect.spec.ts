import {test,expect}from'@playwright/test';
test('an ended PCM connection reconnects automatically and plays the running physical motor',async({page})=>{
 let streams=0;
  let commands=0;
  await page.route('**/api/core/command',async route=>{if(++commands===1)await new Promise(resolve=>setTimeout(resolve,300));await route.continue();});
 await page.route('**/api/core/audio',async route=>{if(++streams===1)await route.fulfill({status:200,contentType:'application/octet-stream',body:''});else await route.continue();});
 await page.goto('/');await expect(page.locator('#connection')).toHaveText('Physischer Kern');await page.locator('#start').click();
 await expect.poll(()=>streams).toBeGreaterThanOrEqual(2);
 await expect.poll(()=>page.evaluate(()=>(window as any).__playground.audio.rms),{timeout:12000}).toBeGreaterThan(.0001);
 await page.locator('#stop').click();
});
