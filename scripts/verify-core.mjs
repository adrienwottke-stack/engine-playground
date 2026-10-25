import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),bin=resolve(root,'native/headless/bin');
const result=await new Promise((ok,fail)=>{const c=spawn(resolve(bin,'engine-core.exe'),['--self-test'],{cwd:bin,windowsHide:true});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',fail);c.on('exit',code=>ok({code,out,err}));});
const pcm=await readFile(resolve(bin,'self-test.pcm')),summary=result.out.match(/SELF_TEST max_rpm=([\d.]+) pcm_samples=(\d+)/);
let peak=0,sum=0,clipped=0;for(let i=0;i<pcm.length;i+=2){const x=pcm.readInt16LE(i);peak=Math.max(peak,Math.abs(x));sum+=(x/32768)**2;if(Math.abs(x)>=32767)clipped++;}
const count=pcm.length/2,states=result.out.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
const report={passed:result.code===0&&!!summary&&peak>100,scope:'Actual native C++ physics and upstream Synthesizer. Technical PCM signal check; no hardware or subjective listening.',maxRpm:summary?Number(summary[1]):null,sampleRate:44100,samples:count,durationS:count/44100,pcmPeak:peak,pcmRms:Math.sqrt(sum/count),clippedFraction:clipped/count,states,stderr:result.err,executableSha256:createHash('sha256').update(await readFile(resolve(bin,'engine-core.exe'))).digest('hex')};
await mkdir(resolve(root,'evidence'),{recursive:true});await writeFile(resolve(root,'evidence/v02-native-self-test.json'),JSON.stringify(report,null,2));
const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF',0);wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
await writeFile(resolve(root,'evidence/v02-native-sound.wav'),wav);console.log(JSON.stringify({...report,states:states.length,stderr:report.stderr.trim()},null,2));if(!report.passed)process.exitCode=1;
