/** Actual local delivery of an isolated photo-referenced assembly. No motor API. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const output=process.argv[2]||'evidence/exhaust-manifold-iteration',delivery='dist/fachchat-motor-3d';
await mkdir(output,{recursive:true});await mkdir(delivery,{recursive:true});
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as T from 'three';
  import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
  import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
  import {createM54ExhaustManifolds} from './src/engine-3d-exhaust-manifold';
  const host=document.querySelector('#host'),scene=new T.Scene();scene.background=new T.Color(0x18232a);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
  const camera=new T.PerspectiveCamera(36,1,1,5000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=250;controls.maxDistance=3000;
  const assembly=createM54ExhaustManifolds(0,(color,metalness=.4,roughness=.6)=>new T.MeshStandardMaterial({color,metalness,roughness}));
  scene.add(assembly.closed,assembly.details);
  scene.add(new T.HemisphereLight(0xdce8ef,0x6b5d4d,1.1));
  for(const [position,color,power] of [[[50,650,700],0xfff2df,1.7],[[-650,350,0],0xc0d9ef,1.5],[[300,160,-500],0xffffff,1.1]]){const light=new T.DirectionalLight(color,power);light.position.fromArray(position);scene.add(light);}
  const box=new T.Box3().setFromObject(assembly.closed).union(new T.Box3().setFromObject(assembly.details));
  let preset='front';
  function frame(name=preset){
    preset=name;const directions={front:[.13,.65,1],flange:[-.12,.2,-1],side:[-.9,.45,.75],detail:[.18,.85,1]};const direction=new T.Vector3(...directions[name]).normalize();
    const activeBox=name==='detail'?assembly.closed.children.filter(object=>object.name.startsWith('Zusammenhängender')).reduce((bounds,object)=>bounds.union(new T.Box3().setFromObject(object)),new T.Box3()):box;
    activeBox.getCenter(controls.target);const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
    const tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
    for(const x of [activeBox.min.x,activeBox.max.x])for(const y of [activeBox.min.y,activeBox.max.y])for(const z of [activeBox.min.z,activeBox.max.z]){const p=new T.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*camera.aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}
    camera.position.copy(controls.target).addScaledVector(direction,distance*(innerWidth<600?1.22:1.17));controls.update();
    document.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===name)));
  }
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();frame();}addEventListener('resize',resize);
  document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>frame(button.dataset.view)));
  resize();window.audit={ready:true,frame,renderer,assembly};
  const tick=()=>{controls.update();renderer.render(scene,camera);requestAnimationFrame(tick);};tick();
`},bundle:true,write:false,format:'esm',target:'es2022'});
const document=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54B30 · Krümmer nach Fotoreferenz</title><style>*{box-sizing:border-box}body{margin:0;background:#18232a;color:#e6edf0;font:14px system-ui,sans-serif}#host{width:100vw;height:100vh}canvas{display:block;touch-action:none}header{position:absolute;top:25px;left:28px;right:22px;pointer-events:none}small{font-size:11px;letter-spacing:.15em;color:#b6c5cc}h1{font-size:25px;line-height:1.1;margin:9px 0}p{font-size:13px;color:#c2cdd2;max-width:500px;margin:0}nav{position:absolute;left:28px;top:128px;display:flex;gap:7px}button{font:inherit;color:#dbe5ea;border:1px solid #53636d;background:#24333e;border-radius:7px;min-height:44px;padding:8px 15px;cursor:pointer}button[aria-pressed=true]{background:#e7d8bc;color:#242c31;border-color:#e7d8bc}footer{position:absolute;left:28px;right:20px;bottom:22px;font-size:12px;color:#bac8cf;pointer-events:none}@media(max-width:600px){header{top:19px;left:18px}h1{font-size:22px}p{font-size:12px;max-width:320px}nav{top:160px;left:18px;gap:6px}button{padding:8px 11px;font-size:12px}footer{left:18px;font-size:11px;max-width:320px}}</style><header><small>M54B30 · ABGASWERKSTATT</small><h1>Krümmer & Kats · erster Entwurf</h1><p>Nach deinen Fotos: breite Dreierkrümmer, längliche Katgehäuse und versetzte Fallrohre.</p></header><nav aria-label="Ansicht"><button data-view="front">Vorderseite</button><button data-view="flange">Flanschseite</button><button data-view="side">Schrägansicht</button></nav><div id="host"></div><footer>Ziehen zum Drehen · Scrollen zum Zoomen<br>Fotobasierte Proportionen · keine vermessenen OEM-Abmessungen · kein Motorlauf</footer><script type="module" src="./kruemmer-v1.js"></script></html>`;
for(const dir of [output,delivery]){await writeFile(`${dir}/kruemmer-v1.js`,bundle.outputFiles[0].text);await writeFile(`${dir}/kruemmer-v1.html`,document);}
if(process.argv.includes('--build-only')){console.log(JSON.stringify({delivered:delivery,output}));process.exit(0);}
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[],failed=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('requestfailed',request=>failed.push(request.url()));
await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;requests.push(path);if(path.startsWith('/api/'))throw new Error('No native API in manifold preview');return route.continue();});
try{
  await page.goto('http://127.0.0.1:4196/fachchat-motor-3d/kruemmer-v1.html');await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});
  await page.screenshot({path:`${output}/desktop-front.png`,timeout:60000});
  await page.getByRole('button',{name:'Flanschseite',exact:true}).click();await page.waitForTimeout(350);await page.screenshot({path:`${output}/desktop-flange.png`,timeout:60000});
  await page.getByRole('button',{name:'Schrägansicht',exact:true}).click();await page.waitForTimeout(350);await page.screenshot({path:`${output}/desktop-side.png`,timeout:60000});
  await page.evaluate(()=>window.audit.frame('detail'));await page.waitForTimeout(350);await page.screenshot({path:`${output}/desktop-detail.png`,timeout:60000});
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(300);await page.getByRole('button',{name:'Vorderseite',exact:true}).click();await page.waitForTimeout(300);
  await page.screenshot({path:`${output}/mobile-front.png`,timeout:60000});
  const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,drawCalls:window.audit.renderer.info.render.calls,triangles:window.audit.renderer.info.render.triangles,buttons:[...document.querySelectorAll('button')].map(button=>({label:button.textContent,selected:button.getAttribute('aria-pressed')}))}));
  await writeFile(`${output}/browser-audit.json`,JSON.stringify({errors,failed,requests,...result},null,2));console.log(JSON.stringify({errors,failed,...result,output}));if(errors.length||failed.length||result.overflow)process.exitCode=1;
}finally{await browser.close();}

