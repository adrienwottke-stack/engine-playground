/** Own output only. Browser requests are fulfilled in memory: no server,
 * bridge, controller lease, native telemetry, or normal application build. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const output='dist/timing-r4',evidence='evidence/timing-r4';
await mkdir(output,{recursive:true});await mkdir(evidence,{recursive:true});
const before=await readFile(`${evidence}/before/engine-3d-assembly.ts`,'utf8');
const entry=`
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createM54TimingDrive} from './src/engine-3d-timing';
import {buildWorkshopAssembly,animateWorkshopAssembly} from './src/engine-3d-assembly';
const ho=15.62,camY=279+ho,material=(color,metalness=.3,roughness=.55)=>new T.MeshStandardMaterial({color,metalness,roughness});
const extras=new T.Group(),housing=new T.Group(),head=new T.Group();extras.add(head);
const baseline=buildWorkshopAssembly({extras,housing,head,headOffset:ho,deck:205+ho,boreScale:1,mat:material}),oldRoot=new T.Group();
for(const child of [...extras.children])if(['Kurbelwellenkettenrad','Primaeres Nockenwellenrad','Sekundaeres Nockenwellenrad','M54B30 Doppel VANOS Stellkolben im Schnitt','Laufende Rollenkettenglieder','Steuerkettenschienen'].includes(child.name))oldRoot.add(child);
const next=createM54TimingDrive(ho,material);
for(const group of next.staticGroups){
 const materials=new Map();for(const m of group.children)if(m.isMesh&&!Array.isArray(m.material)){const list=materials.get(m.material)||[];list.push(m);materials.set(m.material,list);}
 for(const [mat,list] of materials){if(list.length<2)continue;const geos=list.map(m=>{m.updateMatrix();return (m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrix);});const combined=mergeGeometries(geos);geos.forEach(g=>g.dispose());if(!combined)continue;for(const m of list){group.remove(m);m.geometry.dispose();}group.add(new T.Mesh(combined,mat));}
}
const adapter={...next,fan:new T.Group(),pulley:new T.Group(),throttle:new T.Group()};
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;document.querySelector('#host').append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0x20282e);scene.add(oldRoot,next.root);
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight(0xf0f5f9,0x464b4e,1.2));for(const [x,y,z,power] of [[-600,650,200,2.3],[-200,50,-300,1.3]]){const l=new T.DirectionalLight(0xfff2df,power);l.position.set(x,y,z);scene.add(l);}
// Neutral shaft stubs provide attachment context, without inventing a motor
// housing or using one of the parallel cover changes as a comparison variable.
const context=new T.Group();context.name='Neutrale Wellenanschlussdummies';scene.add(context);
for(const [y,z,r] of [[0,0,5],[camY,-23,5],[camY,23,5]]){const g=new T.CylinderGeometry(r,r,49,20);g.rotateZ(Math.PI/2);const m=new T.Mesh(g,material(0x667177,.7,.46));m.position.set(-299,y,z);context.add(m);}
const camera=new T.PerspectiveCamera(34,1,1,3000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
let version='after',view='full',angle=0;
function render(){renderer.render(scene,camera);}
function frame(){
 const r=document.querySelector('#host').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
 const target=view==='full'?new T.Vector3(-335,145,5):new T.Vector3(-337,camY-9,0);
 const direction=new T.Vector3(-1,.12,.34).normalize();controls.target.copy(target);
 const height=view==='full'?375:125,width=view==='full'?145:140,distance=height/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*Math.max(1,width/(height*camera.aspect));camera.position.copy(target).addScaledVector(direction,distance);controls.update();render();
}
function choose(v=version,w=view){version=v;view=w;oldRoot.visible=version==='before';next.root.visible=version==='after';document.querySelectorAll('[data-version]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.version===version)));document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));frame();}
function pose(a){angle=a;animateWorkshopAssembly(baseline,a,0,0);animateWorkshopAssembly(adapter,a,0,0);document.querySelector('#phase').textContent=Math.round(a*180/Math.PI)+'°';render();}
for(const b of document.querySelectorAll('[data-version]'))b.onclick=()=>choose(b.dataset.version,view);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>choose(version,b.dataset.view);
document.querySelector('#step').onclick=()=>pose(angle+Math.PI/2);document.querySelector('#reset').onclick=()=>pose(0);
controls.addEventListener('change',render);addEventListener('resize',frame);pose(0);choose();
window.audit={ready:true,renderer,scene,camera,controls,next,baseline,oldRoot,choose,pose,get view(){return view},get version(){return version},get angle(){return angle}};
`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:entry},bundle:true,write:false,format:'esm',target:'es2022',plugins:[{name:'frozen-r3-timing',setup(b){b.onLoad({filter:/[\\/]src[\\/]engine-3d-assembly\.ts$/},()=>({contents:before,loader:'ts',resolveDir:`${process.cwd()}/src`}));}}]});
const script=bundle.outputFiles[0].text;
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54B30 · Steuertrieb R4</title><style>*{box-sizing:border-box}body{margin:0;background:#20282e;color:#eaf0f2;font:14px system-ui}header{padding:18px 22px 8px}h1{margin:0 0 5px;font-size:22px}p{margin:0;color:#b4c1ca;font-size:13px}nav{display:flex;gap:7px;flex-wrap:wrap;padding:8px 22px}button{min-height:44px;padding:9px 13px;border:1px solid #64747e;border-radius:6px;background:#34434e;color:#f5f6f7;font:inherit}button[aria-pressed=true]{background:#c7b187;color:#18252d}#host{height:calc(100dvh - 176px);min-height:330px}canvas{display:block;touch-action:none}footer{padding:7px 22px;color:#b4c1ca;font-size:12px}@media(max-width:500px){header{padding:12px 14px 4px}h1{font-size:19px}nav{padding:5px 14px;gap:5px}button{font-size:12px;padding:8px 10px}#host{height:calc(100dvh - 222px)}footer{padding:7px 14px}}</style><header><h1>M54B30 · Steuerketten und Führungen</h1><p>Statische Kurbelwinkel-Pose · gleicher Ausschnitt und gleiches Licht · ohne Motorkern</p></header><nav><button data-version="before">Vorher</button><button data-version="after">Nachher</button><button data-view="full">Gesamttrieb</button><button data-view="head">Kopfdetail</button><button id="step">+90°</button><button id="reset">0°</button></nav><main id="host"></main><footer>Drehen und Zoomen · Kurbelwinkel <span id="phase">0°</span> · Darstellungsmaße, keine vermessene OEM-Geometrie</footer><script type="module" src="./preview.js"></script></html>`;
await writeFile(`${output}/preview.js`,script);await writeFile(`${output}/index.html`,html);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[],captures=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
await page.route('**/*',route=>{const u=new URL(route.request().url());requests.push(u.href);if(u.hostname!=='timing-r4.invalid')return route.abort();if(u.pathname==='/preview.js')return route.fulfill({contentType:'text/javascript',body:script});if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});return route.fulfill({status:404,body:''});});
try{
  await page.goto('http://timing-r4.invalid/');await page.waitForFunction(()=>window.audit?.ready);
  for(const version of ['before','after'])for(const view of ['full','head']){
    await page.evaluate(({version,view})=>{window.audit.choose(version,view);window.audit.pose(0);},{version,view});
    await page.screenshot({path:`${evidence}/desktop-${version}-${view}.png`});
    captures.push(await page.evaluate(()=>({version:window.audit.version,view:window.audit.view,camera:window.audit.camera.position.toArray(),drawCalls:window.audit.renderer.info.render.calls,triangles:window.audit.renderer.info.render.triangles})));
  }
  await page.getByRole('button',{name:'+90°',exact:true}).click();await page.getByRole('button',{name:'+90°',exact:true}).click();
  const phase=await page.evaluate(()=>({angle:window.audit.angle,sprockets:window.audit.next.sprockets.map(s=>s.part.rotation.x),matrices:window.audit.next.chain.map(c=>Array.from(c.links.instanceMatrix.array.slice(0,16)))}));
  await page.screenshot({path:`${evidence}/desktop-after-head-180.png`});
  await page.setViewportSize({width:375,height:812});
  for(const version of ['before','after'])for(const view of ['full','head']){await page.evaluate(({version,view})=>{window.audit.choose(version,view);window.audit.pose(0);},{version,view});await page.screenshot({path:`${evidence}/mobile-${version}-${view}.png`});}
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttonHeights:[...document.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height)}));
  const report={errors,requests,captures,phase,...layout,sourceSha256:createHash('sha256').update(await readFile('src/engine-3d-timing.ts','utf8')).digest('hex'),beforeSha256:createHash('sha256').update(before).digest('hex'),output};
  await writeFile(`${evidence}/audit.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length||layout.overflow||layout.buttonHeights.some(h=>h<44))throw new Error('Timing fixture did not pass.');
}finally{await browser.close();}
