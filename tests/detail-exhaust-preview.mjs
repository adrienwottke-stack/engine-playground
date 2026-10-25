/** Native-free isolated R3 geometry comparison. Writes only owned subfolders. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out='evidence/detail-exhaust-r3',dist='dist/detail-exhaust-r3';
await mkdir(out,{recursive:true});await mkdir(dist,{recursive:true});
const source=`
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createM54ExhaustManifolds as before} from './evidence/detail-exhaust-r3/before-manifold.ts';
import {createM54ExhaustManifolds as after} from './src/engine-3d-exhaust-manifold.ts';
const scene=new T.Scene();scene.background=new T.Color(0x1b252c);
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.querySelector('#host').append(renderer.domElement);
const camera=new T.PerspectiveCamera(36,1,1,4000),controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=170;controls.maxDistance=3200;
const neutral=new T.MeshStandardMaterial({color:0x92979a,metalness:.15,roughness:.7});
const versions=[before,after].map(create=>{const a=create(0,()=>neutral.clone()),g=new T.Group();
  for(const child of [...a.closed.children,...a.details.children])if(/Zusammenhängender|Anschlusskragen|Dreifachflansch|Schraubensitz|Sechskantmutter|Stehbolzen/.test(child.name)){child.material=neutral;g.add(child);}
  scene.add(g);return g;});
scene.add(new T.HemisphereLight(0xe0ebf0,0x5a5047,1.3));
for(const [p,power] of [[[200,650,650],2.2],[[-550,150,400],1.3],[[150,-150,-300],1.2]]){const l=new T.DirectionalLight(0xffffff,power);l.position.fromArray(p);scene.add(l);}
let version=1,view='front';
function select(n){version=n;versions.forEach((g,i)=>g.visible=i===n);document.querySelectorAll('[data-version]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.version===n)));}
function frame(name=view){view=name;const d=new T.Vector3(...({front:[.18,.6,1],under:[.32,-.62,1],head:[.15,.12,-1]}[name])).normalize();controls.target.set(0,218,132);const distance=innerWidth<600?2400:690;camera.position.copy(controls.target).addScaledVector(d,distance);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));}
document.querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>select(+b.dataset.version));document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>frame(b.dataset.view));
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();frame();}addEventListener('resize',resize);select(1);resize();
window.audit={ready:true,select,frame,renderer,camera,controls,versions,get version(){return version},get view(){return view}};
function tick(){renderer.render(scene,camera);requestAnimationFrame(tick);}tick();`;
const bundle=await build({stdin:{resolveDir:root,contents:source,loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',plugins:[{name:'baseline-imports',setup(b){b.onLoad({filter:/before-manifold\.ts$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts',resolveDir:path.join(root,'src')}));}}]});
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54 · Kopfanschluss Runde 3</title><style>*{box-sizing:border-box}body{margin:0;background:#1b252c;color:#edf2f4;font:14px system-ui}#host{height:100vh}canvas{display:block;touch-action:none}header{position:absolute;top:24px;left:26px;right:18px;pointer-events:none}h1{font-size:25px;margin:5px 0}p{font-size:13px;color:#bbc9d0;margin:6px 0}nav{position:absolute;top:136px;left:26px;right:18px;display:flex;gap:7px;flex-wrap:wrap}button{min-height:44px;border:1px solid #657681;border-radius:6px;background:#253640;color:#e6edf1;padding:8px 14px;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#e6d3ad;color:#263039}footer{position:absolute;bottom:18px;left:26px;right:18px;color:#bdc9ce;font-size:12px;pointer-events:none}@media(max-width:600px){header{left:16px;top:16px}h1{font-size:21px}p{font-size:12px}nav{left:16px;top:120px;gap:5px}button{font-size:12px;padding:7px 10px}footer{left:16px;font-size:11px}}</style><header><p>M54B30 · ABGASANSCHLUSS · RUNDE 3</p><h1>Montierte Dreierkrümmer</h1><p>Gleiche Kamera, gleiches Licht, neutrales Material.<br>Isolierter Kopfanschluss · Katlage bleibt erhalten.</p></header><nav><button data-version="0">Vorher</button><button data-version="1">Nachher</button><button data-view="front">Abgasseite</button><button data-view="under">Schräg von unten</button><button data-view="head">Kopfseite</button></nav><div id="host"></div><footer>Ziehen zum Drehen · Scrollen zum Zoomen<br>Fotobasierte Darstellung · keine vermessene OEM-Geometrie · kein Motorlauf</footer><script type="module" src="./comparison.js"></script></html>`;
for(const dir of [out,dist]){await writeFile(dir+'/comparison.js',bundle.outputFiles[0].text);await writeFile(dir+'/index.html',html);}
if(process.argv.includes('--build-only'))process.exit(0);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],failed=[],api=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>failed.push(r.url()));
await page.route('**/*',route=>{if(new URL(route.request().url()).pathname.startsWith('/api/')){api.push(route.request().url());return route.abort();}return route.continue()});
const views=[];
try{
 await page.goto('http://127.0.0.1:4196/detail-exhaust-r3/index.html');await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});
 for(const view of ['front','under','head']){
  await page.getByRole('button',{name:{front:'Abgasseite',under:'Schräg von unten',head:'Kopfseite'}[view],exact:true}).click();
  for(const label of ['Vorher','Nachher']){await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(180);await page.screenshot({path:out+'/'+(label==='Vorher'?'before':'after')+'-'+view+'.png',timeout:60000});views.push(await page.evaluate(()=>({version:window.audit.version,view:window.audit.view,camera:window.audit.camera.position.toArray(),target:window.audit.controls.target.toArray(),triangles:window.audit.renderer.info.render.triangles,drawCalls:window.audit.renderer.info.render.calls})));}
 }
 await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Abgasseite',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:out+'/mobile-after.png',timeout:60000});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);const report={errors,failed,api,overflow,views};await writeFile(out+'/browser-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(errors.length||failed.length||api.length||overflow)process.exitCode=1;
}finally{await browser.close();}

