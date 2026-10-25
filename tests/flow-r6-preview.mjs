/** Isolated comparison with optional illustrative playback. No API/audio/lease. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
const output = 'evidence/flow-r6', delivery = 'dist/flow-r6';
await mkdir(output, {recursive:true}); await mkdir(delivery, {recursive:true});
const entry = String.raw`
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EngineThree} from './src/engine-three';
import {createEngineFlowView,FLOW_VIEW_BACKGROUND} from './src/engine-flow-view';
import {copyConfig,FIRING_ORDER,TAU,mod} from './src/model';
import {combustionAppearance} from './src/engine-3d-model';
const cfg=copyConfig(),host=document.querySelector('#host');
// Deliberately synthetic cycle-shaped input only for this illustrative fixture.
const state={rpm:900,ignition:true,source:'illustrative-static-fixture',cycles:[],valveCurves:{samples:[]}};
for(let id=1;id<=6;id++){
 const offset=FIRING_ORDER.indexOf(id)*TAU*2/6,rows=[],curves=[];
 for(let i=0;i<144;i++){
  const p=mod(i/144*TAU*2-offset,TAU*2),intake=p>TAU&&p<TAU*1.5?Math.sin(p-TAU):0,exhaust=p>Math.PI&&p<TAU?Math.sin(p-Math.PI):0,burn=p<.7;
  const compression=Math.max(0,(p-TAU*1.5)/Math.PI),work=p<Math.PI&&!burn;
  const temperature=burn?1750:work?1450-p*210:exhaust>0?980-exhaust*170:intake>0?320:320+compression*450;
  const pressure=burn?2100:work?180+900*Math.exp(-p*1.2):exhaust>0?130:intake>0?85:100+Math.pow(compression,2.6)*850;
  rows.push([pressure,temperature,intake*9.7,exhaust*9.2,intake*.42,exhaust*.35,burn?1:0]);curves.push([intake*9.7,exhaust*9.2]);
 }state.cycles.push({cylinder:id,samples:rows});state.valveCurves.samples.push(curves);
}
const flow=createEngineFlowView(cfg);flow.setVisible(true);
let scene,renderer,camera,controls,engine=null;
if(VERSION==='before'){
 engine=await EngineThree.create(host,()=>({state,cfg}));engine.setPresentation('flow');
 scene=engine.scene;renderer=engine.renderer;camera=engine.camera;controls=engine.controls;controls.enableDamping=false;
}else{
 scene=new T.Scene();renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});host.append(renderer.domElement);
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.outputColorSpace=T.SRGBColorSpace;
 camera=new T.PerspectiveCamera(38,1,2,10000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
 scene.add(flow.root);scene.background=new T.Color(FLOW_VIEW_BACKGROUND);
 // Same R5 light rig, no environment/material-profile changes.
 scene.add(new T.HemisphereLight(0xd5e1ed,0x26313a,1.1));
 for(const [x,y,z,color,intensity]of[[-300,600,450,0xfff1df,2.2],[350,300,-400,0xa3c9ef,1.3],[150,120,-300,0xe4efff,2]]){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);}
}
renderer.setPixelRatio(1);const errors=[];renderer.debug.onShaderError=(gl,p,vs,fs)=>errors.push([gl.getProgramInfoLog(p),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs)]);
let degrees=385,totalDegrees=385,selected=new URLSearchParams(location.search).get('view')||'overall',clock=2,playing=false,speed=90,animationId=0,lastStamp=0,frames=0;
// Fit the same AFTER geometry envelope for both versions. No camera changes
// between before/after; portrait gets its own shared viewing direction.
flow.update(state,cfg,degrees/360*TAU,clock,degrees/360*TAU+TAU*20);flow.root.updateMatrixWorld(true);
const points=[];flow.root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/120)))points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});
function frame(view=selected){
 selected=view;document.querySelector('#stages').hidden=view!=='chamber';
 host.style.minHeight=innerHeight<600?'260px':'300px';host.style.height=Math.max(innerHeight<600?260:300,innerHeight-document.querySelector('header').offsetHeight-document.querySelector('footer').offsetHeight)+'px';
 const width=host.clientWidth,height=host.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
 const narrow=width<600,direction=new T.Vector3(...(view==='chamber'?[-.32,.3,1]:view==='spray'?[.2,.7,-1]:view==='drive'?(narrow?[-.8,.43,-1]:[.2,.35,-1]):narrow?[-.9,.6,-.6]:[.22,.48,-1])).normalize();
 const target=view==='chamber'?new T.Vector3(-250,185,25):view==='spray'?new T.Vector3(-207,225,-62):view==='drive'?new T.Vector3(-30,115,-15):new T.Vector3(180,100,-5);controls.target.copy(target);
 const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
 const envelope=view==='chamber'?[...[-305,-115].flatMap(x=>[105,280].flatMap(y=>[-75,205].map(z=>new T.Vector3(x,y,z))))]:points;
 for(const point of envelope){if(view==='spray'&&(point.x< -305||point.x> -105||point.y<185||point.z< -130||point.z>30))continue;if(view==='drive'&&(point.x< -330||point.x>320||point.z< -210||point.z>210))continue;const c=point.clone().sub(target),depth=c.dot(direction);distance=Math.max(distance,depth+Math.abs(c.dot(right))/(tan*camera.aspect),depth+Math.abs(c.dot(up))/tan);}
 if(view==='chamber')distance=Math.max(340,170/(2*tan*camera.aspect));
 camera.position.copy(target).addScaledVector(direction,distance*(view==='spray'?1.12:1.06));controls.maxDistance=15000;controls.minDistance=10;controls.update();draw();
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
}
function draw(delta=0){clock+=delta;const angle=degrees/360*TAU,driveAngle=TAU*20+totalDegrees/360*TAU;flow.update(state,cfg,angle,clock,driveAngle);
 if(engine){engine.lastRender=-Infinity;engine.studioDirty=true;engine.render(state,cfg,angle,clock,driveAngle);renderer.setPixelRatio(1);renderer.setSize(host.clientWidth,host.clientHeight,false);}
 renderer.render(scene,camera);frames++;document.querySelector('#pose').value=String(degrees);document.querySelector('#angle').textContent=Math.round(degrees)+'°';const stage=state.rpm?combustionAppearance(state,angle,1).stage:'idle';document.querySelector('#phase').textContent='Zylinder 1 · '+({intake:'Ansaugen',compression:'Verdichten',kernel:'Brennen',front:'Brennen',expansion:'Arbeit',exhaust:'Ausstoßen',idle:'Stillstand'}[stage]);
 const qa=document.querySelector('#qa');if(new URLSearchParams(location.search).has('qa')){qa.hidden=false;const chamber=flow.root.children.find(o=>o.name==='Integriertes Gasvolumen 1');qa.textContent=JSON.stringify({chamber:flow.diagnostics().chambers?.[0],colour:chamber?.geometry.getAttribute("color")?.array.slice(0,4),draws:renderer.info.render.calls},null,2);}}
function pause(){playing=false;cancelAnimationFrame(animationId);document.querySelector('#play').textContent='Demo abspielen';document.querySelector('#play').setAttribute('aria-pressed','false');}
function tick(stamp){if(!playing)return;if(stamp-lastStamp>=1000/30){const delta=Math.min(.08,(stamp-lastStamp)/1000);lastStamp=stamp;totalDegrees+=delta*speed;degrees=mod(totalDegrees,720);draw(delta);}animationId=requestAnimationFrame(tick);}
function play(){state.rpm=900;document.querySelector('#off').textContent='Stillstand zeigen';playing=true;lastStamp=performance.now();document.querySelector('#play').textContent='Pause';document.querySelector('#play').setAttribute('aria-pressed','true');animationId=requestAnimationFrame(tick);}
document.querySelector('#play').onclick=()=>playing?pause():play();document.querySelector('#speed').onchange=e=>{speed=+e.target.value;};
document.querySelector('#pose').oninput=e=>{pause();degrees=+e.target.value;totalDegrees=Math.floor(totalDegrees/720)*720+degrees;draw();};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>frame(b.dataset.view));
document.querySelector('#off').onclick=e=>{pause();state.rpm=state.rpm?0:900;e.target.textContent=state.rpm?'Stillstand zeigen':'Demo-Pose zeigen';draw();};
document.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>{pause();state.rpm=900;degrees=+b.dataset.phase;totalDegrees=Math.floor(totalDegrees/720)*720+degrees;document.querySelector('#off').textContent='Stillstand zeigen';draw();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
controls.addEventListener('change',()=>renderer.render(scene,camera));addEventListener('resize',()=>frame());
await renderer.compileAsync(scene,camera);frame();
window.audit={ready:true,frame,draw,flow,scene,camera,renderer,state,snapshot:()=>({version:VERSION,view:selected,degrees,totalDegrees,playing,speed,frames,camera:camera.position.toArray(),target:controls.target.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,geometries:renderer.info.memory.geometries,overflow:document.documentElement.scrollWidth>innerWidth,shaderErrors:errors,flow:flow.diagnostics()})};
if(new URLSearchParams(location.search).has('play'))play();
`;
const manifests={};
for(const version of ['before','after','chamber-before']){
 const frozen=new Map();
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',define:{VERSION:JSON.stringify(version),'import.meta.env.BASE_URL':JSON.stringify('/')},plugins:[{name:'frozen-r5-engine',setup(b){
  b.onLoad({filter:/[\\/]src[\\/].*\.ts$/},async args=>{
   let source=await readFile(args.path,'utf8');
   if(version==='chamber-before'&&['engine-flow-view.ts','engine-render-effects.ts','engine-flow-pulses.ts','engine-flow-mechanics.ts'].includes(basename(args.path)))source=await readFile('evidence/flow-r6/chamber-before-src/'+basename(args.path),'utf8');
   if(!['engine-flow-view.ts','engine-render-effects.ts'].includes(basename(args.path))){try{source=await readFile('evidence/detail-r6-integration/before-src/'+basename(args.path),'utf8');}catch{}}
   frozen.set(basename(args.path),createHash('sha256').update(source).digest('hex'));return{contents:source,loader:'ts'};
  });}}]});
 await writeFile(`${delivery}/${version}.js`,result.outputFiles[0].text);
 manifests[version]={bundle:createHash('sha256').update(result.outputFiles[0].text).digest('hex'),sources:Object.fromEntries(frozen)};
 await writeFile(`${delivery}/${version}.html`,`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motor · Fluss R6</title><style>*{box-sizing:border-box}body{margin:0;background:#080e15;color:#dee7eb;font:14px system-ui}header{padding:18px 22px 8px}h1{font-size:23px;margin:0 0 7px;font-weight:550}p{font-size:12px;line-height:1.45;color:#9dabb6;margin:5px 0}nav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}a,button{min-height:44px;padding:10px 12px;font:inherit;color:#d5e4e7;background:#121e28;border:1px solid #344750;border-radius:6px;text-decoration:none;cursor:pointer}button[aria-pressed=true]{background:#224b51;border-color:#66a3a6}#host{height:calc(100dvh - 255px);min-height:370px;width:100%}canvas{display:block;touch-action:none;width:100%;height:100%}.teal{color:#69d1cb}.amber{color:#deb57b}.blue{color:#a0add0}footer{padding:0 22px 15px}label{display:flex;align-items:center;gap:10px;font-size:12px}input{min-height:44px;max-width:240px;width:40vw;accent-color:#69d1cb}select{min-height:44px;max-width:180px;background:#121e28;color:#d5e4e7;border:1px solid #344750;border-radius:6px;padding:6px;font:inherit}#stages{margin:6px 0}#stages button{font-size:12px;padding:8px;margin-right:4px}#phase{display:block;font-size:12px;color:#aec4cf;margin:6px 0}.playback{display:flex;align-items:center;flex-wrap:wrap;gap:8px}output{min-width:40px}@media(max-width:600px){header{padding:12px 12px 4px}h1{font-size:20px}nav{gap:5px}a,button{font-size:12px;padding:9px 10px}#host{height:calc(100dvh - 375px);min-height:300px}footer{padding:0 12px 12px}}</style><header><h1>Gaswechsel · ${version==='before'?'bisherige Flussansicht':'erste Flussrunde'}</h1><p>Illustrative Bewegungsdemo · synthetische Posen · keine Messung, kein Ton.</p><nav><a href="./before.html">Vorher</a><a href="./after.html">Nachher</a><button id="play" aria-pressed="false">Demo abspielen</button><button data-view="overall">Gesamt</button><button data-view="drive">Motor & Pulse</button><button data-view="chamber">Brennraum</button><button data-view="spray">Einlass & Spray</button><button id="off">Stillstand zeigen</button></nav></header><main id="host" aria-label="Drehbarer M54 Reihensechser"></main><footer><p><span class="teal">Luft →</span> Einlass · <span class="amber">Benzinspray</span> vor den Ventilen · <span class="blue">Abgas →</span> zwei Auslässe</p><div id="stages" hidden><button data-phase="440">Ansaugen</button><button data-phase="660">Verdichten</button><button data-phase="35">Brennen</button><button data-phase="230">Ausstoßen</button><output id="phase"></output></div><div class="playback"><select id="speed" aria-label="Demogeschwindigkeit"><option value="90">Lesbare Zeitlupe</option><option value="360">Schneller</option></select><label>Pose <input id="pose" type="range" min="0" max="720" value="385" step="5"><output id="angle">385°</output></label></div><p>Spray zeitlich an Ansaugphase gekoppelt. Native Einspritzzeitpunkte fehlen; Form und Pulsweiten sind illustrativ.</p><pre id="qa" hidden></pre></footer><script type="module" src="./${version}.js"></script></html>`);
}
await writeFile(`${output}/source-manifest.json`,JSON.stringify(manifests,null,2));
if(process.argv.includes('--build-only')){console.log('Flow fixture rebuilt; existing server untouched.');process.exit(0);}
console.log('Own flow fixture built. Capturing desktop/mobile on existing port 4196.');
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),errors=[],requests=[],captures=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
 await page.route('**/*',r=>{requests.push(r.request().url());if(/\/api\/|\/lease/.test(r.request().url()))return r.abort();return r.continue();});
 for(const version of ['before','after']){
  await page.goto(`http://127.0.0.1:4196/flow-r6/${version}.html`);await Promise.race([page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:180000}),page.waitForEvent('pageerror').then(e=>{throw new Error(e.message);})]);
  for(const size of ['desktop','mobile']){
   await page.setViewportSize(size==='desktop'?{width:1280,height:800}:{width:375,height:812});
   for(const view of ['overall','spray']){await page.locator('[data-view='+view+']').click();await page.screenshot({path:`${output}/${size}-${version}-${view}.png`,timeout:60000});captures.push({size,...await page.evaluate(()=>window.audit.snapshot())});}
  }
  if(version==='after'){
   const before=await page.evaluate(()=>window.audit.snapshot());
   await page.locator('#off').click();assert.ok((await page.evaluate(()=>window.audit.snapshot())).flow.routes.every(r=>r.rate===0));assert.ok((await page.evaluate(()=>window.audit.snapshot())).flow.sprayActivity.every(x=>x===0));
   await page.screenshot({path:`${output}/mobile-after-stopped.png`});await page.locator('#off').click();
   // Allocation stability uses the fixture's existing cfg through draw(), not a native loop.
   const stability=await page.evaluate(()=>{const a=window.audit;const before=a.snapshot();for(let i=0;i<60;i++)a.draw();const after=a.snapshot();return{before:{geometries:before.geometries,programs:before.programs},after:{geometries:after.geometries,programs:after.programs}};});
   assert.deepEqual(stability.before,stability.after);await writeFile(`${output}/stability.json`,JSON.stringify(stability,null,2));
   assert.equal(before.flow.cylinders,6);assert.equal(before.flow.valves,24);
  }
  await page.setViewportSize({width:1280,height:800});
 }
 for(const before of captures.filter(c=>c.version==='before')){const after=captures.find(c=>c.version==='after'&&c.size===before.size&&c.view===before.view);assert.ok(after.camera.every((v,i)=>Math.abs(v-before.camera[i])<1e-8),'same camera within numerical precision');assert.deepEqual(after.target,before.target);}
 assert.ok(captures.every(c=>!c.overflow&&c.shaderErrors.length===0));assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/\/api\/|\/lease/.test(u)).length,0);
 await writeFile(`${output}/browser-audit.json`,JSON.stringify({passed:true,errors,requests,captures},null,2));console.log(JSON.stringify({passed:true,captures:captures.map(c=>({version:c.version,size:c.size,view:c.view,draws:c.drawCalls,triangles:c.triangles})),errors}));
}catch(error){await writeFile(`${output}/browser-audit.json`,JSON.stringify({passed:false,failure:String(error),errors,requests,captures},null,2));throw error;}finally{await browser.close();}
