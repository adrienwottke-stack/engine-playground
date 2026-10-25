/** Isolated geometry comparison. No shared dist, native calls, or running motor. */
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='evidence/intake-variants-01';await mkdir(output,{recursive:true});
const html='<!doctype html><html lang="de"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#17252e;color:#e1eaf0;font:16px system-ui}header{padding:24px}h1{margin:0 0 8px;font-size:24px}p{margin:0;font-size:14px;color:#bdccd4}main{display:grid;grid-template-columns:1fr 1fr}section{min-width:0}h2{padding:0 24px;font-size:19px}canvas{display:block;width:100%}footer{padding:14px 24px;font-size:13px;color:#bdccd4}</style><header><h1>Ansaugung · Serie / Sport</h1><p>Isolierter Teilnachweis mit gleicher Kamera und gleichem Licht · keine Einbauaktion</p></header><main><section id="standard"><h2>Serie · bisherige Geometrie</h2></section><section id="sport"><h2>Sport · größerer Sammler</h2></section></main><footer>Eigene Darstellungsmaße, keine OEM-Sportbrücke oder Leistungsvalidierung. Drosselklappe und Kopfanschlüsse bleiben an ihrer Position.</footer></html>';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import * as T from 'three';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';import {createM54Intake} from './src/engine-3d-intake';
window.models=[];for(const intake of ['standard','sport']){
 const scene=new T.Scene();scene.background=new T.Color(0x17252e);const r=new T.WebGLRenderer({antialias:true});r.setSize(640,560);r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.15;document.querySelector('#'+intake).append(r.domElement);
 const pm=new T.PMREMGenerator(r),room=new RoomEnvironment();scene.environment=pm.fromScene(room,.04).texture;room.dispose();pm.dispose();scene.add(new T.HemisphereLight(0xdce9ef,0x52606b,1.5));const light=new T.DirectionalLight(0xfff2de,2.4);light.position.set(0,650,-700);scene.add(light);
 const model=createM54Intake(0,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}),{intake});scene.add(model.closed,model.cut,model.details,model.throttle);model.cut.visible=false;
 const camera=new T.OrthographicCamera(-460,460,402.5,-402.5,1,4000);camera.position.set(-750,700,-1050);camera.lookAt(-110,167,-225);r.render(scene,camera);window.models.push({model,r,scene,camera});
}window.audit={ready:true};window.cut=()=>{for(const {model,r,scene,camera} of window.models){model.closed.visible=false;model.cut.visible=true;r.render(scene,camera);}};
`},bundle:true,write:false,format:'esm',target:'es2022'});
await writeFile(`${output}/comparison.html`,html);await writeFile(`${output}/comparison.js`,bundle.outputFiles[0].text);
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html',body:html});});
try{await page.goto('http://127.0.0.1:4196/__intake-variants');await page.addScriptTag({type:'module',content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.audit?.ready);await page.screenshot({path:`${output}/series-sport.png`});await page.evaluate(()=>window.cut());await page.screenshot({path:`${output}/series-sport-cut.png`});await writeFile(`${output}/audit.json`,JSON.stringify({errors,requests},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({errors,output}));}finally{await browser.close();}
