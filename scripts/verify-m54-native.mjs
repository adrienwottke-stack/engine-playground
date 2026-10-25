import {PhysicalCore} from '../native/core-runtime.mjs';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {DEFAULT_TUNING,TUNING_PRESETS,tuningKey} from '../native/tuning-settings.mjs';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const core=new PhysicalCore(fileURLToPath(new URL('../',import.meta.url)));
const config={sound:{...DEFAULT_SOUND},tuning:{...DEFAULT_TUNING},engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012}};
const command={clientId:randomUUID(),claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}};
const report={recordedAt:new Date().toISOString(),engine:'M54B30 workshop physical model',runs:[],passed:false};
let pcmBytes=0,pcmPeak=0;
core.clients.add({writableLength:0,write(b){pcmBytes+=b.length;for(let i=0;i<b.length;i+=2)pcmPeak=Math.max(pcmPeak,Math.abs(b.readInt16LE(i)));return true;},end(){},destroy(){}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,description,timeout=25000){
  const end=Date.now()+timeout;
  while(Date.now()<end){await core.command(command);const s=core.snapshot();if(predicate(s))return s;await delay(35);}
  throw Error(description+': '+JSON.stringify({reason:core.snapshot().reason,rpm:core.snapshot().state?.rpm,stderr:core.stderr}));
}
const lift=s=>Math.max(...s.state.valveCurves.samples.flatMap(row=>row.map(pair=>pair[0])));
try{
  for(const [name,selection] of [['series',DEFAULT_TUNING],['sport',TUNING_PRESETS.sport]]){
    command.ignition=false;command.starter=false;command.controls.throttle=0;config.tuning={...selection};
    const stopped=await until(s=>s.connected&&s.tuningKey===tuningKey(selection)&&s.state?.valveCurves,'No confirmed selection');
    assert.equal(stopped.state.engineName,'BMW M54B30');
    assert.ok(Math.abs(stopped.state.geometry.strokeMm-89.6)<.001);
    assert.ok(Math.abs(stopped.state.geometry.boreMm-84)<.001);
    const intakeLiftMm=lift(stopped);assert.ok(Math.abs(intakeLiftMm-(name==='series'?9.7:10.4))<.01);
    command.ignition=true;command.starter=true;
    await until(s=>s.state?.rpm>800,'M54 fails to start');
    command.starter=false;command.controls.throttle=1;
    await until(s=>s.state?.rpm>=6475,'M54 does not reach its limiter');
    const samples=[],end=Date.now()+6500;let last=-1;
    while(Date.now()<end){await core.command(command);const s=core.snapshot().state;if(s&&s.t!==last){samples.push({t:s.t,rpm:s.rpm,torqueNm:s.torqueNm,ignition:s.ignition});last=s.t;}await delay(20);}
    const steady=samples.filter(s=>s.t>samples[0].t+1);
    assert.ok(steady.length>40,'Enough fresh native samples for limiter acceptance');
    const minRpm=Math.min(...steady.map(s=>s.rpm)),maxRpm=Math.max(...steady.map(s=>s.rpm));
    const rangeRpm=maxRpm-minRpm;
    report.runs.push({name,geometry:stopped.state.geometry,intakeLiftMm,minRpm,maxRpm,rangeRpm,samples});
    assert.ok(maxRpm<6700&&maxRpm>6460,'Limiter near6500rpm');
    assert.ok(minRpm>6150&&rangeRpm<350,'Short limiter flutter, no long500rpm fall');
  }
  assert.ok(pcmBytes>88200&&pcmPeak>50,'Non-silent native PCM');
  report.pcm={bytes:pcmBytes,peak:pcmPeak};report.passed=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
  command.ignition=false;command.starter=false;command.controls.throttle=0;
  try{await core.command(command);await delay(100);}catch{}
  core.close();
  const directory=new URL('../evidence/garage-refinement-02/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('native-m54-limiter.json',directory),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,runs:report.runs.map(({samples,...run})=>({...run,sampleCount:samples.length}))}));
}
