/** Standalone intake review: same production helper, no native API or main build. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/intake-reference-01',delivery='dist/fachchat-motor-3d';
await mkdir(output,{recursive:true});await mkdir(delivery,{recursive:true});
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as T from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
  import {createM54Intake} from './src/engine-3d-intake';
  const scene=new T.Scene();scene.background=new T.Color(0x17252e);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.querySelector('#host').append(renderer.domElement);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xdce9ef,0x52606b,1.5));for(const [position,color,intensity] of [[[0,650,-700],0xfff2de,2.4],[[500,300,400],0xb4d6f1,2], [[-650,180,-300],0xffffff,1.3]]){const light=new T.DirectionalLight(color,intensity);light.position.fromArray(position);scene.add(light);}
  const assembly=createM54Intake(0,(color,metalness=.1,roughness=.7)=>new T.MeshStandardMaterial({color,metalness,roughness}));scene.add(assembly.closed,assembly.cut,assembly.details,assembly.throttle);assembly.cut.visible=false;
  const camera=new T.PerspectiveCamera(36,1,1,4000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=180;controls.maxDistance=3000;
  const bounds=new T.Box3().setFromObject(assembly.closed).union(new T.Box3().setFromObject(assembly.details));let preset='outside',open=false;
  const frame=(name=preset)=>{preset=name;const direction=new T.Vector3(...(name==='rear'?[.18,.65,1]:[.18,.85,-1])).normalize();bounds.getCenter(controls.target);const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize(),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*camera.aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}
    camera.position.copy(controls.target).addScaledVector(direction,distance*(innerWidth<600?1.16:1.12));controls.update();};
  function mode(cut){assembly.closed.visible=!cut;assembly.cut.visible=cut;document.querySelector('#outside').setAttribute('aria-pressed',String(!cut));document.querySelector('#cut').setAttribute('aria-pressed',String(cut));}
  document.querySelector('#outside').onclick=()=>{mode(false);frame('outside');};document.querySelector('#cut').onclick=()=>{mode(true);frame('outside');};
  document.querySelector('#disa').onclick=()=>{open=!open;assembly.disaFlap.rotation.z=open?Math.PI/2:0;mode(true);document.querySelector('#disa').textContent=open?'DISA schließen':'DISA öffnen';document.querySelector('#state').textContent=open?'Prinzipdarstellung: Resonanzklappe offen':'Prinzipdarstellung: Resonanzklappe geschlossen';};
  document.querySelector('#rear').onclick=()=>frame('rear');
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();frame();}addEventListener('resize',resize);resize();mode(false);
  window.audit={ready:true,assembly,renderer,frame};const tick=()=>{controls.update();renderer.render(scene,camera);requestAnimationFrame(tick);};tick();
`},bundle:true,write:false,format:'esm',target:'es2022'});
const document=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54B30 · Ansaugung & DISA</title><style>*{box-sizing:border-box}body{margin:0;background:#17252e;color:#e6edf0;font:14px system-ui,sans-serif}#host{width:100vw;height:100vh}canvas{display:block;touch-action:none}header{position:absolute;top:24px;left:28px;right:20px;pointer-events:none}small{font-size:11px;letter-spacing:.15em;color:#b8cbd5}h1{font-size:25px;margin:8px 0}p{font-size:13px;margin:0;color:#bdcdd5;max-width:550px;line-height:1.4}nav{position:absolute;left:28px;top:124px;display:flex;gap:7px;flex-wrap:wrap;right:20px}button{font:inherit;min-height:44px;background:#273b49;color:#e2ecf0;border:1px solid #526b79;border-radius:7px;padding:9px 15px;cursor:pointer}button[aria-pressed=true]{background:#dfd1b6;color:#1b2b36;border-color:#dfd1b6}footer{position:absolute;bottom:22px;left:28px;right:20px;font-size:12px;color:#b9cbd5;pointer-events:none}#state{display:block;margin-bottom:6px;color:#e8d1a8}@media(max-width:600px){header{top:17px;left:18px}h1{font-size:22px}p{font-size:12px;max-width:320px}nav{top:166px;left:18px;gap:6px}button{font-size:12px;padding:8px 11px}footer{left:18px;font-size:11px}}</style><header><small>M54B30 · ANSAUGWERKSTATT</small><h1>Ansaugung & DISA · erster Entwurf</h1><p>Sechs geformte Saugrohre, breiter Kunststoffsammler, untere Drosselklappe und Filterkasten.</p></header><nav aria-label="Ansaugansicht"><button id="outside">Außen</button><button id="cut">Schnitt</button><button id="disa">DISA öffnen</button><button id="rear">Kopfseite</button></nav><div id="host"></div><footer><span id="state">DISA-Stellung manuell im Schnitt ansehen</span>Ziehen zum Drehen · Scrollen zum Zoomen<br>Geometrie nach BMW-Unterlagen und Fotos · kein Motorlauf / keine Resonanzsimulation</footer><script type="module" src="./ansaugung-v1.js"></script></html>`;
for(const dir of [output,delivery]){await writeFile(`${dir}/ansaugung-v1.js`,bundle.outputFiles[0].text);await writeFile(`${dir}/ansaugung-v1.html`,document);}
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],failed=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));
await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;requests.push(path);if(path.startsWith('/api/'))throw new Error('No motor API in intake review');return route.continue();});
try{
  await page.goto('http://127.0.0.1:4196/fachchat-motor-3d/ansaugung-v1.html');await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});
  await page.screenshot({path:`${output}/desktop-outside.png`,timeout:60000});
  await page.getByRole('button',{name:'Schnitt',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:`${output}/desktop-cut.png`,timeout:60000});
  await page.getByRole('button',{name:'DISA öffnen',exact:true}).click();const angle=await page.evaluate(()=>window.audit.assembly.disaFlap.rotation.z);if(Math.abs(angle-Math.PI/2)>1e-8)throw new Error('DISA preview flap did not open');
  await page.screenshot({path:`${output}/desktop-disa-open.png`,timeout:60000});
  await page.getByRole('button',{name:'Außen',exact:true}).click();await page.getByRole('button',{name:'Kopfseite',exact:true}).click();await page.waitForTimeout(250);await page.screenshot({path:`${output}/desktop-head.png`,timeout:60000});
  await page.getByRole('button',{name:'Außen',exact:true}).click();await page.setViewportSize({width:375,height:812});await page.waitForTimeout(300);await page.screenshot({path:`${output}/mobile-outside.png`,timeout:60000});
  const audit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,calls:window.audit.renderer.info.render.calls,triangles:window.audit.renderer.info.render.triangles,buttons:[...document.querySelectorAll('button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height}))}));
  await writeFile(`${output}/browser-audit.json`,JSON.stringify({errors,failed,requests,...audit},null,2));console.log(JSON.stringify({errors,failed,...audit,output}));if(errors.length||failed.length||audit.overflow)process.exitCode=1;
}finally{await browser.close();}

