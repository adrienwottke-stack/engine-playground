// Isolated GPU/SwiftShader smoke test, with no native process or running app.
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = `import * as T from 'three';
import {createFlowMaterial,attachFlowAttributes,createFlameMaterial,flameFrontPoint,createExhaustPlumes} from './src/engine-render-effects';
const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(720,420);renderer.setClearColor(0x112633);document.body.append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(37,720/420,1,2000);camera.position.set(150,190,380);camera.lookAt(25,35,0);
const flow=createFlowMaterial('air',0x377fff),curve=new T.CatmullRomCurve3([new T.Vector3(-170,-20,0),new T.Vector3(-100,-35,0),new T.Vector3(0,-20,0),new T.Vector3(110,-30,0)]);
flow.uniforms.uFlow.value[0].set(.7,.22);scene.add(new T.Mesh(attachFlowAttributes(new T.TubeGeometry(curve,64,10,10),0,curve.getLength()),flow));
for(const [column,progress] of [[-90,.06],[0,.45],[90,.82]]){
 const count=512,buffer=new Float32Array(count*3);for(let i=0;i<count;i++){const p=flameFrontPoint(i,count,progress,37.5,65);buffer.set([column+p.x,78+p.y,p.z],i*3);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(buffer,3));geometry.setAttribute('seed',new T.BufferAttribute(Float32Array.from({length:count},(_,j)=>(j+.5)/count),1));
 const material=createFlameMaterial();Object.assign(material.uniforms.uProgress,{value:progress});material.uniforms.uHeat.value=.7;material.uniforms.uPressure.value=.7;material.uniforms.uPointScale.value=420/(2*Math.tan(Math.PI*37/360));scene.add(new T.Points(geometry,material));
 const gas=new T.Mesh(new T.CylinderGeometry(37.5,37.5,65,32),new T.MeshBasicMaterial({color:0xdf8f3f,transparent:true,opacity:.13,depthWrite:false}));gas.position.set(column,45.5,0);scene.add(gas);
}
const plume=createExhaustPlumes([new T.Vector3(90,-60,-18),new T.Vector3(90,-60,18)],[new T.Vector3(1,0,0),new T.Vector3(1,0,0)]);plume.flow.set(.6,.6);plume.material.uniforms.uTime.value=1.8;plume.material.uniforms.uPointScale.value=420/(2*Math.tan(Math.PI*37/360));plume.points.visible=true;scene.add(plume.points);
renderer.render(scene,camera);window.result={programs:renderer.info.programs.length,drawCalls:renderer.info.render.calls,error:renderer.getContext().getError()};`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => window.result);
  assert.deepEqual(errors, []); assert.equal(result.error, 0); assert.equal(result.drawCalls, 8);
  await mkdir('evidence/garage-round-2', { recursive: true });
  await page.screenshot({ path: 'evidence/garage-round-2/render-effects-preview.png' });
  console.log(JSON.stringify({ passed: true, ...result, source: 'isolated illustrative renderer fixtures, no native state' }));
} finally { await browser.close(); }
