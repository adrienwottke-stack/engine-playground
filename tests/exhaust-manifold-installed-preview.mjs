/** Focused integration picture of the actual EngineThree, without motor API use. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const output=process.argv[2]||'evidence/exhaust-manifold-iteration';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {EngineThree} from './src/engine-three';import {copyConfig} from './src/model';
  const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
  const engine=await EngineThree.create(document.querySelector('#host'),()=>({state:null,cfg}));
  engine.setPresentation('closed');engine.controls.target.set(0,153,130);engine.camera.position.set(230,340,950);engine.controls.update();
  window.audit={ready:true,engine};const tick=()=>{engine.render(null,cfg,1.1,0);requestAnimationFrame(tick);};tick();
`},bundle:true,write:false,format:'esm',target:'es2022',define:{'import.meta.env.BASE_URL':'"/"'}});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;requests.push(path);if(path.startsWith('/api/'))throw new Error('No native API');if(path==='/__manifold-installed')return route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#17252f}#host{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style><div id="host"></div>'});return route.continue();});
try{
  await page.goto('http://127.0.0.1:4196/__manifold-installed');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});await page.screenshot({path:`${output}/installed-closed.png`,timeout:60000});
  await page.evaluate(()=>window.audit.engine.setPresentation('cutaway'));await page.waitForTimeout(250);await page.screenshot({path:`${output}/installed-cutaway.png`,timeout:60000});
  const diagnostics=await page.evaluate(()=>window.audit.engine.diagnostics());await writeFile(`${output}/installed-audit.json`,JSON.stringify({errors,requests,diagnostics},null,2));console.log(JSON.stringify({errors,output}));if(errors.length)process.exitCode=1;
}catch(error){await writeFile(`${output}/installed-audit.json`,JSON.stringify({errors,requests,failure:String(error)},null,2));throw error;}finally{await browser.close();}
