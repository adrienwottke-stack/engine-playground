import {PhysicalCore} from '../native/core-runtime.mjs';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {DEFAULT_TUNING,tuningKey,tuningParameters,completeTuningSupport,validateTuning} from '../native/tuning-settings.mjs';
import {TUNING_CATALOG,choosePart} from '../src/tuning-catalog.ts';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const core=new PhysicalCore(fileURLToPath(new URL('../',import.meta.url)));
const config={sound:{...DEFAULT_SOUND},tuning:validateTuning(),engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012}};
const command={clientId:'tuning-expanded-native-proof',claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}};
const report={recordedAt:new Date().toISOString(),passed:false,compiled:[],runs:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(predicate,label,timeout=16000){const end=Date.now()+timeout;while(Date.now()<end){await core.command(command);const s=core.snapshot();if(predicate(s))return s;await sleep(80);}throw Error(label+': '+core.reason+' '+core.stderr);}
async function install(selection){config.tuning=validateTuning(selection);command.ignition=false;command.starter=false;command.controls.throttle=0;return wait(s=>s.connected&&s.tuningKey===tuningKey(config.tuning)&&s.state.valveCurves,'Einbau');}
try{
 await install(DEFAULT_TUNING);
 for(const slot of TUNING_CATALOG)for(const part of slot.options){
  if(part.value===DEFAULT_TUNING[slot.key])continue;
  const selection=completeTuningSupport(choosePart(DEFAULT_TUNING,slot.key,part.value)),s=await install(selection);
  const lift=Math.max(...s.state.valveCurves.samples.flatMap(rows=>rows.map(row=>row[0])));
  assert.ok(Math.abs(lift-tuningParameters(selection).intakeLiftMm)<.12,part.name+' Ventilhub');
  report.compiled.push({part:part.name,key:tuningKey(selection),nativeLiftMm:lift});
 }
 console.log('Alle Einzelvarianten nativ geladen:',report.compiled.length);
 // Do not start load tests while the shared motor is being used by another chat.
 const shared=await fetch('http://127.0.0.1:4196/api/core/state').then(r=>r.json()).catch(()=>null);
 if(shared?.state?.ignition||shared?.state?.starter){report.loadSkipped='Gemeinsamer Motor aktiv; keine parallele Lastprüfung.';}
 else{
  for(const [name,selection]of [['Racing-Ventiltrieb',completeTuningSupport({camshaft:'race',intake:'sport',exhaust:'sport',idle:'raised'})],['Einzeldrosseln & Racing-Kopf',completeTuningSupport({camshaft:'supersport',throttleBody:'itb',runners:'short',head:'race',seats:'multiangle',valves:'large',pistons:'high',rods:'light',exhaust:'race',mixture:'power',ignition:'race',camTiming:'topend',idle:'raised'})]]){
   await install(selection);command.ignition=true;command.starter=true;command.controls.throttle=.08;
   await wait(s=>s.connected&&s.state.rpm>900,name+' startet nicht');command.starter=false;command.controls.throttle=1;
   const target=tuningParameters(selection).redlineRpm,rows=[];
   await wait(s=>s.connected&&s.state.rpm>target-450,name+' erreicht Drehzahl nicht',22000);
   for(let i=0;i<24;i++){await core.command(command);await sleep(90);const s=core.snapshot();if(s.connected)rows.push({rpm:s.state.rpm,torqueNm:s.state.torqueNm,manifoldKpa:s.state.manifoldKpa});}
   assert.ok(rows.length>10);assert.ok(Math.max(...rows.map(x=>x.rpm))>target-450);assert.ok(Math.max(...rows.map(x=>x.rpm))<target+600);
   report.runs.push({name,targetRedlineRpm:target,minRpm:Math.min(...rows.map(x=>x.rpm)),maxRpm:Math.max(...rows.map(x=>x.rpm)),samples:rows});
   command.ignition=false;command.controls.throttle=0;await core.command(command);
  }
 }
 await install(DEFAULT_TUNING);report.passed=true;
}finally{core.close();await mkdir('evidence/tuning-sauger',{recursive:true});await writeFile('evidence/tuning-sauger/native.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,compiled:report.compiled.length,runs:report.runs.map(({samples,...rest})=>rest),loadSkipped:report.loadSkipped}));
