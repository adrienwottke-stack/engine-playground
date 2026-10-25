import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {relative} from 'node:path';

const output='evidence/detail-light-r3',delivery='dist/detail-light-r3';
await mkdir(output,{recursive:true});await mkdir(delivery,{recursive:true});
const frozen=new Map(),versions={};
const entry=`import * as T from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {createEngineMaterial} from './src/engine-material-profiles';import {createM54Casting} from './src/engine-3d-casting';import {createM54Intake} from './src/engine-3d-intake';import {createM54ExhaustManifolds} from './src/engine-3d-exhaust-manifold';import {installWorkshopLighting} from './src/engine-view-lighting';import {assemblyDimensions} from './src/engine-3d-model';import {copyConfig} from './src/model';
const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});const d=assemblyDimensions(cfg),host=document.querySelector('#host');
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;host.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0x303b3e);const camera=new T.PerspectiveCamera(38,1,2,4000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;host.dataset.graphics=/swiftshader|llvmpipe|software|warp/i.test(renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL))?'software':'hardware';
const engine={renderer,scene,camera,controls,host};scene.add(new T.HemisphereLight(0xd5e1ed,0x26313a,1.1));const key=new T.DirectionalLight(0xfff1df,2.2);key.position.set(-300,600,450);scene.add(key);
const mat=VERSION==='before'?(color,metalness=.5,roughness=.4)=>new T.MeshStandardMaterial({color,metalness:Math.min(.28,metalness),roughness:Math.max(.4,roughness)}):createEngineMaterial;
const materials={cast:mat(0x74858c,.45,.65),machined:mat(0xbdc9cb,.72,.34),steel:mat(0x9ba9aa,.75,.38),black:mat(0x24343b,.24,.58),rubber:mat(0x121e23,.03,.83),brass:mat(0xa38a58,.55,.45),cut:mat(0xbd9173,.28,.55)};
const casting=createM54Casting({...d,materials}),intake=createM54Intake(d.headOffset,mat),exhaust=createM54ExhaustManifolds(d.headOffset,mat);casting.closed.visible=true;const motor=new T.Group();motor.add(casting.closed,casting.portMounts,intake.closed,intake.details,intake.throttle,exhaust.closed,exhaust.details);scene.add(motor);
const room=new T.Group(),architecture=new T.Group(),workstation=new T.Group();const ground=new T.Mesh(new T.PlaneGeometry(2400,2400),new T.MeshStandardMaterial({color:0x606760,roughness:.94}));ground.rotation.x=-Math.PI/2;ground.position.y=-125;room.add(ground);scene.add(room);const lighting=installWorkshopLighting(engine,room,architecture,workstation);
function size(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}size();
function frame(view){const positions={intake:[-590,460,-920],exhaust:[-570,430,930],front:[-1000,360,-510]};size();const bounds=new T.Box3().setFromObject(motor);bounds.getCenter(controls.target);const direction=new T.Vector3(...positions[view]).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize(),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*camera.aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}camera.position.copy(controls.target).addScaledVector(direction,distance*1.08);controls.update();lighting.update('closed',null,0);renderer.render(scene,camera);}
window.audit={engine,frame,ready:true};
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>frame(button.dataset.view));
addEventListener('resize',()=>requestAnimationFrame(()=>frame('intake')));controls.addEventListener('change',()=>renderer.render(scene,camera));frame('intake');
`;
for(const version of ['before','after']){
  const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',define:{VERSION:JSON.stringify(version),'import.meta.env.BASE_URL':'"/automation-preview/"'},plugins:[{name:'freeze-identical-geometry',setup(builder){builder.onLoad({filter:/[\\/]src[\\/].*\.ts$/},async args=>{
    if(!frozen.has(args.path))frozen.set(args.path,await readFile(args.path,'utf8'));
    let contents=frozen.get(args.path);
    if(version==='before'&&args.path.endsWith('engine-three.ts'))contents=await readFile(`${output}/engine-three.before.txt`,'utf8');
    if(version==='before'&&args.path.endsWith('engine-view-lighting.ts'))contents=await readFile(`${output}/engine-view-lighting.before.txt`,'utf8');
    return {contents,loader:'ts'};
  });}}]});
  await writeFile(`${delivery}/${version}.js`,result.outputFiles[0].text);
  versions[version]=createHash('sha256').update(result.outputFiles[0].text).digest('hex');
}
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motor · Materialvergleich R3</title><style>*{box-sizing:border-box}body{margin:0;background:#17252f;color:#e6edf0;font:14px system-ui}header{padding:16px 22px;background:#17252f}h1{font-size:21px;margin:0 0 8px}p{margin:6px 0;color:#bbc8ce;font-size:12px}nav{display:flex;gap:6px;flex-wrap:wrap}a,button{font:inherit;color:#e6edf0;background:#30414a;border:1px solid #5c717c;border-radius:5px;padding:10px 12px;min-height:44px;text-decoration:none;cursor:pointer}a[aria-current=page]{color:#17252f;background:#d9cba9}#host{width:100%;height:calc(100dvh - 175px);min-height:340px}canvas{display:block;width:100%;height:100%}@media(max-width:600px){header{padding:12px}h1{font-size:19px}nav{gap:5px}a,button{padding:10px;font-size:12px}#host{height:calc(100dvh - 195px)}}</style><header><h1 id="title"></h1><p>Gleicher Motorstand · gleiche Kamera · unverändertes Licht</p><nav><a href="?version=before">Vorher</a><a href="?version=after">Nachher</a><button data-view="intake">Ansaugseite</button><button data-view="exhaust">Abgasseite</button><button data-view="front">Stirnseite</button></nav><p>Lokaler Materialvergleich · Drehen und Zoomen · ohne Motorkernverbindung</p></header><div id="host"></div><script type="module">const version=new URLSearchParams(location.search).get('version')==='before'?'before':'after';document.querySelector('#title').textContent='Oberflächen · '+(version==='before'?'Vorher':'Nachher');document.querySelector('a[href="?version='+version+'"]').setAttribute('aria-current','page');await import('./'+version+'.js');</script></html>`;
const bootstrap=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
await writeFile(`${delivery}/bootstrap.js`,bootstrap);
await writeFile(`${delivery}/index.html`,html.replace(/<script type="module">[\s\S]*?<\/script>/,'<script type="module" src="./bootstrap.js"></script>'));
await writeFile(`${output}/source-manifest.json`,JSON.stringify({versions,geometrySources:[...frozen].filter(([p])=>!/engine-three|engine-view-lighting|engine-material-profiles/.test(p)).map(([p,s])=>({path:relative(process.cwd(),p),sha256:createHash('sha256').update(s).digest('hex')})),comparison:'All local TS dependencies frozen once for both builds; only material factory and reflection selection differ.',emptyOutDir:false},null,2));
console.log('Built exclusive static fixture. No main build or server changes.');
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),errors=[],failed=[],requests=[],captures=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});page.on('requestfailed',r=>failed.push(r.url()));
  await page.route('**/*',route=>{const url=route.request().url();requests.push(url);if(/\/api\/|\/lease(?:\/|\?)/.test(url)){errors.push('Blocked forbidden request '+url);return route.abort();}return route.continue();});
  for(const version of ['before','after']){
    await page.goto(`http://127.0.0.1:4196/detail-light-r3/index.html?version=${version}`);await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:120000});
    for(const view of ['intake','exhaust','front']){await page.locator('[data-view='+view+']').click();await page.screenshot({path:`${output}/desktop-${version}-${view}.png`,timeout:60000});}
    captures.push(await page.evaluate(()=>{const e=window.audit.engine;return {camera:e.camera.position.toArray(),renderer:e.host.dataset.graphics,lighting:JSON.parse(e.host.dataset.workshopLighting),meshes:(()=>{let n=0;e.scene.traverse(o=>{if(o.isMesh)n++});return n})(),triangles:e.renderer.info.render.triangles,materials:(()=>{const set=new Set();e.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.engineSurface)set.add(m.userData.engineSurface.profile)});return [...set]})()};}));
    await page.setViewportSize({width:375,height:812});await page.waitForTimeout(250);await page.evaluate(()=>window.audit.frame('intake'));await page.screenshot({path:`${output}/mobile-${version}.png`,timeout:60000});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)errors.push(version+': mobile overflow');
    await page.setViewportSize({width:1280,height:800});
  }
  await writeFile(`${output}/browser-audit.json`,JSON.stringify({errors,failed,requests,captures,nativeCalls:requests.filter(u=>/\/api\/|\/lease/.test(u)),note:'Software-rendered static images; no hardware performance claim.'},null,2));
  console.log(JSON.stringify({errors,failed,captures,output}));if(errors.length||failed.length)process.exitCode=1;
}finally{await browser.close();}


