import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const stage=process.argv[2]??'after',out='dist/detail-block-r3',evidence='evidence/detail-block-r3';
await mkdir(out,{recursive:true});await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createM54Casting} from './src/engine-3d-casting';
import {assemblyDimensions} from './src/engine-3d-model';import {copyConfig} from './src/model';
const cfg=copyConfig();Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
const materials=Object.fromEntries(['cast','machined','steel','black','rubber','brass','cut'].map(k=>[k,new T.MeshStandardMaterial({color:0xaaaaaa,metalness:.05,roughness:.72,side:T.DoubleSide})]));
const casting=createM54Casting({...assemblyDimensions(cfg),materials});
const block=casting.closed.children[0],cut=casting.cutBlock;
// Neutral override: isolate geometry differences from the separate material work.
for(const root of [block,cut])root.traverse(o=>{if(o.isMesh){o.material=materials.cast;}});
const scene=new T.Scene();scene.background=new T.Color(0x202a32);scene.add(block,cut);
scene.add(new T.HemisphereLight(0xffffff,0x526070,2));
for(const [x,y,z,intensity] of [[-350,650,-550,3],[450,200,500,1.5]]){const l=new T.DirectionalLight(0xffffff,intensity);l.position.set(x,y,z);scene.add(l);}
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;document.querySelector('#host').append(renderer.domElement);
const camera=new T.PerspectiveCamera(35,1,1,10000),controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,84,0);
let selected='intake';
function frame(view=selected){selected=view;block.visible=view!=='cut';cut.visible=view==='cut';const direction={intake:[-.38,.43,-1],front:[-1,.22,.5],cut:[-.32,.32,1]}[view];camera.position.set(...direction).normalize().multiplyScalar(innerWidth<600?1700:1200).add(controls.target);controls.update();document.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));renderer.render(scene,camera);}
function resize(){const r=document.querySelector('#host').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();frame();}
document.querySelectorAll('button').forEach(b=>b.onclick=()=>frame(b.dataset.view));addEventListener('resize',resize);resize();controls.addEventListener('change',()=>renderer.render(scene,camera));
window.audit={ready:true,renderer,frame,block,cut};
`},plugins:['before','feedback-before'].includes(stage)?[{name:'frozen-before',setup(b){b.onLoad({filter:/[\\/]src[\\/]engine-3d-(block|casting)\.ts$/},async({path})=>({contents:await readFile(`${evidence}/${stage==='before'?'before':'before-feedback'}/${path.split(/[\\/]/).pop()}`,'utf8'),loader:'ts',resolveDir:`${process.cwd()}/src`}));}}]:[],bundle:true,write:false,format:'esm',target:'es2022'});
await writeFile(`${out}/${stage}.js`,bundle.outputFiles[0].text);
await writeFile(`${out}/${stage}.html`,`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Block Runde 3 · ${stage}</title><style>*{box-sizing:border-box}body{margin:0;background:#202a32;color:#eef1f3;font:14px system-ui}header{padding:20px}h1{font-size:23px;margin:0 0 8px}p{margin:0;max-width:650px;color:#c4cdd3}nav{display:flex;gap:8px;padding:0 20px;flex-wrap:wrap}button{min-height:44px;padding:8px 15px;background:#354653;border:1px solid #798a97;border-radius:6px;color:white;font:inherit}button[aria-pressed=true]{background:#cfba90;color:#202a32}#host{height:calc(100dvh - 195px);min-height:350px}canvas{display:block;touch-action:none}footer{padding:8px 20px;font-size:12px;color:#c4cdd3}@media(max-width:500px){h1{font-size:20px}header{padding:16px}#host{height:calc(100dvh - 240px)}nav{padding:0 16px}button{padding:8px 10px}}</style><header><h1>M54B30 · Blockform · ${stage==='before'?'Vorher':'Nachher'}</h1><p>Neutrales Formlabor · identische Kamera und Beleuchtung · Außenform nach Fotos angenähert</p></header><nav><button data-view="intake">Ansaugseite</button><button data-view="front">Stirnseite</button><button data-view="cut">Schnitt</button></nav><div id="host"></div><footer>Ziehen zum Drehen · rein statische Geometrie · keine Verbindung zum Motorkern</footer><script type="module" src="./${stage}.js"></script></html>`);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));
await page.route('**/*',route=>{const p=new URL(route.request().url()).pathname;requests.push(p);if(p.startsWith('/api/')||p.includes('lease'))return route.abort();return route.continue();});
try{await page.goto(`http://127.0.0.1:4196/detail-block-r3/${stage}.html`);await page.waitForFunction(()=>window.audit?.ready);
for(const view of ['intake','front','cut']){await page.getByRole('button',{name:{intake:'Ansaugseite',front:'Stirnseite',cut:'Schnitt'}[view],exact:true}).click();await page.screenshot({path:`${evidence}/${stage}-${view}.png`});}
await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Ansaugseite',exact:true}).click();await page.screenshot({path:`${evidence}/${stage}-mobile.png`});
const audit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,drawCalls:window.audit.renderer.info.render.calls,triangles:window.audit.renderer.info.render.triangles,buttons:[...document.querySelectorAll('button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height}))}));
await writeFile(`${evidence}/${stage}-browser.json`,JSON.stringify({errors,requests,...audit},null,2));console.log(JSON.stringify({stage,errors,...audit}));if(errors.length||audit.overflow)process.exitCode=1;
}finally{await browser.close();}
