import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const output='evidence/surface-r5',delivery='dist/surface-r5';
await mkdir(output,{recursive:true});await mkdir(delivery,{recursive:true});
const frozen=new Map(),versions={};
const entry=String.raw`
import * as T from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createEngineMaterial} from './src/engine-material-profiles';import {cloneEngineMaterialWithSurface} from './src/engine-material-surfaces';import {createM54Casting} from './src/engine-3d-casting';import {createM54Intake} from './src/engine-3d-intake';import {assemblyDimensions} from './src/engine-3d-model';import {copyConfig} from './src/model';
const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});const d=assemblyDimensions(cfg),host=document.querySelector('#host');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.append(renderer.domElement);
const shaderErrors=[];renderer.debug.onShaderError=(gl,program,vs,fs)=>{shaderErrors.push({program:gl.getProgramInfoLog(program),vertex:gl.getShaderInfoLog(vs),fragment:gl.getShaderInfoLog(fs)});};
const scene=new T.Scene();scene.background=new T.Color(0x263138);const camera=new T.PerspectiveCamera(35,1,1,5000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
scene.add(new T.HemisphereLight(0xe9f0f4,0x535d61,1.4));for(const [x,y,z,i] of [[-350,550,-350,3],[380,300,200,1.5]]){const l=new T.DirectionalLight(0xffffff,i);l.position.set(x,y,z);scene.add(l);}
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.55;pmrem.dispose();room.dispose();
const mat=createEngineMaterial,materials={cast:mat(0x74858c,.45,.65),machined:mat(0xbdc9cb,.72,.34),steel:mat(0x9ba9aa,.75,.38),black:mat(0x24343b,.24,.58),rubber:mat(0x121e23,.03,.83),brass:mat(0xa38a58,.55,.45),cut:mat(0xbd9173,.28,.55)};
const casting=createM54Casting({...d,materials}),intake=createM54Intake(d.headOffset,mat);casting.closed.visible=true;const motor=new T.Group();motor.add(casting.closed,intake.closed,intake.details,intake.throttle);scene.add(motor);
// UV-less witness panels expose every material at the same physical scale,
// including the same clone path used by the R4 translucent radiator.
const samples=new T.Group();for(const [i,kind] of ['cast-aluminium','machined-metal','black-plastic'].entries()){
 const original=mat(kind==='black-plastic'?0x24343b:0xaaaaa6,.7,kind==='machined-metal'?.34:.67,kind);
 const material=VERSION==='before'?original.clone():cloneEngineMaterialWithSurface(original);
 const geometry=new T.BoxGeometry(38,38,8,1,1,1);geometry.deleteAttribute('uv');
 const mesh=new T.Mesh(geometry,material);mesh.position.set((i-1)*48,0,0);samples.add(mesh);
}samples.visible=false;scene.add(samples);
let selected='overall';function size(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
function frame(view=selected){selected=view;size();motor.visible=view!=='samples';samples.visible=view==='samples';
 const positions={overall:[[-730,500,-1100],[-50,150,-60]],cast:[[28,120,-230],[28,100,-78]],metal:[[-440,302,-130],[-368,282,0]],plastic:[[-35,275,-330],[-35,210,-175]],samples:[[0,0,165],[0,0,0]]};
 const [position,target]=positions[view];controls.target.fromArray(target);camera.position.fromArray(position);if(innerWidth<600){camera.position.sub(controls.target).multiplyScalar(view==='overall'?2.0:view==='samples'?2.3:1.15).add(controls.target);}controls.update();renderer.render(scene,camera);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>frame(button.dataset.view));controls.addEventListener('change',()=>renderer.render(scene,camera));addEventListener('resize',()=>frame());
function snapshot(){let triangles=0,drawables=0;const surfaces=new Set();scene.traverse(o=>{if(o.isMesh){drawables++;triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.engineSurfaceDetail)surfaces.add(m.userData.engineSurfaceDetail.kind);}});return {view:selected,camera:camera.position.toArray(),target:controls.target.toArray(),triangles,drawables,drawCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,programs:renderer.info.programs.length,surfaces:[...surfaces],normalMapPath,shaderErrors,overflow:document.documentElement.scrollWidth>innerWidth};}
// Compile and actually draw the external normal-map branch separately. This
// fixture-owned flat map is disposed here; production detail adds no texture.
const normalTexture=new T.DataTexture(new Uint8Array([128,128,255,255]),1,1);normalTexture.needsUpdate=true;
const mappedSource=mat(0xaaaaaa,.7,.34,'machined-metal');mappedSource.normalMap=normalTexture;const mapped=cloneEngineMaterialWithSurface(mappedSource);
const mapScene=new T.Scene(),mapGeometry=new T.BoxGeometry(10,10,10),mapCamera=new T.PerspectiveCamera(35,1,.1,100);mapCamera.position.z=30;mapScene.add(new T.Mesh(mapGeometry,mapped),new T.HemisphereLight(0xffffff,0x777777,1));
await renderer.compileAsync(mapScene,mapCamera);renderer.render(mapScene,mapCamera);const normalMapPath=mapped.normalMap===normalTexture&&mappedSource.normalMap===normalTexture&&shaderErrors.length===0;
mapGeometry.dispose();mapped.dispose();mappedSource.dispose();normalTexture.dispose();mapScene.clear();
await renderer.compileAsync(scene,camera);frame();window.audit={ready:true,renderer,scene,camera,motor,samples,frame,snapshot};
`;
for(const version of ['before','after']){
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',target:'es2022',define:{VERSION:JSON.stringify(version)},plugins:[{name:'frozen-surface-r5',setup(b){b.onLoad({filter:/[\\/]src[\\/].*\.ts$/},async args=>{
  if(!frozen.has(args.path)){
   const saved=`${output}/frozen-src/${relative(process.cwd(),args.path).replaceAll('\\','/')}`;
   let source;
   if(!/engine-material-(profiles|surfaces)/.test(args.path)){try{source=await readFile(saved,'utf8');}catch{}}
   frozen.set(args.path,source??await readFile(args.path,'utf8'));
  }
  let contents=frozen.get(args.path);if(version==='before'&&args.path.endsWith('engine-material-profiles.ts'))contents=await readFile(`${output}/engine-material-profiles.before.txt`,'utf8');
  return {contents,loader:'ts'};
 });}}]});
 await writeFile(`${delivery}/${version}.js`,result.outputFiles[0].text);versions[version]=createHash('sha256').update(result.outputFiles[0].text).digest('hex');
 await writeFile(`${delivery}/${version}.html`,`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motor · Oberflächen R5</title><style>*{box-sizing:border-box}body{margin:0;background:#19262e;color:#edf0ee;font:14px system-ui}header{padding:16px 20px}h1{font-size:22px;margin:0 0 6px}p{margin:6px 0;color:#becbcf;font-size:12px}nav{display:flex;flex-wrap:wrap;gap:6px}a,button{font:inherit;min-height:44px;padding:9px 12px;color:#edf0ee;background:#30424b;border:1px solid #64747a;border-radius:5px;text-decoration:none;cursor:pointer}button[aria-pressed=true]{background:#d5c7a5;color:#19262e}#host{width:100%;height:calc(100dvh - 165px);min-height:420px}canvas{display:block;touch-action:none}@media(max-width:600px){header{padding:12px}h1{font-size:19px}a,button{font-size:12px;padding:9px}#host{height:calc(100dvh - 220px);min-height:440px}}</style><header><h1>Feine Oberflächen · ${version==='before'?'Vorher R4':'Nachher R5'}</h1><p>Identische Bauteile, Farben, Kamera und Licht · lokale Materialprüfung</p><nav><a href="./before.html">Vorher</a><a href="./after.html">Nachher</a><button data-view="overall">Gesamt</button><button data-view="cast">Guss</button><button data-view="metal">Metall</button><button data-view="plastic">Kunststoff</button><button data-view="samples">Materialproben</button></nav><p>Proben von links: Guss · bearbeitetes Metall · Formkunststoff. Ziehen zum Drehen, Scrollen zum Zoomen.</p></header><div id="host"></div><script type="module" src="./${version}.js"></script></html>`);
}
for(const [path,source] of frozen){const target=`${output}/frozen-src/${relative(process.cwd(),path).replaceAll('\\','/')}`;await mkdir(dirname(target),{recursive:true});await writeFile(target,source);}
await writeFile(`${output}/source-manifest.json`,JSON.stringify({versions,emptyOutDir:false,geometrySources:[...frozen].filter(([p])=>!/engine-material-(profiles|surfaces)/.test(p)).map(([p,s])=>({path:relative(process.cwd(),p),sha256:createHash('sha256').update(s).digest('hex')})),scope:'Only material profiles differ; geometry modules frozen once for both bundles. No texture assets added.'},null,2));
console.log('Surface fixture built in exclusive directory; emptyOutDir:false.');
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),errors=[],requests=[],captures=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text())}});page.on('requestfailed',r=>errors.push(r.url()));
 await page.route('**/*',r=>{const u=r.request().url();requests.push(u);if(/\/api\/|\/lease/.test(u))return r.abort();return r.continue();});
 for(const version of ['before','after']){
  await page.goto(`http://127.0.0.1:4196/surface-r5/${version}.html`);await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:90000});
  for(const view of ['overall','cast','metal','plastic','samples']){await page.locator('[data-view='+view+']').click();await page.screenshot({path:`${output}/desktop-${version}-${view}.png`,timeout:60000});captures.push({version,size:'desktop',...await page.evaluate(()=>window.audit.snapshot())});}
  // Same renderer/camera/surface: rendering twice must be pixel-identical.
  const stable=await page.evaluate(()=>{const a=window.audit;const gl=a.renderer.getContext(),pixels=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};a.renderer.render(a.scene,a.camera);const first=pixels();a.renderer.render(a.scene,a.camera);const second=pixels();return first.every((value,i)=>value===second[i]);});assert.equal(stable,true,'Static shader must not animate');
  await page.setViewportSize({width:375,height:812});for(const view of ['overall','cast','samples']){await page.locator('[data-view='+view+']').click();await page.screenshot({path:`${output}/mobile-${version}-${view}.png`,timeout:60000});captures.push({version,size:'mobile',...await page.evaluate(()=>window.audit.snapshot())});}
  await page.setViewportSize({width:1280,height:800});
 }
 for(const before of captures.filter(x=>x.version==='before')){const after=captures.find(x=>x.version==='after'&&x.size===before.size&&x.view===before.view);for(const field of ['triangles','drawables','drawCalls','renderTriangles'])assert.equal(after[field],before[field],field+' changed');assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.target,before.target);}
 assert.ok(captures.every(x=>!x.overflow&&x.shaderErrors.length===0&&x.normalMapPath));assert.equal(errors.length,0);assert.equal(requests.filter(u=>/\/api\/|\/lease/.test(u)).length,0);
 await writeFile(`${output}/browser-audit.json`,JSON.stringify({passed:true,errors,requests,captures,temporalStability:'Two static frames pixel-identical in both versions',performance:'Software static render only; no hardware FPS claim'},null,2));console.log(JSON.stringify({passed:true,errors,captures:captures.map(x=>({version:x.version,size:x.size,view:x.view,drawCalls:x.drawCalls,programs:x.programs,surfaces:x.surfaces})),output}));
}catch(error){await writeFile(`${output}/browser-audit.json`,JSON.stringify({passed:false,failure:String(error),errors,requests,captures},null,2));throw error;}finally{await browser.close();}
