/** Publish current visual work without adopting an unaccepted audio candidate. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,cp,readdir,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const project=resolve(import.meta.dirname,'..');
const run=resolve(project,'evidence/r7-live-20261025');
const release='r7-visual-audio03-20261025';
const remoteRoot='/opt/engine-playground/releases/'+release;
const ssh=['-o','BatchMode=yes','-o','ConnectTimeout=15','root@127.0.0.1'];
const hash=b=>createHash('sha256').update(b).digest('hex');
function execute(command,args,options={}){const r=spawnSync(command,args,{cwd:project,maxBuffer:220*1024*1024,...options});if(r.status!==0)throw new Error(`${command} failed (${r.status}): ${r.stderr?.toString().slice(-3000)}`);return r.stdout;}
const remote=code=>execute('ssh',[...ssh,'python3 -'],{input:code,encoding:'utf8'});
await mkdir(run,{recursive:true});
const action=process.argv[2];
if(action==='snapshot'){
  const snapshot=JSON.parse(remote(`import json,subprocess,os,hashlib\nr=lambda a:subprocess.check_output(a,text=True).strip()\nd=json.loads(r(['docker','inspect','engine-playground']))[0]\npaths=['/app/server.mjs','/app/native/core-runtime.mjs','/app/native/headless/bin/engine-core','/app/dist/native-audio.js','/app/dist/native-stream.js','/app/dist/engine-audio.js']\nhashes={p:r(['docker','exec','engine-playground','sha256sum',p]).split()[0] for p in paths}\npeers=[dict(name=c['Name'],id=c['Id'],restarts=c['RestartCount'],startedAt=c['State']['StartedAt']) for c in json.loads(r(['docker','inspect',*r(['docker','ps','-q']).split()])) if c['Name']!='/engine-playground']\nprint(json.dumps(dict(image=d['Config']['Image'],imageId=d['Image'],containerId=d['Id'],health=d['State'].get('Health',{}).get('Status'),shares=d['HostConfig']['CpuShares'],quota=d['HostConfig']['CpuQuota'],period=d['HostConfig']['CpuPeriod'],memory=d['HostConfig']['Memory'],current=os.readlink('/opt/engine-playground/current'),composeHash=hashlib.sha256(open('/opt/engine-playground/compose.yaml','rb').read()).hexdigest(),hashes=hashes,peers=peers)))`));
  assert.equal(snapshot.shares,2048);assert.equal(snapshot.quota,12000);assert.equal(snapshot.health,'healthy');
  await writeFile(resolve(run,'live-before.json'),JSON.stringify(snapshot,null,2));
  const tar=execute('ssh',[...ssh,'docker exec engine-playground tar -C /app -czf - dist']);
  await writeFile(resolve(run,'live-dist.tar.gz'),tar);
  await mkdir(resolve(run,'captured-live'),{recursive:true});
  execute('tar',['-xzf',resolve(run,'live-dist.tar.gz'),'-C',resolve(run,'captured-live')]);
  await mkdir(resolve(run,'entry-overlay'),{recursive:true});
  for(const file of ['main.ts','audio.ts'])await cp(resolve(project,'evidence/detail-r6-integration/before-src',file),resolve(run,'entry-overlay',file));
  const main=await readFile(resolve(run,'entry-overlay/main.ts'),'utf8');
  assert.ok(!main.includes('__nativeControlUpdate')&&!main.includes('native-control-client'));
  console.log(JSON.stringify({captured:true,image:snapshot.image,shares:snapshot.shares,bytes:tar.length,stableEntryOverlay:true}));
}else if(action==='package'){
  const before=JSON.parse(await readFile(resolve(run,'live-before.json'))),target=resolve(run,'package');
  await mkdir(target,{recursive:true});
  const preview=resolve(target,'automation-preview');
  await cp(resolve(project,'dist/automation-preview'),preview,{recursive:true,filter:src=>!src.replaceAll('\\','/').match(/\/native-control(?:-client)?\.js$/)});
  const html=(await readFile(resolve(preview,'index.html'),'utf8')).replace('<html lang="de">','<html lang="de" data-hosted-audio="true">');
  assert.ok(html.includes('data-hosted-audio="true"'));
  await writeFile(resolve(preview,'index.html'),html);await writeFile(resolve(target,'index.html'),html);
  for(const file of ['native-audio.js','native-stream.js','engine-audio.js']){
    const data=await readFile(resolve(run,'captured-live/dist',file));
    assert.equal(hash(data),before.hashes['/app/dist/'+file]);
    await writeFile(resolve(preview,file),data);
  }
  const published=[];
  for(const dir of ['flow-r6','intake-r7','exhaust-r6b','detail-r7-integrated']){
    await cp(resolve(project,'dist',dir),resolve(target,dir),{recursive:true});published.push('/'+dir+'/');
  }
  const sound=resolve(target,'zwischenstaende/klang');await mkdir(sound,{recursive:true});
  for(const file of ['previous.wav','clearer.wav'])await cp(resolve(project,'evidence/sound-m54-r6/round2',file),resolve(sound,file));
  const style='body{font:17px/1.55 system-ui,sans-serif;max-width:850px;margin:auto;padding:24px;background:#101820;color:#e6edf3}a{color:#8dd6ff}li{margin:16px 0}audio{width:100%;max-width:560px}small{color:#b6c3ce}h1{font-size:1.7rem}';
  await writeFile(resolve(sound,'index.html'),`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M54 · Klangzwischenstand</title><style>${style}</style><h1>M54 · lokaler Klangvergleich</h1><p>Dieselben berechneten Motordaten, zwei Filterabstimmungen. Die neuere Version reagiert auf das Feedback „zu dumpf“. Keine importierte Originaltonspur und keine bestätigte Übereinstimmung mit einem realen M54.</p><h2>Bisherige Abstimmung</h2><audio controls preload="none" src="previous.wav"></audio><h2>Hellere Abstimmung</h2><audio controls preload="none" src="clearer.wav"></audio><p>11,5 Sekunden je Clip. Dieser Dateivergleich ist vom laufenden Motor getrennt. Der neue Transport mit kürzerer Verzögerung ist noch in Prüfung.</p><p><a href="../index.html">Alle Zwischenstände</a></p></html>`);
  await writeFile(resolve(target,'zwischenstaende/index.html'),`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MotorSimulator · Zwischenstände 25.10.2026</title><style>${style}</style><h1>MotorSimulator · Zwischenstände</h1><p>Gesicherter Stand vom 25. Oktober 2026. Die Motoransicht enthält die gemeinsam integrierten Änderungen. Die Fachvergleiche zeigen zusätzlich die jeweiligen Vorherstände.</p><ul><li><a href="/?workshop=automation#mechanics">Gemeinsame Motorwerkstatt öffnen</a></li><li><a href="/intake-r7/index.html">Ansaugung R7 · Vorher/Nachher</a></li><li><a href="/flow-r6/after.html?play=1&amp;view=chamber">Gasfüllung · bewegte Brennraum-Demo</a><br><small>Illustrative, synthetische Phasen; kein räumlicher Drucksolver.</small></li><li><a href="/exhaust-r6b/index.html">Krümmer R6b · Vorher/Nachher</a></li><li><a href="/zwischenstaende/klang/index.html">Klang · zwei lokale Hörproben</a></li><li><a href="/detail-r7-integrated/after/index.html">Gemeinsame Ansicht ohne Motorkern</a></li></ul><p>Der bisherige Live-Audiotransport bleibt erhalten. Der neue Transport für schnellere Gasreaktion und lückenlosen Ton hat seine gemeinsame Abnahme noch nicht bestanden. CPU-Gewichtung: 2048.</p></html>`);
  await writeFile(resolve(target,'Dockerfile'),`FROM ${before.image}\nCOPY automation-preview /app/dist/automation-preview\nCOPY index.html /app/dist/index.html\nCOPY flow-r6 /app/dist/flow-r6\nCOPY intake-r7 /app/dist/intake-r7\nCOPY exhaust-r6b /app/dist/exhaust-r6b\nCOPY detail-r7-integrated /app/dist/detail-r7-integrated\nCOPY zwischenstaende /app/dist/zwischenstaende\n`);
  const manifest={release,baseImage:before.image,baseImageId:before.imageId,createdAt:new Date().toISOString(),cpuShares:2048,retainedHashes:before.hashes,published,files:[]};
  async function walk(dir){for(const d of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,d.name);if(d.isDirectory())await walk(path);else if(d.name!=='manifest.json')manifest.files.push({path:relative(target,path).replaceAll('\\','/'),sha256:hash(await readFile(path)),bytes:(await stat(path)).size});}}
  await walk(target);await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest,null,2));
  execute('tar',['-czf',resolve(run,'package.tar.gz'),'-C',target,'.']);
  console.log(JSON.stringify({release,files:manifest.files.length,archiveBytes:(await stat(resolve(run,'package.tar.gz'))).size}));
}else if(action==='upload'){
  remote(`import pathlib\np=pathlib.Path('${remoteRoot}');p.mkdir(exist_ok=True)\np=pathlib.Path('/opt/engine-playground/diagnostics-r7-20261025');p.mkdir(exist_ok=True)\nprint('Release directories ready')`);
  for(const file of ['package.tar.gz','live-before.json'])execute('scp',['-q','-o','BatchMode=yes',resolve(run,file),'root@127.0.0.1:/opt/engine-playground/diagnostics-r7-20261025/'+file]);
  execute('scp',['-q','-o','BatchMode=yes',resolve(project,'deploy/hetzner/release-r7-visual.py'),'root@127.0.0.1:/opt/engine-playground/diagnostics-r7-20261025/release.py']);
  console.log('Visual package uploaded; no public routing changed.');
}else if(['prepare','promote','rollback','status','cleanup'].includes(action)){
  console.log(execute('ssh',[...ssh,'python3 /opt/engine-playground/diagnostics-r7-20261025/release.py '+action],{encoding:'utf8'}));
}else throw new Error('Expected snapshot, package, upload, prepare, promote, rollback, status or cleanup');
