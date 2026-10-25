/** Close-up of the bounded outlet correction. No native imports or API calls. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='dist/detail-intake-r3',evidence='evidence/detail-intake-r3';
await mkdir(out,{recursive:true});await mkdir(evidence,{recursive:true});
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><title>Drosselauslass – Anschlusskorrektur</title><style>body{margin:0;background:#202a30;color:#e8edf0;font:15px system-ui}header{padding:20px 24px}h1{font-size:23px;margin:0 0 8px}p{margin:0;color:#bfccd3}main{display:grid;grid-template-columns:1fr 1fr}h2{font-size:17px;padding:0 24px}canvas{width:100%;display:block}footer{padding:16px 24px;color:#bfccd3}</style><header><h1>Drosselauslass · Anschlusskorrektur</h1><p>Gleiche Nahansicht von schräg unten · Gehäuse und Flansch bleiben fest · Achse am Austritt jetzt +Z</p></header><main><section id="before"><h2>Vor Korrektur · schräger Anschlussring</h2></section><section id="after"><h2>Korrigiert · gerader Ansatz vor dem Bogen</h2></section></main><footer>Lokaler Geometrienachweis ohne Motorlauf. Der übrige Ansaugtrakt ist für diese Nahansicht ausgeblendet.</footer><script type="module" src="./throttle.js"></script></html>`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import * as T from 'three';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createM54Intake as before} from './tests/detail-intake-before-tangent';import {createM54Intake as after} from './src/engine-3d-intake';
window.views=[];
for(const [id,create] of [['before',before],['after',after]]){
 const scene=new T.Scene();scene.background=new T.Color(0x202a30);const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(700,550);r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.1;document.querySelector('#'+id).append(r.domElement);
 const pm=new T.PMREMGenerator(r),room=new RoomEnvironment();scene.environment=pm.fromScene(room,.04).texture;room.dispose();pm.dispose();scene.add(new T.HemisphereLight(0xdce9ef,0x52606b,1.5));const l=new T.DirectionalLight(0xfff2de,2.4);l.position.set(-100,250,50);scene.add(l);
 const m=create(0,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}));scene.add(m.closed,m.details,m.throttle);
 for(const p of m.closed.children)p.visible=['Unterer Sammleranschluss','Breiter Kunststoffsammler','Resonanzkammer-Unterseite'].includes(p.name);
 for(const p of m.details.children)p.visible=p.name.includes('Drossel')||p.name==='EDK Stellmotor'||!p.name&&p.geometry?.type==='TorusGeometry'&&Math.abs(p.position.x+200)<.1&&Math.abs(p.position.y-133)<.1;
 const camera=new T.OrthographicCamera(-115,115,90.36,-90.36,1,3000);camera.position.set(-20,5,30);camera.lookAt(-200,145,-190);r.render(scene,camera);window.views.push({m,scene,r,camera});
}window.ready=true;
`},bundle:true,write:false,format:'esm',target:'es2022'});
await writeFile(out+'/throttle.html',html);await writeFile(out+'/throttle.js',bundle.outputFiles[0].text);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1400,height:760}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',route=>{const u=route.request().url();requests.push(u);if(new URL(u).pathname.startsWith('/api/'))throw Error('Unexpected API');return route.continue();});
try{
 await page.goto('http://127.0.0.1:4196/detail-intake-r3/throttle.html');await page.waitForFunction(()=>window.ready);await page.screenshot({path:evidence+'/throttle-tangent.png'});
 const angles=await page.evaluate(()=>window.views.map(({m})=>{const p=m.closed.getObjectByName('Unterer Sammleranschluss').geometry.parameters.path;const v=p.getTangentAt(0);return Math.acos(Math.max(-1,Math.min(1,v.z)))*180/Math.PI;}));
 await writeFile(evidence+'/throttle-tangent-audit.json',JSON.stringify({errors,requests,anglesDegrees:angles},null,2));if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({errors,anglesDegrees:angles}));
}finally{await browser.close();}
