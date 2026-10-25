/** Isolated visual review. No native connection, shared dist build or server restart. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const phase=process.argv[2]||'after';
const served=process.argv[3]==='served';
const output='evidence/exhaust-tail-iteration';
await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:`
  import {EngineThree} from './src/engine-three';
  import {copyConfig} from './src/model';
  const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
  const engine=await EngineThree.create(document.querySelector('#host'),()=>({state:null,cfg}));
  engine.setPresentation('closed');
  function frame(){
    const mobile=innerWidth<600;
    engine.controls.target.set(805,-61,227);
    engine.camera.position.set(mobile?1390:1125,mobile?165:85,mobile?470:430);
    engine.camera.updateProjectionMatrix();engine.controls.update();
    engine.render(null,cfg,1.1,0);
  }
  window.audit={engine,cfg,ready:true,frame};frame();
  const tick=()=>{engine.render(null,cfg,1.1,0);requestAnimationFrame(tick);};requestAnimationFrame(tick);
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',define:{'import.meta.env.BASE_URL':'"/"'}});
const document=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abgaswerkstatt · Endrohre</title><style>*{box-sizing:border-box}body{margin:0;background:#e7edf0;color:#dfe8ed;font-family:system-ui,sans-serif;text-shadow:0 1px 5px #101d27}header{position:absolute;z-index:2;top:24px;left:28px;right:20px;pointer-events:none}small{font-size:12px;letter-spacing:.15em}h1{font-size:25px;margin:7px 0}p{font-size:13px;max-width:390px;margin:0;line-height:1.5}#host{width:100vw;height:100vh}canvas{width:100%;height:100%;display:block}footer{position:absolute;bottom:20px;left:28px;right:20px;font-size:12px;pointer-events:none}@media(max-width:600px){header{left:18px;top:18px}h1{font-size:22px}p{font-size:12px}footer{left:18px}}</style><header><small>M54B30 · ABGASWERKSTATT</small><h1>${phase==='before'?'Bisherige Endrohre':'Doppelendrohre · erster Entwurf'}</h1><p>${phase==='before'?'Ausgangsstand mit aufgesetzten Ringen.':'Hohle Edelstahlblenden, feine gerundete Kante und dunkle Innenwand.'}</p></header><div id="host"></div><footer>Lokale Geometrievorschau · Motor aus · kein Test des Motorlaufs</footer><script type="module">${bundle.outputFiles[0].text}</script></html>`;
await writeFile(`${output}/${phase}-preview.js`,bundle.outputFiles[0].text);
await writeFile(`${output}/${phase}-preview.html`,document.replace(/<script type="module">[\s\S]*<\/script>/,'<script type="module" src="./'+phase+'-preview.js"></script>'));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.route('**/*',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname);
  if(!served&&url.pathname==='/__exhaust-tail-review')return route.fulfill({contentType:'text/html',body:document});
  if(url.pathname.startsWith('/api/'))throw new Error('Native API forbidden in isolated preview');
  return route.continue();
});
try{
  await page.goto('http://127.0.0.1:4196/'+(served?'fachchat-motor-3d/auspuff-v1.html':'__exhaust-tail-review'));
  await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});
  await page.evaluate(()=>window.audit.frame());
  await page.screenshot({path:`${output}/${phase}-desktop.png`,timeout:60000});
  await page.setViewportSize({width:375,height:812});
  await page.waitForTimeout(300);await page.evaluate(()=>window.audit.frame());
  await page.screenshot({path:`${output}/${phase}-mobile.png`,timeout:60000});
  const audit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,scene:window.audit.engine.diagnostics()}));
  await writeFile(`${output}/${phase}-audit.json`,JSON.stringify({errors,requests,...audit},null,2));
  console.log(JSON.stringify({phase,errors,overflow:audit.overflow,drawCalls:audit.scene.drawCalls,output}));
  if(errors.length||audit.overflow)process.exitCode=1;
}finally{await browser.close();}

