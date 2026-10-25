/** Read-only check of the actual mounted renderer, no motor API. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const out='evidence/detail-exhaust-r3',dist='dist/detail-exhaust-r3';
const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import {EngineThree} from './src/engine-three';import {copyConfig} from './src/model';
const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
const engine=await EngineThree.create(document.querySelector('#host'),()=>({state:null,cfg}));
engine.setPresentation('closed');engine.controls.target.set(0,210,125);engine.camera.position.set(170,430,880);engine.controls.update();
window.audit={ready:true,engine};function tick(){engine.render(null,cfg,1.1,0);requestAnimationFrame(tick);}tick();
`},bundle:true,write:false,format:'esm',target:'es2022',define:{'import.meta.env.BASE_URL':'"/"'}});
const html='<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54 R3 · eingebauter Abgasanschluss</title><style>body{margin:0}#host{width:100vw;height:100vh}canvas{display:block}</style><div id="host"></div><script type="module" src="./installed.js"></script></html>';
for(const dir of [out,dist]){await writeFile(dir+'/installed.js',result.outputFiles[0].text);await writeFile(dir+'/installed.html',html);}
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],failed=[],api=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.route('**/*',route=>{if(new URL(route.request().url()).pathname.startsWith('/api/')){api.push(route.request().url());return route.abort();}return route.continue()});
try{
 await page.goto('http://127.0.0.1:4196/detail-exhaust-r3/installed.html');await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});await page.screenshot({path:out+'/installed-after.png',timeout:60000});
 await writeFile(out+'/installed-audit.json',JSON.stringify({errors,failed,api},null,2));console.log(JSON.stringify({errors,failed,api}));if(errors.length||failed.length||api.length)process.exitCode=1;
}finally{await browser.close()}
