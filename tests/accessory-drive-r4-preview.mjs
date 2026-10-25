/** Isolated static accessory-drive comparison. Request fulfilment only: no HTTP
 * server, shared port, motor core, audio, lease, API or installed application. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dist=resolve(project,'dist/accessory-drive-r4'),out=resolve(project,'evidence/accessory-drive-r4');
await mkdir(dist,{recursive:true});await mkdir(out,{recursive:true});
const entry=String.raw`
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createM54Casting} from './src/engine-3d-casting';
import {assemblyDimensions} from './src/engine-3d-model';
import {copyConfig} from './src/model';
import {createEngineMaterial as mat} from './src/engine-material-profiles';
import {createM54AccessoryDrive,animateM54AccessoryDrive} from './src/engine-3d-accessory-drive';
const host=document.querySelector('#host'),cfg=copyConfig(),scene=new T.Scene();scene.background=new T.Color(0x273136);
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;host.append(renderer.domElement);
const camera=new T.PerspectiveCamera(38,1,1,4000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
const pmrem=new T.PMREMGenerator(renderer),environment=new RoomEnvironment(),texture=pmrem.fromScene(environment,.04);scene.environment=texture.texture;environment.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight(0xd9e4e9,0x485148,1.5));
for(const [x,y,z,intensity] of [[-900,650,-450,2.7],[-650,100,650,1.6]]){const light=new T.DirectionalLight(0xfff0dd,intensity);light.position.set(x,y,z);scene.add(light);}
const materials={cast:mat(0x74858c,.45,.65),machined:mat(0xbdc9cb,.72,.34),steel:mat(0x9ba9aa,.75,.38),black:mat(0x24343b,.24,.58),rubber:mat(0x121e23,.03,.93),brass:mat(0xa38a58,.55,.45),cut:mat(0xbd9173,.28,.55)};
const casting=createM54Casting({...assemblyDimensions(cfg),materials});casting.closed.visible=true;scene.add(casting.closed,casting.portMounts);
function cylinder(parent,r,h,material,x,y,z,sides=32){const g=new T.CylinderGeometry(r,r,h,sides);g.rotateZ(Math.PI/2);const p=new T.Mesh(g,material);p.position.set(x,y,z);parent.add(p);return p;}
// Retained pump body/node; only the old isolated wheel is replaced in After.
const fixed=new T.Group();scene.add(fixed);cylinder(fixed,24,22,materials.cast,-344,63,-30);cylinder(fixed,15,25,materials.machined,-344,63,-30);
const before=new T.Group();before.name='Vorher: einzelnes Wasserpumpenrad entsprechend bisherigem Assemblyabschnitt';scene.add(before);
const oldWheel=new T.Group();oldWheel.position.set(-360,63,-30);before.add(oldWheel);cylinder(oldWheel,26,6,materials.black,0,0,0);
const ring=new T.Mesh(new T.TorusGeometry(23,1.6,6,32),materials.steel);ring.rotation.y=Math.PI/2;oldWheel.add(ring);
for(let i=0;i<6;i++){const a=i/6*Math.PI*2;cylinder(oldWheel,3,7,materials.steel,0,Math.sin(a)*17,Math.cos(a)*17,6);}
const drive=createM54AccessoryDrive([-344,63,-30],mat);scene.add(drive.root);
const bounds=new T.Box3().setFromObject(drive.root),centre=bounds.getCenter(new T.Vector3());let selected='after',view='front',angle=0,draws=0;
function render(){before.visible=selected==='before';drive.root.visible=selected==='after';oldWheel.rotation.x=angle*1.15;animateM54AccessoryDrive(drive,angle);renderer.render(scene,camera);draws++;document.querySelector('#angle-value').textContent=angle.toFixed(1)+' rad';}
function frame(name=view){view=name;const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();controls.target.copy(centre);
 const direction=new T.Vector3(...(view==='front'?[-1,.035,.035]:[-1,.26,-.57])).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize(),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).sub(centre);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*camera.aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}
 camera.position.copy(centre).addScaledVector(direction,distance*1.21);controls.update();render();
}
document.querySelectorAll('[data-version]').forEach(button=>button.onclick=()=>{selected=button.dataset.version;document.querySelectorAll('[data-version]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));frame(button.dataset.view);});
document.querySelectorAll('[data-angle]').forEach(button=>button.onclick=()=>{angle=Number(button.dataset.angle);render();});
controls.addEventListener('change',render);addEventListener('resize',()=>frame());frame();
window.audit={ready:true,drive,before,camera,controls,snapshot:()=>({version:selected,view,angle,draws,camera:{position:camera.position.toArray(),target:controls.target.toArray()},geometry:renderer.info.render,
 wheels:drive.wheels.map(w=>({id:w.id,radius:w.radius,ratio:w.ratio,rotation:w.part.rotation.x,position:w.part.position.toArray()})),
 belts:drive.belts.map(b=>({id:b.id,width:b.width,ribs:b.ribs,length:b.path.length,plane:b.path.x,marks:b.marks.map(m=>m.part.position.toArray())})),
 pumpShaft:drive.pumpShaft,staticGroups:drive.staticGroups.map(g=>g.name),parts:drive.partNames,frameScope:'Fixed accessory-drive bounds with the same casting in both versions; not a full application scene.',
 graphics:(()=>{const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'unavailable';})()})};
`;
const result=await build({absWorkingDir:project,stdin:{resolveDir:project,contents:entry,loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',metafile:true});
await writeFile(resolve(dist,'fixture.js'),result.outputFiles[0].text);
await writeFile(resolve(dist,'index.html'),`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>M54 · Nebenaggregatetrieb R4</title><style>*{box-sizing:border-box}body{margin:0;background:#273136;color:#e2e8e8;font:13px/1.45 system-ui}header{padding:14px 18px}h1{font-size:20px;margin:0 0 5px}p{font-size:12px;color:#bbc8cd;margin:0 0 12px}nav{display:flex;flex-wrap:wrap;gap:6px}button{min-height:44px;padding:8px 12px;border:1px solid #6e858a;border-radius:4px;background:#33464e;color:#e4ebed;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#c4d4d5;color:#233239}#host{width:100%;height:calc(100dvh - 155px);min-height:360px}canvas{display:block;width:100%;height:100%}footer{padding:10px 18px;font-size:11px;color:#b8c6cb}@media(max-width:600px){header{padding:10px 12px}h1{font-size:18px}p{font-size:11px}button{font-size:11px;padding:8px 10px}#host{height:calc(100dvh - 210px);min-height:360px}}</style><header><h1>M54 · Nebenaggregatetrieb</h1><p>Statischer Frontausschnitt · gleiche Kamera und Beleuchtung · Kurbelwinkel wird ausdrücklich gesetzt · kein Motorlauf</p><nav><button data-version="before" aria-pressed="false">Vorher</button><button data-version="after" aria-pressed="true">Neuer Trieb</button><button data-view="front" aria-pressed="true">Stirnseite</button><button data-view="oblique" aria-pressed="false">Schräg</button><button data-angle="0">A · 0 rad</button><button data-angle="1.1">B · 1,1 rad</button></nav></header><div id="host"></div><footer>Illustrationsmaße · Pumpenknoten unverändert · <span id="angle-value"></span> · Kein Nachweis nativer Integration</footer><script type="module" src="./fixture.js"></script></html>`);
const sourceManifest=[];
for(const path of Object.keys(result.metafile.inputs).filter(p=>p!=='<stdin>'&&!p.includes('node_modules'))){const contents=await readFile(resolve(project,path));sourceManifest.push({path,sha256:createHash('sha256').update(contents).digest('hex')});}
await writeFile(resolve(out,'source-manifest.json'),JSON.stringify({sources:sourceManifest,fixtureSha256:createHash('sha256').update(result.outputFiles[0].text).digest('hex'),emptyOutDir:false,note:'One shared casting/bundle for both views; Previous wheel reproduced from existing assembly lines177–178.'},null,2));
const report={passed:false,nativeRun:false,serverStarted:false,api:[],errors:[],failed:[],requests:[],captures:[],interaction:null};
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('requestfailed',r=>report.failed.push(r.url()));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());report.requests.push(url.href);
  if(url.origin!=='http://accessory-drive-r4.test'||/\/api|lease|native|audio/i.test(url.pathname)){report.api.push(url.href);return route.abort();}
  const file=resolve(dist,url.pathname==='/'?'index.html':url.pathname.slice(1));
  if(!file.startsWith(dist+sep))return route.abort();
  try{await route.fulfill({status:200,contentType:extname(file)==='.js'?'text/javascript':'text/html',body:await readFile(file)});}catch{await route.abort();}
 });
 await page.goto('http://accessory-drive-r4.test/');await page.waitForFunction(()=>window.audit?.ready);
 for(const [device,viewport] of [['desktop',{width:1280,height:800}],['mobile',{width:375,height:812}]]){
  await page.setViewportSize(viewport);
  for(const view of ['front','oblique']){
   await page.locator(`[data-view="${view}"]`).click();let fixedCamera;
   for(const version of ['before','after']){
    await page.locator(`[data-version="${version}"]`).click();await page.locator('[data-angle="0"]').click();
    const snapshot=await page.evaluate(()=>window.audit.snapshot());if(!fixedCamera)fixedCamera=snapshot.camera;assert.deepEqual(snapshot.camera,fixedCamera);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const image=`${device}-${version}-${view}.png`;await page.screenshot({path:resolve(out,image),fullPage:true});report.captures.push({device,view,version,image,...snapshot});
   }
  }
 }
 const a=await page.evaluate(()=>window.audit.snapshot());await page.locator('[data-angle="1.1"]').click();const b=await page.evaluate(()=>window.audit.snapshot());
 assert.ok(b.wheels.some((w,i)=>w.rotation!==a.wheels[i].rotation));assert.notDeepEqual(b.belts[0].marks,a.belts[0].marks);
 await page.locator('[data-angle="0"]').click();const again=await page.evaluate(()=>window.audit.snapshot());assert.deepEqual(again.wheels,a.wheels);assert.deepEqual(again.belts,a.belts);
 report.interaction={a,b,reset:again,source:'Explicit angle buttons, not a timer or physical motor.'};
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);assert.deepEqual(report.api,[]);report.passed=true;
}catch(error){report.failure=String(error?.stack??error);process.exitCode=1;}finally{
 await browser.close();await writeFile(resolve(out,'browser-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,nativeRun:false,serverStarted:false,captures:report.captures.length,errors:report.errors,failed:report.failed,api:report.api,failure:report.failure,output:relative(project,out)}));
}
