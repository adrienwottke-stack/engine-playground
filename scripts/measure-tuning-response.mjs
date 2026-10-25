import {PhysicalCore} from '../native/core-runtime.mjs';
import {DEFAULT_SOUND} from '../native/reference-settings.mjs';
import {validateTuning,completeTuningSupport,tuningKey,tuningParameters} from '../native/tuning-settings.mjs';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const phase=process.argv[2]||'before',folder='evidence/tuning-response';
if(!['before','after'].includes(phase))throw Error('Phase before oder after angeben.');
const project=fileURLToPath(new URL('../',import.meta.url)),core=new PhysicalCore(project);
const config={sound:{...DEFAULT_SOUND},tuning:validateTuning(),engine:{boreMm:84,strokeMm:89.6,rodMm:135,flywheelKgM2:.18,throttleLagS:0},vehicle:{massKg:1450,finalDrive:3.15,wheelRadiusM:.31,gears:[4.2,2.5,1.65,1.2,1],dragAreaM2:.65,rollingCoefficient:.012}};
const cmd={clientId:'tuning-response-measurement',claim:true,active:true,ignition:false,starter:false,reset:false,config,controls:{throttle:0,gear:0,clutch:0,dynoEnabled:false,dynoNm:40,brake:0}};
const cases=[['series',{}],['light',{flywheel:'light'}],['ultralight',{flywheel:'ultralight'}],['itb',{throttleBody:'itb'}],['cams',completeTuningSupport({camshaft:'race',idle:'raised'})],['exhaust',{exhaust:'race',catalyst:'straight',muffler:'race'}]];
const report={phase,recordedAt:new Date().toISOString(),pedalStep:.25,rpmWindow:[2000,5000],decelWindow:[4500,2000],runs:[]};
let capture=null,pcm=[];
core.clients.add({writableLength:0,write(b){if(capture)pcm.push(Buffer.from(b));return true;},destroy(){},end(){}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function tick(){await core.command(cmd);await sleep(55);return core.snapshot();}
async function wait(predicate,label,timeout=14000){const until=Date.now()+timeout;while(Date.now()<until){const s=await tick();if(predicate(s))return s;}throw Error(label+': '+core.reason+' '+core.stderr);}
async function hold(target,seconds=2){
 const gamma=tuningParameters(config.tuning).throttleGamma;
 let integral=0,rows=[],started=null,last=null,stable=0;
 cmd.controls.throttle=Math.pow(.03,1/gamma);cmd.controls.dynoEnabled=true;cmd.controls.dynoNm=0;
 const until=Date.now()+11000;
 while(Date.now()<until){const s=await tick();if(!s.connected)continue;
  const dt=last?Math.max(.01,s.state.t-last.t):.06,error=s.state.rpm-target;
  integral=Math.max(-1000,Math.min(1000,integral+error*dt));
  cmd.controls.dynoNm=Math.max(0,Math.min(200,65+error*.15+integral*.08));last={t:s.state.t,rpm:s.state.rpm};
  stable=Math.abs(error)<130?stable+1:0;
  if(started===null&&stable>=6)started=s.state.t;
  if(started!==null){rows.push({t:s.state.t,rpm:s.state.rpm});if(s.state.t-started>=seconds)return rows;}
 }
 return rows;
}
function crossing(rows,rpm,up){for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(up?a.rpm<rpm&&b.rpm>=rpm:a.rpm>rpm&&b.rpm<=rpm)return a.t+(b.t-a.t)*(rpm-a.rpm)/(b.rpm-a.rpm);}return null;}
function wav(buffer){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+buffer.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(44100,24);h.writeUInt32LE(88200,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(buffer.length,40);return Buffer.concat([h,buffer]);}
function soundStats(buffer){
 const n=8192,re=new Float64Array(n),im=new Float64Array(n);let rms=0,clipped=0;
 for(let i=0;i<buffer.length/2;i++){const x=buffer.readInt16LE(i*2)/32768;rms+=x*x;if(Math.abs(x)>.999)clipped++;}
 for(let i=0;i<n;i++)re[i]=(i*2+1<buffer.length?buffer.readInt16LE(i*2)/32768:0)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=n;len*=2)for(let start=0;start<n;start+=len)for(let j=0;j<len/2;j++){const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),k=start+j,l=k+len/2,vr=re[l]*c-im[l]*s,vi=re[l]*s+im[l]*c;re[l]=re[k]-vr;im[l]=im[k]-vi;re[k]+=vr;im[k]+=vi;}
 const bands=[0,0,0];for(let i=4;i<n/2;i++){const hz=i*44100/n,e=re[i]**2+im[i]**2;bands[hz<400?0:hz<1500?1:2]+=e;}
 const total=bands.reduce((a,b)=>a+b,0)||1;return{rms:Math.sqrt(rms/Math.max(1,buffer.length/2)),clippedFraction:clipped/Math.max(1,buffer.length/2),bands:bands.map(e=>e/total)};
}
try{
 for(const [name,selection]of cases.filter(([name])=>!process.env.EP_RESPONSE_CASES||process.env.EP_RESPONSE_CASES.split(',').includes(name))){
  const live=await fetch('http://127.0.0.1:4196/api/core/state',{signal:AbortSignal.timeout(1500)}).then(r=>r.json()).catch(()=>null);
  if(live?.state?.ignition||live?.state?.starter)throw Error('Gemeinsamer Motor wird benutzt; keine parallele Lastprüfung.');
  config.tuning=validateTuning(selection);cmd.ignition=false;cmd.starter=false;cmd.controls.throttle=0;cmd.controls.dynoEnabled=false;cmd.reset=true;await core.command(cmd);cmd.reset=false;
  await wait(s=>s.connected&&s.tuningKey===tuningKey(config.tuning)&&!s.state.ignition,'Einbau '+name);
  cmd.ignition=true;cmd.starter=true;cmd.controls.throttle=.04;await wait(s=>s.connected&&s.state.rpm>850,'Start '+name);cmd.starter=false;
  cmd.controls.throttle=0;
  await wait(s=>s.connected&&s.state.rpm<1800&&s.state.rpm>300,'Ausgangsdrehzahl '+name,10000);
  capture='blip';pcm=[];cmd.controls.throttle=.25;
  let rows=[],peak=0;
  const until=Date.now()+10000;
  while(Date.now()<until){const s=await tick();if(!s.connected)continue;rows.push({t:s.state.t,rpm:s.state.rpm});peak=Math.max(peak,s.state.rpm);if(s.state.rpm>5300)break;}
  const t2=crossing(rows,2000,true),t5=crossing(rows,5000,true);cmd.controls.throttle=0;
  const fall=[],fallUntil=Date.now()+10000;
  while(Date.now()<fallUntil){const s=await tick();if(!s.connected)continue;fall.push({t:s.state.t,rpm:s.state.rpm});if(s.state.rpm<1900)break;}
  const t45=crossing(fall,4500,false),t20=crossing(fall,2000,false);capture=null;
  const blip=Buffer.concat(pcm);await writeFile(`${folder}/${phase}-${name}-blip.wav`,wav(blip));
  await hold(3000,1);pcm=[];capture='steady';const steady=await hold(3000,1.5);capture=null;cmd.controls.dynoEnabled=false;
  const audio=Buffer.concat(pcm);await writeFile(`${folder}/${phase}-${name}-3000.wav`,wav(audio));
  const run={name,tuning:config.tuning,inertia:tuningParameters(config.tuning).crankInertiaKgM2,pedalGamma:tuningParameters(config.tuning).throttleGamma,rise2000to5000S:t2!==null&&t5!==null?t5-t2:null,fall4500to2000S:t45!==null&&t20!==null?t20-t45:null,steadyMeanRpm:steady.length?steady.reduce((a,b)=>a+b.rpm,0)/steady.length:null,sound:soundStats(audio),peakRpm:peak,rows,fall};
  report.runs.push(run);console.log(JSON.stringify({name,rise:run.rise2000to5000S,fall:run.fall4500to2000S,rpm:run.steadyMeanRpm,bands:run.sound.bands}));
 }
}finally{core.close();await mkdir(folder,{recursive:true});await writeFile(`${folder}/${phase}.json`,JSON.stringify(report,null,2));}
