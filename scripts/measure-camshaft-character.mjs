import {PhysicalCore} from '../native/core-runtime.mjs';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {completeTuningSupport,validateTuning,tuningKey,tuningParameters} from '../native/tuning-settings.mjs';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const phase=process.argv[2]||'before';if(!/^[a-z0-9-]+$/.test(phase))throw Error('Ungültige Phase.');
const folder='evidence/camshaft-character';await mkdir(folder,{recursive:true});
const core=new PhysicalCore(fileURLToPath(new URL('../',import.meta.url)));
const support=completeTuningSupport({revLimit:'race'});
const config={sound:{...DEFAULT_SOUND},tuning:validateTuning(),engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012}};
const cmd={clientId:'camshaft-native-proof',claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:0,brake:0}};
const report={phase,recordedAt:new Date().toISOString(),commonSupport:support,upperRangeFixture:{crankInertiaKgM2:3,brakeNm:150},runs:[]};
let recording=false,pcm=[];core.clients.add({writableLength:0,write(b){if(recording)pcm.push(Buffer.from(b));return true;},destroy(){},end(){}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function tick(){await core.command(cmd);await sleep(15);return core.snapshot();}
async function wait(predicate,label,timeout=16000){const until=Date.now()+timeout;while(Date.now()<until){const s=await tick();if(predicate(s))return s;}throw Error(label+': '+core.reason+' '+JSON.stringify({rpm:core.state?.rpm,throttle:core.state?.actualThrottle,ignition:core.state?.ignition,dyno:core.state?.dynoNm,t:core.state?.t})+' '+core.stderr);}
async function collect(seconds){let start=null,rows=[];while(true){const s=await tick();if(!s.connected||s.state.t===rows.at(-1)?.t)continue;if(start===null)start=s.state.t;rows.push({t:s.state.t,rpm:s.state.rpm,torque:s.state.torqueNm,manifoldKpa:s.state.manifoldKpa});if(s.state.t-start>=seconds)return rows;}}
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length),sd=a=>Math.sqrt(mean(a.map(x=>(x-mean(a))**2)));
function audioStats(buf){const rms=[];const window=4410;for(let offset=0;offset+window*2<=buf.length;offset+=window*2){let e=0;for(let i=0;i<window;i++){const x=buf.readInt16LE(offset+i*2)/32768;e+=x*x;}rms.push(Math.sqrt(e/window));}return{envelopeCv:sd(rms)/Math.max(1e-9,mean(rms)),rms:mean(rms)};}
function wav(buf){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(buf.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(44100,24);h.writeUInt32LE(88200,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(buf.length,40);const quiet=Buffer.from(buf);for(let i=0;i+1<quiet.length;i+=2)quiet.writeInt16LE(Math.round(quiet.readInt16LE(i)*.08),i);return Buffer.concat([h,quiet]);}
async function hold(target,opening=.2){
 cmd.controls.dynoEnabled=true;cmd.controls.throttle=Math.pow(opening,1/tuningParameters(config.tuning).throttleGamma);cmd.controls.dynoNm=0;
 let integral=0,last=null,stable=0,rows=[],start=null;const until=Date.now()+10000;
 while(Date.now()<until){const s=await tick();if(!s.connected)continue;const e=s.state.rpm-target,dt=last?Math.max(.01,s.state.t-last.t):.05;last=s.state;
  integral=Math.max(-1500,Math.min(1500,integral+e*dt));cmd.controls.dynoNm=Math.max(0,Math.min(200,120+e*.15+integral*.08));
  stable=Math.abs(e)<130?stable+1:0;if(start===null&&stable>=6)start=s.state.t;
  if(start!==null){rows.push({rpm:s.state.rpm,torque:s.state.torqueNm,dynoNm:s.state.dynoNm});if(s.state.t-start>1.4)return rows;}
 }return rows;
}
try{
 for(const camshaft of (process.env.EP_CAM_CASES||'standard,sport,supersport,race').split(',')){
  for(const port of [4196,4198]){const other=await fetch(`http://127.0.0.1:${port}/api/core/state`,{signal:AbortSignal.timeout(1200)}).then(r=>r.json()).catch(()=>null);if(other?.state?.ignition||other?.state?.starter)throw Error('Vorschau wird benutzt; keine parallele Lastprüfung.');}
  config.tuning=validateTuning({...support,camshaft});cmd.ignition=false;cmd.starter=false;cmd.controls.throttle=0;cmd.controls.dynoEnabled=false;cmd.reset=true;await core.command(cmd);cmd.reset=false;
  await wait(s=>s.connected&&s.tuningKey===tuningKey(config.tuning)&&!s.state.ignition,'Einbau');
  if(phase.startsWith('before')){
   const oldDuration={standard:[210,210],sport:[224,220],supersport:[234,228],race:[246,240]}[camshaft];
   const path=resolve(core.assetsDirectory,'runtime_i6.mr');let script=await readFile(path,'utf8');
   for(const [index,suffix]of ['int','exh'].entries()){
    script=script.replace(new RegExp(`(public node m54b30_lobe_profile_${suffix} \\{[\\s\\S]*?duration_at_50_thou: )[\\d.]+`),`$1${oldDuration[index]}`);
    script=script.replace(new RegExp(`(public node m54b30_lobe_profile_${suffix} \\{[\\s\\S]*?gamma: )[\\d.]+`),'$10.8');
   }
   script=script.replace(/input intake_lobe_center: [^;]+;/,'input intake_lobe_center: lobe_separation;').replace(/input exhaust_lobe_center: [^;]+;/,'input exhaust_lobe_center: 105.0 * units.deg;');
   await writeFile(path,script);await writeFile(`${folder}/${phase}-${camshaft}.mr`,script);cmd.reset=true;await core.command(cmd);cmd.reset=false;await wait(s=>s.connected&&!s.state.ignition&&s.state.t<.3,'Altes Nockenprofil');
  }
  // Match the app's four-second automatic starter, with no hidden gas input.
  // A racing idle below850rpm is not a failed start: check after starter release.
  cmd.ignition=true;cmd.starter=true;cmd.controls.throttle=0;await collect(4);cmd.starter=false;
  await collect(3);pcm=[];recording=true;const idle=await collect(5);recording=false;const audio=Buffer.concat(pcm);
  await writeFile(`${folder}/${phase}-${camshaft}-idle.wav`,wav(audio));
  await writeFile(`${folder}/${phase}-${camshaft}-idle.json`,JSON.stringify({idleMeanRpm:mean(idle.map(x=>x.rpm)),idleRpmSd:sd(idle.map(x=>x.rpm)),audio:audioStats(audio),rows:idle},null,2));
  console.log(JSON.stringify({checkpoint:'idle',camshaft,rpm:mean(idle.map(x=>x.rpm)),sd:sd(idle.map(x=>x.rpm)),audio:audioStats(audio)}));
  if(mean(idle.map(x=>x.rpm))<400)throw Error(camshaft+' hält keinen selbständigen Leerlauf nach Anlasserfreigabe.');
  // A common extra inertial load gives enough native samples for a fair
  // upper-range sweep. Only this private test script changes; app inertia stays.
  const fixturePath=resolve(core.assetsDirectory,'runtime_i6.mr');let fixtureScript=await readFile(fixturePath,'utf8');
  fixtureScript=fixtureScript.replace(/(crankshaft c0\([\s\S]*?moment_of_inertia: )[^,\n]+/,'$13.0');
  await writeFile(fixturePath,fixtureScript);await writeFile(`${folder}/${phase}-${camshaft}-fixture.mr`,fixtureScript);
  cmd.ignition=false;cmd.controls.throttle=0;cmd.reset=true;await core.command(cmd);cmd.reset=false;
  await wait(s=>s.connected&&!s.state.ignition&&s.state.t<.3,'Prüfstand-Rücksetzung');
  cmd.ignition=true;cmd.starter=true;cmd.controls.throttle=.08;await wait(s=>s.connected&&s.state.rpm>850,'Prüfstand-Start');cmd.starter=false;
  const high=[],mid=[];
  cmd.controls.dynoEnabled=false;cmd.controls.dynoNm=150;cmd.controls.throttle=1;
  const startSweep=await wait(s=>s.connected&&s.state.rpm>4200,'Hochdrehen '+camshaft);
  cmd.controls.dynoEnabled=true;
  const rise=[{t:startSweep.state.t,rpm:startSweep.state.rpm,torque:startSweep.state.torqueNm}];const deadline=Date.now()+16000;
  while(Date.now()<deadline){const s=await tick();if(!s.connected||s.state.t===rise.at(-1)?.t)continue;rise.push({t:s.state.t,rpm:s.state.rpm,torque:s.state.torqueNm});if(s.state.rpm>6500)break;}
  const cross=rpm=>{for(let i=1;i<rise.length;i++){const a=rise[i-1],b=rise[i];if(a.rpm<rpm&&b.rpm>=rpm)return a.t+(b.t-a.t)*(rpm-a.rpm)/(b.rpm-a.rpm);}return null;};
  const low=cross(5000),upper=cross(6200),top=rise.filter(x=>x.rpm>=5000&&x.rpm<=6500);
  const run={camshaft,params:tuningParameters(config.tuning),idleMeanRpm:mean(idle.map(x=>x.rpm)),idleRpmSd:sd(idle.map(x=>x.rpm)),idleMinRpm:Math.min(...idle.map(x=>x.rpm)),idleMaxRpm:Math.max(...idle.map(x=>x.rpm)),idleAudio:audioStats(audio),highRpm:mean(top.map(x=>x.rpm)),highTorqueNm:mean(top.map(x=>x.torque)),highCount:top.length,rise5000to6200S:low!==null&&upper!==null?upper-low:null,idle,high,mid,rise};
  report.runs.push(run);console.log(JSON.stringify(Object.fromEntries(Object.entries(run).filter(([k])=>!['idle','high','mid','rise','params'].includes(k)))));
 }
}finally{core.close();await writeFile(`${folder}/${phase}.json`,JSON.stringify(report,null,2));}
