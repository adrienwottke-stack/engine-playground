/**
 * Current EngineView/EngineThree integration, with the real workshop and controls.
 * Static inspection only: null telemetry, crank angle 1.1 rad, clock 0 s.
 * Run only after the component owners have released their source changes.
 * Builds into its own directory and serves it on a private ephemeral port.
 * No main.ts, motor process, API, control lease, audio, or shared port 4196.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {cp, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const delivery = resolve(project, 'dist/detail-r3-integrated');
const evidence = resolve(project, 'evidence/detail-r3-integrated');
const base = '/detail-r3-integrated/';
const readyTimeout = 180_000;
const pose = {state: null, crankAngleRad: 1.1, clockSeconds: 0, boreMm: 84, strokeMm: 89.6, rodMm: 135};
const report = {
  passed: false, nativeRun: false, audioRun: false, pose,
  scope: 'Actual EngineView -> EngineThree -> full workshop; static scene, no main.ts or physical telemetry.',
  flowLimit: 'Null telemetry deliberately produces no flowing media or combustion. Flow mode checks visibility only.',
  visibilityLimit: 'Group/material visibility is scene-graph visibility, not proof of on-screen pixels or lack of occlusion.',
  performanceLimit: 'Static captures only; graphics adapter is recorded, with no hardware FPS or real-time claim.',
  pageErrors: [], consoleErrors: [], requestFailures: [], httpFailures: [], forbiddenRequests: [], requests: [], captures: [],
};
let browser, server;
const hash = value => createHash('sha256').update(value).digest('hex');

// The wrapper only observes the actual instance; it does not replace geometry,
// materials, lighting, rendering, view selection, or the EngineView event paths.
const entry = String.raw`
import {EngineThree} from './src/engine-three';
import {installEngineView} from './src/engine-view';
import {copyConfig} from './src/model';
const cfg=copyConfig();
Object.assign(cfg.engine,{boreMm:84,strokeMm:89.6,rodMm:135});
cfg.sound.preset='m54';
const pose={state:null,crankAngleRad:1.1,clockSeconds:0};
let captured:EngineThree|null=null;
const originalCreate=EngineThree.create;
EngineThree.create=async (...args:Parameters<typeof originalCreate>)=>{
  captured=await originalCreate.apply(EngineThree,args);
  return captured;
};
const view=installEngineView();
const effective=(object:any):boolean=>!object?true:object.visible&&effective(object.parent);
const snapshot=()=>{
  const diagnostics=view.diagnostics(),engine=captured;
  if(!engine)return {diagnostics,pose};
  const groups:any[]=[],materials=new Map<any,any>();
  engine.scene.traverse((object:any)=>{
    const visible=effective(object);
    if(object.isGroup&&object.name)groups.push({name:object.name,localVisible:object.visible,sceneGraphVisible:visible});
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      const profile=material.userData.engineSurface;
      if(!profile)continue;
      let item=materials.get(material);
      if(!item){item={profile:profile.profile,revision:profile.revision,reflection:profile.reflection,
        metalness:material.metalness,roughness:material.roughness,envMapIntensity:material.envMapIntensity,
        vertexColors:material.vertexColors,transparent:material.transparent,opacity:material.opacity,
        meshes:0,sceneGraphVisibleMeshes:0,examples:[]};materials.set(material,item);}
      item.meshes++;if(visible)item.sceneGraphVisibleMeshes++;
      if(object.name&&item.examples.length<5&&!item.examples.includes(object.name))item.examples.push(object.name);
    }
  });
  return {diagnostics,pose,config:{engine:cfg.engine,tuning:cfg.tuning},host:{...engine.host.dataset},
    groups,materialProfiles:[...materials.values()],canvas:{width:engine.renderer.domElement.width,height:engine.renderer.domElement.height}};
};
(window as any).detailR3={view,snapshot};
function frame(){view.render(null,cfg,pose.crankAngleRad,pose.clockSeconds);requestAnimationFrame(frame);}
frame();
`;

const fixtureCss = `
*{box-sizing:border-box}html,body{margin:0;min-width:0;background:#101f2a;color:#e0e8ec;font:13px/1.45 system-ui}
body{--sans:system-ui,sans-serif}header{padding:12px 18px;border-bottom:1px solid #344b59}h1{font-size:18px;margin:0 0 4px}
header p{margin:0;max-width:1000px;color:#a9bdc8}.workspace,.engine-panel{min-width:0;width:100%}
[hidden]{display:none!important}.check-control{display:inline-flex;align-items:center}.engine-live{font-size:11px;color:#b8c9d1}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:750px){header{padding:10px 12px}h1{font-size:16px}header p{font-size:11px}}
`;
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M54B30 · integrierter Detailstand R3</title><link rel="icon" href="data:,"><link rel="stylesheet" href="./fixture.css"><link rel="stylesheet" href="./engine-fixture.css"></head>
<body class="classic-ui"><header><h1>M54B30 · integrierter Detailstand R3</h1><p>Statische Motorpose · Kurbelwinkel 1,1 rad · keine Motordaten, keine Audio- oder Kernverbindung. Echte Motoransicht mit aktueller Werkstattbeleuchtung.</p></header>
<main class="workspace" data-current-page="mechanics"><section class="engine-panel"><span class="engine-live">Statische Prüfansicht</span><label class="check-control"><input id="slow" type="checkbox" disabled><span>Zeitlupe</span></label></section></main>
<script type="module" src="./engine-fixture.js"></script></body></html>`;

try {
  await mkdir(delivery, {recursive: true});
  await mkdir(evidence, {recursive: true});
  const bundled = await build({
    absWorkingDir: project, stdin: {contents: entry, resolveDir: project, loader: 'ts'},
    bundle: true, write: false, format: 'esm', target: 'es2022', metafile: true,
    outfile: resolve(delivery, 'engine-fixture.js'), define: {'import.meta.env.BASE_URL': JSON.stringify(base)},
  });
  const inputs = Object.keys(bundled.metafile.inputs).filter(path => path !== '<stdin>');
  assert.ok(!inputs.some(path => /(?:^|[/\\])src[/\\](?:main|worker|audio|native-client)\.ts$/.test(path)), 'Unexpected application/backend entry in fixture');
  const manifest = {createdAt: new Date().toISOString(), pose, outputs: [], sources: [], emptyOutDir: false};
  for (const output of bundled.outputFiles) {
    const name = relative(delivery, output.path);
    assert.ok(name && !name.startsWith('..') && output.path.startsWith(delivery + sep));
    await mkdir(dirname(output.path), {recursive: true});
    await writeFile(output.path, output.contents);
    manifest.outputs.push({path: name, bytes: output.contents.byteLength, sha256: hash(output.contents)});
  }
  for (const path of inputs.filter(path => !path.includes('node_modules'))) {
    const contents = await readFile(resolve(project, path));
    manifest.sources.push({path, sha256: hash(contents)});
  }
  // Copy only static renderer resources, never native/audio entry scripts.
  for (const folder of ['models', 'textures']) await cp(resolve(project, 'public', folder), resolve(delivery, folder), {recursive: true});
  await writeFile(resolve(delivery, 'fixture.css'), fixtureCss);
  await writeFile(resolve(delivery, 'index.html'), html);
  await writeFile(resolve(evidence, 'source-manifest.json'), JSON.stringify(manifest, null, 2));

  const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.bin':'application/octet-stream','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png'};
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (!['GET','HEAD'].includes(request.method) || !pathname.startsWith(base)) {response.writeHead(404);response.end();return;}
      const file = resolve(delivery, pathname.slice(base.length) || 'index.html');
      if (!file.startsWith(delivery + sep) || !(await stat(file)).isFile()) {response.writeHead(404);response.end();return;}
      const contents = await readFile(file);
      response.writeHead(200, {'Content-Type':contentTypes[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch {response.writeHead(404);response.end();}
  });
  await new Promise((done, fail) => {server.once('error', fail);server.listen(0, '127.0.0.1', done);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  report.url = origin + base;
  browser = await chromium.launch({headless: true, args: ['--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1, serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    report.requests.push({method: request.method(), path: url.pathname});
    const forbidden = url.origin !== origin || !url.pathname.startsWith(base) || /\/(?:api|lease)(?:\/|$)|(?:native|engine)-audio|native-stream/i.test(url.pathname) || !['GET','HEAD'].includes(request.method());
    if (forbidden) {report.forbiddenRequests.push(request.url());return route.abort();}
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(readyTimeout);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') report.consoleErrors.push(message.text());});
  page.on('requestfailed', request => report.requestFailures.push({url:request.url(),failure:request.failure()?.errorText}));
  page.on('response', response => {if (response.status() >= 400) report.httpFailures.push({url:response.url(),status:response.status()});});
  await page.goto(report.url, {waitUntil:'domcontentloaded',timeout:readyTimeout});
  await page.waitForFunction(() => window.detailR3?.view.diagnostics().ready || window.detailR3?.view.diagnostics().failed, undefined, {timeout:readyTimeout});
  assert.equal(await page.evaluate(() => window.detailR3.view.diagnostics().failed), false, 'Actual EngineView initialization failed');

  async function settle(presentation, camera, minFrame = 0) {
    await page.waitForFunction(({presentation,camera,minFrame}) => {
      const d=window.detailR3.view.diagnostics(),host=document.querySelector('.engine-three-host');
      return d.ready&&!d.failed&&host.dataset.webgl==='ready'&&host.dataset.geometry==='84:89.6:135'&&d.scene.presentation===presentation&&d.scene.camera.preset===camera&&d.scene.frame>=minFrame;
    }, {presentation,camera,minFrame}, {timeout:readyTimeout});
  }
  async function capture(viewport, presentation, camera) {
    const before = await page.evaluate(() => window.detailR3.view.diagnostics().scene.frame);
    await settle(presentation, camera, before + 3);
    const snapshot = await page.evaluate(() => window.detailR3.snapshot());
    assert.equal(snapshot.diagnostics.component, 'engine');
    assert.equal(snapshot.diagnostics.scene.component, 'engine');
    assert.ok(snapshot.diagnostics.scene.assembly.revision > 0);
    assert.equal(snapshot.host.assemblyRevision, String(snapshot.diagnostics.scene.assembly.revision));
    assert.ok(snapshot.materialProfiles.some(material => material.profile === 'cast-aluminium'), 'Actual casting material profile is absent');
    const visibility = snapshot.diagnostics.scene.visibility;
    assert.equal(visibility.mechanical, presentation === 'cutaway');
    assert.equal(visibility.housing, presentation !== 'flow');
    assert.equal(visibility.extras, presentation !== 'flow');
    assert.equal(visibility.closedHousing, presentation === 'closed');
    assert.equal(visibility.studio, false);
    assert.ok(visibility.flowGroups.length === 5 && visibility.flowGroups.every(Boolean));
    assert.ok(snapshot.diagnostics.scene.routes.every(route => !route.stream && !route.particles), 'Null telemetry must not invent flow');
    if (presentation === 'flow') assert.ok(snapshot.diagnostics.scene.routes.every(route => !route.pipe));
    const ui = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth>innerWidth,
      presentation:document.querySelector('.engine-three-panel').dataset.presentation,
      pressed:[...document.querySelectorAll('[data-presentation][aria-pressed="true"]')].map(button=>button.dataset.presentation),
      camera:document.querySelector('#three-camera').value,
      controls:[...document.querySelectorAll('.three-presentations button,.three-views select,.three-views button')].map(node=>({label:node.getAttribute('aria-label')||node.textContent.trim(),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})),
    }));
    assert.equal(ui.overflow, false);assert.deepEqual(ui.pressed, [presentation]);assert.equal(ui.camera, camera);
    if (viewport === 'mobile') assert.ok(ui.controls.every(control => control.width >= 44 && control.height >= 44), 'Mobile renderer controls must be at least 44px');
    const screenshot = `${viewport}-${presentation}-${camera}.png`;
    await page.screenshot({path:resolve(evidence,screenshot),fullPage:true,timeout:readyTimeout});
    report.captures.push({viewport,presentation,camera,screenshot,ui,...snapshot});
    return snapshot;
  }
  for (const [viewport,size] of [['desktop',{width:1280,height:800}],['mobile',{width:375,height:812}]]) {
    await page.setViewportSize(size);
    await page.locator('[data-presentation="closed"]').click();
    for (const camera of ['intake','exhaust','front']) {
      await page.locator('#three-camera').selectOption(camera);
      await capture(viewport, 'closed', camera);
    }
    const beforeCamera = await page.evaluate(() => window.detailR3.view.diagnostics().scene.frame);
    await page.locator('#three-camera').selectOption('exhaust');
    await settle('closed','exhaust',beforeCamera + 3);
    const fixedCamera = await page.evaluate(() => window.detailR3.view.diagnostics().scene.camera);
    for (const presentation of ['cutaway','flow']) {
      await page.locator(`[data-presentation="${presentation}"]`).click();
      const snapshot = await capture(viewport,presentation,'exhaust');
      for (const key of ['position','target']) snapshot.diagnostics.scene.camera[key].forEach((value,index) => assert.ok(Math.abs(value-fixedCamera[key][index]) < 1e-5, 'Changing presentation moved the fixed camera'));
    }
    await page.locator('#three-camera-reset').click();
    await settle('flow','overview');
    assert.equal(await page.locator('#three-camera').inputValue(),'overview');
  }
  for (const key of ['pageErrors','consoleErrors','requestFailures','httpFailures','forbiddenRequests']) assert.deepEqual(report[key], [], key);
  report.passed = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  try {await browser?.close();} catch (error) {report.cleanupError=String(error);process.exitCode=1;}
  if (server?.listening) await new Promise(done => server.close(done));
  await mkdir(evidence, {recursive:true});
  await writeFile(resolve(evidence, 'browser-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({passed:report.passed,nativeRun:false,captures:report.captures.length,
    pageErrors:report.pageErrors,requestFailures:report.requestFailures,forbiddenRequests:report.forbiddenRequests,
    failure:report.failure,evidence:relative(project,evidence)}));
}
