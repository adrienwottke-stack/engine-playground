import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const directory=new URL('../evidence/garage-round/',import.meta.url);
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:4196/',{waitUntil:'domcontentloaded'});
  await page.locator('.engine-three-host[data-webgl="ready"]').waitFor({timeout:45000});
  await page.screenshot({path:new URL('before-desktop.png',directory).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true,timeout:20000});
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:new URL('before-mobile.png',directory).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true,timeout:20000});
  await writeFile(new URL('baseline.json',directory),JSON.stringify({errors,recordedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify({captured:true,errors}));
}finally{await browser.close();}
