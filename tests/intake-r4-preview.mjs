/** Static, native-free comparison. Writes only this role's exclusive directory;
 * equivalent to emptyOutDir:false: no directory clearing or shared Vite build. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='dist/intake-r4',evidence='evidence/intake-r4';
await mkdir(out,{recursive:true});await mkdir(evidence,{recursive:true});
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54 Ansaugung – Hauptform R4</title><style>*{box-sizing:border-box}body{margin:0;background:#202a30;color:#e8edf0;font:15px system-ui}header{padding:20px 24px 8px}h1{font-size:23px;margin:0 0 7px}p{margin:0;color:#b7c6cd}nav{padding:12px 24px;display:flex;gap:10px;flex-wrap:wrap}button,select{font:inherit;min-height:44px;background:#35454f;color:white;border:1px solid #60737f;border-radius:5px;padding:0 14px}main{display:grid;grid-template-columns:1fr 1fr}section{min-width:0}h2{margin:8px 24px;font-size:18px}canvas{display:block;width:100%;touch-action:none}footer{padding:16px 24px;color:#bdccd4} @media(max-width:650px){main{grid-template-columns:1fr}}</style><header><h1>M54B30 · Ansaugung vorher / nachher</h1><p>Gleiche Kamera, Materialien und Beleuchtung. Formstudie anhand Originalteilfoto; eigene Darstellungsmaße.</p></header><nav><button id="whole">Gesamt</button><button id="runners">Läufer / Kopf</button><button id="connections">LMM / Drossel</button><button id="head">Kopfseite</button><button id="cut">Schnitt umschalten</button><select id="variant" aria-label="Ansaugvariante"><option value="standard">Serie</option><option value="sport">Sport</option><option value="race">Race</option></select></nav><main><section id="before"><h2>Vorher · bestätigter R3-Zwischenstand</h2></section><section id="after"><h2>Nachher · Hauptform R4</h2></section></main><footer>Ziehen zum Drehen · Mausrad zum Zoomen · Statische Geometrie ohne Motorkern oder Einbauaktion</footer><script type="module" src="./comparison.js"></script></html>`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import * as T from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createM54Intake as before} from './tests/intake-r4-before';import {createM54Intake as after} from './src/engine-3d-intake';
const views=[];let isCut=false,variant='standard',syncing=false;
const mat=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
for(const [id,create] of [['before',before],['after',after]]){
 const scene=new T.Scene();scene.background=new T.Color(0x202a30);const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setPixelRatio(1);r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.1;
 document.querySelector('#'+id).append(r.domElement);const pm=new T.PMREMGenerator(r),room=new RoomEnvironment();scene.environment=pm.fromScene(room,.04).texture;room.dispose();pm.dispose();scene.add(new T.HemisphereLight(0xdce9ef,0x52606b,1.5));const light=new T.DirectionalLight(0xfff2de,2.4);light.position.set(0,650,-700);scene.add(light);
 const camera=new T.OrthographicCamera(-430,430,350,-350,1,4000),controls=new OrbitControls(camera,r.domElement);controls.enableDamping=false;
 const view={scene,r,camera,controls,create,model:null};views.push(view);
 controls.addEventListener('change',()=>{if(syncing)return;syncing=true;for(const v of views){if(v!==view){v.camera.position.copy(camera.position);v.camera.quaternion.copy(camera.quaternion);v.camera.zoom=camera.zoom;v.camera.updateProjectionMatrix();v.controls.target.copy(controls.target);}v.r.render(v.scene,v.camera);}syncing=false;});
}
function rebuild(){for(const v of views){if(v.model){const geometries=new Set(),materials=new Set();for(const group of [v.model.closed,v.model.cut,v.model.details,v.model.throttle]){v.scene.remove(group);group.traverse(p=>{if(p.geometry)geometries.add(p.geometry);if(p.material)materials.add(p.material);});}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}v.model=v.create(0,mat,{intake:variant});v.scene.add(v.model.closed,v.model.cut,v.model.details,v.model.throttle);v.model.closed.visible=!isCut;v.model.cut.visible=isCut;}}
function view(name){const settings={whole:[[-780,650,-1050],[-115,175,-200],450],runners:[[-440,640,-610],[0,225,-145],335],connections:[[-760,420,-810],[-330,150,-250],245],head:[[-400,480,650],[0,220,-100],350]};const [position,target,span]=settings[name];syncing=true;for(const v of views){const width=v.r.domElement.parentElement.clientWidth,height=560;v.r.setSize(width,height);v.camera.left=-span;v.camera.right=span;v.camera.top=span*height/width;v.camera.bottom=-span*height/width;v.camera.zoom=1;v.camera.position.fromArray(position);v.controls.target.fromArray(target);v.camera.updateProjectionMatrix();v.controls.update();v.r.render(v.scene,v.camera);}syncing=false;}
for(const id of ['whole','runners','connections','head'])document.querySelector('#'+id).onclick=()=>view(id);
document.querySelector('#cut').onclick=()=>{isCut=!isCut;for(const v of views){v.model.closed.visible=!isCut;v.model.cut.visible=isCut;v.r.render(v.scene,v.camera);}};
document.querySelector('#variant').onchange=e=>{variant=e.target.value;rebuild();for(const v of views)v.r.render(v.scene,v.camera);};
rebuild();view('whole');window.detailIntake={ready:true,view,views};
`},bundle:true,write:false,format:'esm',target:'es2022'});
await writeFile(`${out}/index.html`,html);await writeFile(`${out}/comparison.js`,bundle.outputFiles[0].text);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1440,height:830}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',route=>{const url=route.request().url();requests.push(url);if(new URL(url).pathname.startsWith('/api/'))throw Error('Unexpected API request');return route.continue();});
try{
 const url='http://127.0.0.1:4196/intake-r4/index.html';await page.goto(url);await page.waitForFunction(()=>window.detailIntake?.ready);
 for(const name of ['whole','runners','connections','head']){await page.evaluate(n=>window.detailIntake.view(n),name);await page.screenshot({path:evidence+'/'+name+'.png'});}
 await page.click('#cut');await page.screenshot({path:evidence+'/head-cut.png'});await page.click('#cut');
 for(const variant of ['sport','race','standard'])await page.selectOption('#variant',variant);
 await page.evaluate(()=>window.detailIntake.view('whole'));
 await page.setViewportSize({width:375,height:844});await page.evaluate(()=>window.detailIntake.view('whole'));await page.screenshot({path:evidence+'/mobile.png',fullPage:true});
 const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)}));
 await writeFile(evidence+'/audit.json',JSON.stringify({url,errors,requests,mobile,nativeApiRequests:requests.filter(u=>new URL(u).pathname.startsWith('/api/')).length},null,2));
 if(errors.length||mobile.scroll>mobile.width)throw Error(JSON.stringify({errors,mobile}));console.log(JSON.stringify({url,errors,evidence,mobile}));
}finally{await browser.close();}

