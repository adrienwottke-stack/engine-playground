/** Isolated exhaust assembly with the very same authored parts as the engine. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const phase=process.argv[2]==='vorher'?'vorher':'jetzt';
const spacing=process.argv.includes('--spacing');
const junction=process.argv.includes('--junction'),prefix=junction?'uebergang':spacing?'abstand':'mittel';
const output=junction?'evidence/exhaust-junction-iteration':spacing?'evidence/exhaust-spacing-iteration':'evidence/exhaust-middle-iteration',delivery='dist/fachchat-motor-3d',name=`${prefix}-${phase}`;
await mkdir(output,{recursive:true});await mkdir(delivery,{recursive:true});
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as T from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
  import {buildWorkshopAssembly} from './src/engine-3d-assembly';import {assemblyConnectors,engineRoutes} from './src/engine-3d-layout';import {assemblyDimensions} from './src/engine-3d-model';import {copyConfig} from './src/model';
  const scene=new T.Scene();scene.background=new T.Color(0x18232a);const root=new T.Group();scene.add(root);
  const extras=new T.Group(),housing=new T.Group(),head=new T.Group();extras.add(head);
  const cfg=copyConfig(),dimensions=assemblyDimensions(cfg),nodes=assemblyConnectors(dimensions.headOffset);
  const mat=(color,metalness=.4,roughness=.55)=>new T.MeshStandardMaterial({color,metalness:Math.min(.28,metalness),roughness:Math.max(.4,roughness)});
  const assembly=buildWorkshopAssembly({extras,housing,head,...dimensions,mat});
  const keep=['Abgasnachbehandlung','M54 Abgasflansche und Fallrohre','Hohle Edelstahl Doppelendrohre'];
  for(const name of keep){const part=extras.getObjectByName(name);if(!part)throw new Error('Abgasteil fehlt: '+name);root.add(part);}
  root.add(assembly.closedHousing.getObjectByName('M54 Krümmer und Kat Außenhüllen nach Fotoreferenz'));
  // Closed silencer shells are batched directly under closedHousing. Exclude
  // all engine casting groups; only the two low, downstream cans are selected.
  let shells=0;for(const part of [...assembly.closedHousing.children])if(part instanceof T.Mesh){const b=new T.Box3().setFromObject(part);if(b.min.x>300&&b.max.y<0){root.add(part);shells++;}}
  if(!shells)throw new Error('Geschlossene Schalldämpferhüllen fehlen.');
  for(const route of engineRoutes(dimensions.headOffset).filter(route=>route.medium==='exhaust'&&route.branch.startsWith('main-'))){const curve=new T.CatmullRomCurve3(route.coords.map(point=>new T.Vector3(...point)),false,'centripetal');root.add(new T.Mesh(new T.TubeGeometry(curve,80,route.radius,24,false),mat(0xa6afb1,.5,.4)));}
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.querySelector('#host').append(renderer.domElement);
  scene.add(new T.HemisphereLight(0xdce8ef,0x6b5d4d,1.1));for(const [position,color,intensity] of [[[0,800,800],0xfff2df,1.8],[[-700,350,-200],0xc0d9ef,1.4]]){const light=new T.DirectionalLight(color,intensity);light.position.fromArray(position);scene.add(light);}
  const camera=new T.PerspectiveCamera(36,1,1,20000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=300;controls.maxDistance=20000;
  const bounds=${junction?"new T.Box3(new T.Vector3(-298,115,85),new T.Vector3(298,249,228))":"new T.Box3().setFromObject(root)"};
  const frame=()=>{bounds.getCenter(controls.target);const direction=new T.Vector3(${junction?'.12,-.3,1':'.15,.65,1'}).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize(),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));let distance=0;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).sub(controls.target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tan*camera.aspect),p.dot(direction)+Math.abs(p.dot(up))/tan);}
    camera.position.copy(controls.target).addScaledVector(direction,distance*1.12);controls.update();};
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();frame();}addEventListener('resize',resize);resize();
  // Labels track the actual shell centres and remain outside the rendered part.
  const marker=new T.Vector3(...nodes.middleSilencer),label=document.querySelector('#middle-label');
  const tick=()=>{controls.update();renderer.render(scene,camera);const p=marker.clone().project(camera);label.style.left=(p.x*.5+.5)*innerWidth+'px';label.style.top=(-p.y*.5+.5)*innerHeight+'px';requestAnimationFrame(tick);};
  window.audit={ready:true,nodes,renderer,frame,phase:${JSON.stringify(phase)}};tick();
`},bundle:true,write:false,format:'esm',target:'es2022'});
const document=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abgasanlage · Mittelschalldämpfer</title><style>*{box-sizing:border-box}body{margin:0;background:#18232a;color:#e6edf0;font:14px system-ui,sans-serif}#host{width:100vw;height:100vh}canvas{display:block;touch-action:none}header{position:absolute;left:28px;right:20px;top:25px;pointer-events:none}small{letter-spacing:.15em;color:#b8c8cf;font-size:11px}h1{font-size:25px;line-height:1.15;margin:9px 0}p{font-size:13px;color:#c2cdd2;margin:0}nav{position:absolute;left:28px;top:120px;display:flex;gap:8px}a{display:block;min-height:44px;padding:11px 18px;border:1px solid #53636d;background:#24333e;border-radius:7px;color:#e6edf0;text-decoration:none}a[aria-current=page]{background:#e7d8bc;color:#242c31;border-color:#e7d8bc}#middle-label{position:absolute;pointer-events:none;transform:translate(-50%,65px);font-size:12px;color:#f3d7a5;white-space:nowrap}#middle-label:before{content:'';position:absolute;width:1px;height:50px;background:#c8a66c;bottom:23px;left:50%}footer{position:absolute;left:28px;bottom:22px;right:20px;color:#bac8cf;font-size:12px;pointer-events:none}@media(max-width:600px){header{left:18px;top:18px}h1{font-size:22px}p{font-size:12px;max-width:315px}nav{top:143px;left:18px}footer{left:18px;font-size:11px}#middle-label{font-size:11px}}</style><header><small>M54B30 · ABGASWERKSTATT</small><h1>${phase==='vorher'?'Bisherige Position':'Mittelschalldämpfer weiter vorn'}</h1><p>${phase==='vorher'?'Ausgangsstand für den direkten Vergleich.':'Näher zum Motor, mehr Abstand zum Endschalldämpfer.'}</p></header><nav aria-label="Vergleich"><a href="./mittel-vorher.html" ${phase==='vorher'?'aria-current="page"':''}>Vorher</a><a href="./mittel-jetzt.html" ${phase==='jetzt'?'aria-current="page"':''}>Jetzt</a></nav><div id="host"></div><div id="middle-label">Mittelschalldämpfer</div><footer>Ziehen zum Drehen · Scrollen zum Zoomen<br>Lokale Geometrievorschau · Motor aus</footer><script type="module" src="./${name}.js"></script></html>`;
const deliveredDocument=junction?document.replaceAll('mittel-','uebergang-').replace('Abgasanlage · Mittelschalldämpfer','Abgasanlage · Krümmer–Kat Anschluss').replace('Bisherige Position','Bisheriger Anschluss').replace('Mittelschalldämpfer weiter vorn','Sauberer Übergang zum Kat').replace('Ausgangsstand für den direkten Vergleich.','Unteransicht des bisherigen Anschlusses.').replace('Näher zum Motor, mehr Abstand zum Endschalldämpfer.','Runder Stutzen mit gleichmäßigem Übergang in den Katkonus.').replace('</style>','#middle-label{display:none}</style>'):spacing?document.replaceAll('mittel-','abstand-').replace('Abgasanlage · Mittelschalldämpfer','Abgasanlage · Abstand und Katanschluss').replace('Bisherige Position','Ausgangsstand').replace('Mittelschalldämpfer weiter vorn','Mehr Abstand · gerader Katanschluss').replace('Näher zum Motor, mehr Abstand zum Endschalldämpfer.','Längere Rohrstrecke zwischen den Töpfen und senkrechte Katanschlüsse.'):document;
if(!process.argv.includes('--verify-only'))for(const dir of [output,delivery]){await writeFile(`${dir}/${name}.js`,bundle.outputFiles[0].text);await writeFile(`${dir}/${name}.html`,deliveredDocument);}
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('requestfailed',r=>failed.push(r.url()));
await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;requests.push(path);if(path.startsWith('/api/'))throw new Error('No native API in geometry review');return route.continue();});
try{
  await page.goto('http://127.0.0.1:4196/fachchat-motor-3d/'+name+'.html');await page.waitForFunction(()=>window.audit?.ready,undefined,{timeout:60000});await page.screenshot({path:`${output}/${phase}-desktop.png`,timeout:60000});
  if(spacing)await page.screenshot({path:`${output}/${phase}-katanschluss.png`,clip:{x:135,y:170,width:535,height:330},timeout:60000});
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(250);await page.screenshot({path:`${output}/${phase}-mobile.png`,timeout:60000});
  if(phase==='jetzt'){
    await page.getByRole('link',{name:'Vorher',exact:true}).click();await page.waitForFunction(({middle,rear,phase})=>window.audit?.ready&&(!phase||window.audit.phase===phase)&&window.audit.nodes.middleSilencer[0]===middle&&window.audit.nodes.rearSilencer[0]===rear,{middle:(spacing||junction)?475:555,rear:junction?878:728,phase:junction?'vorher':null},{timeout:60000});
    await page.getByRole('link',{name:'Jetzt',exact:true}).click();await page.waitForFunction(({middle,rear,phase})=>window.audit?.ready&&(!phase||window.audit.phase===phase)&&window.audit.nodes.middleSilencer[0]===middle&&window.audit.nodes.rearSilencer[0]===rear,{middle:475,rear:(spacing||junction)?878:728,phase:junction?'jetzt':null},{timeout:60000});
  }
  const result=await page.evaluate(()=>{const n=window.audit.nodes;return {middle:n.middleSilencer,rear:n.rearSilencer,gap:n.rearSilencer[0]-75-(n.middleSilencer[0]+55),straightCats:n.catalystInlets.every((a,i)=>[0,2].every(axis=>a[axis]===n.catalystOutlets[i][axis]&&a[axis]===n.exhaustCollectors[i][axis])),overflow:document.documentElement.scrollWidth>innerWidth,drawCalls:window.audit.renderer.info.render.calls};});
  await writeFile(`${output}/${phase}-audit.json`,JSON.stringify({errors,failed,requests,...result},null,2));console.log(JSON.stringify({phase,errors,failed,...result}));if(errors.length||failed.length||result.overflow)process.exitCode=1;
}finally{await browser.close();}
