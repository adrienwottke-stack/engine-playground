// Private server only: verify actual Linux M54 + stopped tuning + short start.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {DEFAULT_TUNING,TUNING_PRESETS,tuningKey} from '../native/tuning-settings.mjs';
const origin='http://127.0.0.1:4195';
const health=await fetch(origin+'/api/health').then(r=>r.json());
assert.equal(health.release,'r7-visual-audio03-20261025-preview');
const config={sound:{...DEFAULT_SOUND},tuning:{...DEFAULT_TUNING},engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012}};
const command={clientId:crypto.randomUUID(),claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}};
const report={passed:false,privateOnly:true,audioRun:false,health,samples:[]};
async function send(){const r=await fetch(origin+'/api/core/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://engine.127.0.0.1.sslip.io'},body:JSON.stringify(command)});const body=await r.json();assert.equal(r.status,202,JSON.stringify(body));assert.equal(body.accepted,true,JSON.stringify(body));}
async function wait(predicate,message,seconds=20){const end=Date.now()+seconds*1000;while(Date.now()<end){await send();const s=await fetch(origin+'/api/core/state').then(r=>r.json());if(s.connected){report.samples.push({rpm:s.state.rpm,geometry:s.state.geometry,tuningKey:s.tuningKey,ignition:s.state.ignition,starter:s.state.starter});if(predicate(s))return s;}await new Promise(r=>setTimeout(r,180));}throw Error(message);}
try{
 const stock=await wait(s=>s.tuningKey===tuningKey(DEFAULT_TUNING)&&s.state.valveCurves,'M54 stock boot/curves missing');
 assert.deepEqual(stock.state.geometry,{boreMm:84,strokeMm:89.6,rodMm:135});
 assert.equal(stock.state.simulationHz,4000);
 const lift=s=>Math.max(...s.state.valveCurves.samples.flatMap(rows=>rows.map(pair=>pair[0])));
 report.stockLift=lift(stock);
 config.tuning={...TUNING_PRESETS.sport};
 const sport=await wait(s=>s.tuningKey===tuningKey(config.tuning)&&s.state.valveCurves,'Sport tuning confirmation missing');
 report.sportLift=lift(sport);assert.ok(report.sportLift>report.stockLift+.5);
 config.tuning={...DEFAULT_TUNING};await wait(s=>s.tuningKey===tuningKey(DEFAULT_TUNING),'Return to series missing');
 command.ignition=true;command.starter=true;
 const cranking=await wait(s=>s.state.rpm>600,'M54 failed to crank');report.crankingRpm=cranking.state.rpm;
 command.starter=false;await send();
 const started=Date.now();await wait(s=>Date.now()-started>2000&&s.state.rpm>500&&!s.state.starter,'M54 did not run after starter release',10);
 report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{command.ignition=false;command.starter=false;command.active=false;try{await send();}catch(e){report.stopFailure=String(e);report.passed=false;process.exitCode=1;}await mkdir('evidence/r7-live-20261025',{recursive:true});await writeFile('evidence/r7-live-20261025/native-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,stockLift:report.stockLift,sportLift:report.sportLift,crankingRpm:report.crankingRpm,audioRun:false,failure:report.failure}));}
