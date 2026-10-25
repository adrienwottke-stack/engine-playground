import {PhysicalCore} from '../native/core-runtime.mjs';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {DEFAULT_TUNING,TUNING_PRESETS,tuningKey} from '../native/tuning-settings.mjs';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const project=fileURLToPath(new URL('../',import.meta.url));
const core=new PhysicalCore(project),clientId=randomUUID();
const config={
  sound:{...DEFAULT_SOUND},tuning:{...DEFAULT_TUNING},
  engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},
  vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012},
};
const command={clientId,claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}};
const report={recordedAt:new Date().toISOString(),checks:[],runs:[]};
let pcmBytes=0,pcmPeak=0;
const listener={writableLength:0,write(buffer){pcmBytes+=buffer.length;for(let i=0;i+1<buffer.length;i+=2)pcmPeak=Math.max(pcmPeak,Math.abs(buffer.readInt16LE(i)));return true;},destroy(){},end(){}};
core.clients.add(listener);
async function waitFor(predicate,message,timeout=15000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    await core.command(command);
    const snapshot=core.snapshot();
    if(predicate(snapshot))return snapshot;
    await new Promise(resolve=>setTimeout(resolve,90));
  }
  throw Error(message+': '+core.snapshot().reason);
}
const lift=s=>Math.max(...s.state.valveCurves.samples.flatMap(rows=>rows.map(pair=>pair[0])));
try{
  const baseline=await waitFor(s=>s.connected&&s.tuningKey===tuningKey(DEFAULT_TUNING)&&s.state?.valveCurves,'Serienzustand nicht bestätigt');
  report.baselineMaxIntakeLiftMm=lift(baseline);
  config.tuning={...TUNING_PRESETS.sport};
  const sport=await waitFor(s=>s.connected&&s.tuningKey===tuningKey(config.tuning)&&s.state?.valveCurves,'Sportteile nicht bestätigt');
  report.sportMaxIntakeLiftMm=lift(sport);
  assert.ok(report.sportMaxIntakeLiftMm>report.baselineMaxIntakeLiftMm+.5,'Sportnockenwellen erhöhen tatsächlichen nativen Ventilhub');
  report.checks.push('Nockenwellen verändern die vom C++-Kern gelieferten Ventilkurven');
  assert.equal(sport.state.ignition,false);
  report.checks.push('Teilewechsel wird aus frischer Telemetrie im gestoppten Zustand bestätigt');
  command.ignition=true;command.starter=true;
  const running=await waitFor(s=>s.connected&&s.state.rpm>850,'Sportmotor startet nicht',18000);
  command.starter=false;command.controls.throttle=.15;
  const accelerated=await waitFor(s=>s.connected&&s.state.rpm>1800&&s.state.fuelRateGS>0,'Sportmotor reagiert nicht auf Gas',15000);
  report.runs.push({selection:'sport',source:accelerated.state.source,rpm:accelerated.state.rpm,fuelRateGS:accelerated.state.fuelRateGS});
  report.checks.push('Getunter Motor startet und reagiert im nativen Kern auf Gas');
  for(let i=0;i<10;i++){await core.command(command);await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(pcmBytes>44100&&pcmPeak>50,'Native PCM-Ausgabe enthält ein nichtstummes Motorsignal');
  report.pcm={bytes:pcmBytes,peak:pcmPeak};
  report.checks.push('Nativer C++-Kern erzeugt nichtstummes PCM nach dem Tuning');
  command.ignition=false;command.starter=false;command.controls.throttle=0;config.tuning={...DEFAULT_TUNING};
  const restored=await waitFor(s=>s.connected&&s.tuningKey===tuningKey(DEFAULT_TUNING)&&s.state?.valveCurves,'Rückkehr zur Serie nicht bestätigt');
  assert.ok(Math.abs(lift(restored)-report.baselineMaxIntakeLiftMm)<.001);
  report.checks.push('Rückkehr zur Serie stellt die ursprünglichen nativen Ventilkurven wieder her');
  report.passed=true;
}catch(error){report.passed=false;report.error=error.message;throw error;}
finally{
  core.close();
  const directory=new URL('../evidence/garage-round/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('native-tuning.json',directory),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
