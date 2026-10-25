/** Isolated geometry proof: loads EngineThree directly and never opens the app,
 * requests a native lease, changes tuning, or posts an engine command. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.EP_3D_PREVIEW_URL||'http://127.0.0.1:4196',output='evidence/3d-workshop-r2';
await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:`
  import {EngineThree} from './src/engine-three';
  import {copyConfig} from './src/model';
  const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
  const engine=await EngineThree.create(document.querySelector('#host'),()=>({state:null,cfg}));
  const tick=t=>{engine.render(null,cfg,1.1,t/1000);requestAnimationFrame(tick);};requestAnimationFrame(tick);
  window.audit={engine,cfg,ready:true,view(name){engine.view(name);},presentation(mode){engine.setPresentation(mode);},snapshot(){return engine.diagnostics();}};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',define:{'import.meta.env.BASE_URL':'"/"'}});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('request',request=>{requests.push(request.url());if(request.url().includes('/api/'))throw new Error('The isolated geometry preview must never request an API.');});
await page.route('**/__workshop-audit',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#e7edf0}#host{height:100vh;width:100vw}canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div></body></html>'}));
try{
  await page.goto(base+'/__workshop-audit');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.audit?.ready,{timeout:60000});
  await page.evaluate(()=>{window.audit.presentation('closed');window.audit.view('overview');});await page.waitForTimeout(600);await page.screenshot({path:`${output}/desktop-closed-overview.png`,timeout:60000});
  await page.evaluate(()=>window.audit.view('intake'));await page.waitForTimeout(400);await page.screenshot({path:`${output}/desktop-closed-intake.png`,timeout:60000});
  await page.evaluate(()=>window.audit.presentation('cutaway'));
  for(const view of ['overview','intake','exhaust','front','top']){
    await page.evaluate(name=>window.audit.view(name),view);await page.waitForTimeout(400);
    await page.screenshot({path:`${output}/desktop-${view}.png`,timeout:60000});
  }
  const desktop=await page.evaluate(()=>({scene:window.audit.snapshot(),host:{...document.querySelector('#host').dataset}}));
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(400);await page.evaluate(()=>window.audit.view('overview'));await page.waitForTimeout(400);
  await page.screenshot({path:`${output}/mobile-overview.png`,timeout:60000});
  await page.evaluate(()=>window.audit.view('front'));await page.waitForTimeout(400);await page.screenshot({path:`${output}/mobile-front.png`,timeout:60000});
  const mobile=await page.evaluate(()=>({scene:window.audit.snapshot(),host:{...document.querySelector('#host').dataset},overflow:document.documentElement.scrollWidth>innerWidth}));
  await writeFile(`${output}/geometry-audit.json`,JSON.stringify({scope:'Isolated authored geometry, static sample angle; no native-core or sound acceptance.',desktop,mobile,errors,requests},null,2));
  console.log(JSON.stringify({errors,desktopDraws:desktop.scene.drawCalls,mobileDraws:mobile.scene.drawCalls,mobileOverflow:mobile.overflow,parts:desktop.scene.assembly.parts,proof:output}));
}finally{await browser.close();}
