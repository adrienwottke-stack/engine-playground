import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worklet(options: object = {}) {
  let Processor: any;
  const messages:any[]=[];
  const context=vm.createContext({ currentTime:0,sampleRate:48000,Float32Array,
    AudioWorkletProcessor: class { port={onmessage:null,postMessage:(data:unknown)=>messages.push(data)}; },
    registerProcessor: (_:string,type:any)=>{Processor=type;} });
  vm.runInContext(readFileSync(new URL('../public/native-audio.js',import.meta.url),'utf8'),context);
  const processor=new Processor(options);
  processor.port.onmessage({data:{type:'volume',value:.08,muted:false}});
  const push=(count:number)=>processor.port.onmessage({data:{type:'pcm',samples:new Float32Array(count).fill(.5)}});
  const block=()=>{const out=new Float32Array(128);processor.process([],[[out]]);context.currentTime+=128/48000;return out;};
  return {processor,context,push,block,messages};
}
test('native PCM remains continuous across 44.1-to-48-kHz rendering and irregular chunks', () => {
  const {processor,push,block}=worklet();push(2646);block();
  for(let i=0;i<3750;i++){if(i%15===0)push(1764);block();}
  assert.equal(processor.underruns,0);assert.equal(processor.droppedSamples,0);
});
test('underrun is counted once; stale PCM is discarded and silence clears output', () => {
  const {processor,context,push,block}=worklet();push(2646);
  for(let i=0;i<150;i++)block();assert.equal(processor.underruns,1);
  push(processor.targetSamples);block();context.currentTime+=.5;block();assert.equal(processor.read,processor.write);
  processor.port.onmessage({data:{type:'silence'}});assert.ok(block().every(x=>x===0));
});

test('interactive PCM starts within 60 ms and trims a large stale backlog to 60 ms',()=>{
 const {processor,push,block}=worklet();push(2205);assert.ok(block().every(x=>x===0));
 push(441);assert.ok(block().some(x=>x>0));assert.equal(processor.started,true);
 push(22050);assert.ok((processor.write-processor.read)/44.1<=60.01);
 assert.ok(processor.droppedSamples>0);assert.ok(block().every(Number.isFinite));
});

test('PCM delivered through the dedicated worker port stays independent of control messages',()=>{
 const {processor,block}=worklet();const port={onmessage:null as any,close(){}};
 processor.port.onmessage({data:{type:'connect',port}});
 port.onmessage({data:{type:'pcm',samples:new Float32Array(2646).fill(.3)}});
 assert.ok(block().some(x=>x>0));
 port.onmessage({data:{type:'reset'}});assert.equal(processor.target,.08);
});

test('recovery reserve grows only after a real underrun and remains bounded',()=>{
 const {processor,push,block}=worklet();
 for(let i=0;i<5;i++){push(processor.targetSamples);for(let j=0;j<80;j++)block();}
 assert.equal(processor.underruns,5);assert.equal(processor.targetSamples,4410);assert.equal(processor.maxSamples,6174);
 processor.port.onmessage({data:{type:'reset'}});assert.equal(processor.targetSamples,2646);
});
test('a new PCM stream flushes stale samples and preserves the requested volume',()=>{
 const {processor,push,block}=worklet();push(10000);block();
 processor.port.onmessage({data:{type:'reset'}});assert.equal(processor.read,processor.write);assert.equal(processor.target,.08);
 push(10000);for(let i=0;i<20;i++)block();assert.equal(processor.underruns,0);assert.ok(processor.lastValue>0);
});

test('short hosted reserve absorbs a 135 ms delivery pause without dropping or changing PCM speed',()=>{
 const {processor,context,push,block}=worklet({processorOptions:{hostedRealtime:true}});
 push(7056);let delivered=0;
 for(let i=0;i<750;i++){
   const due=Math.floor(context.currentTime/.01);
   if(!(context.currentTime>=.3&&context.currentTime<.435)&&due>delivered){push((due-delivered)*441);delivered=due;}
   assert.ok(block().every(Number.isFinite));
 }
 assert.equal(processor.underruns,0);assert.equal(processor.droppedSamples,0);
 assert.equal(processor.targetSamples,7056);
 assert.ok(Math.abs(processor.read-750*128*44100/48000)<.01);
 processor.port.onmessage({data:{type:'reset'}});assert.equal(processor.targetSamples,7056);
});

test('full volume range is audible above the former 35 percent cap without overshoot',()=>{
 const render=(volume:number)=>{
   const {processor,push,block}=worklet();
   processor.port.onmessage({data:{type:'volume',value:volume,muted:false}});
   push(4000);let out=new Float32Array(128);
   for(let i=0;i<20;i++)out=block();
   return out[out.length-1];
 };
 const quiet=render(.08),normal=render(.5),full=render(1);
 assert.ok(Math.abs(normal/quiet-6.25)<.001);
 assert.ok(Math.abs(full-.5)<.001);
 assert.ok(Math.abs(render(20)-full)<.001);
 assert.equal(render(NaN),0);
});

test('44.1 and 48 kHz mobile outputs absorb 140 ms delivery stalls without changing engine pitch',()=>{
 for(const rate of [44100,48000]){
   const {processor,context,push}=worklet({processorOptions:{hostedRealtime:true}});
   context.sampleRate=rate;push(7056);let delivered=0,blocks=0;
   while(context.currentTime<4){
     const due=Math.floor(context.currentTime/.01);
     if(!(context.currentTime>=1&&context.currentTime<1.14)&&due>delivered){push((due-delivered)*441);delivered=due;}
     const out=new Float32Array(128);processor.process([],[[out]]);context.currentTime+=128/rate;blocks++;
     assert.ok(out.every(Number.isFinite));
   }
   assert.equal(processor.underruns,0);assert.equal(processor.droppedSamples,0);
   assert.ok(Math.abs(processor.read-blocks*128*44100/rate)<.01);
 }
});

test('audible command markers are reported only when their PCM is actually rendered',()=>{
 const {processor,block,messages}=worklet({processorOptions:{hostedRealtime:true}});
 processor.receive({type:'pcm',samples:new Float32Array(2205).fill(.1),meta:{sequence:10,sourceAt:100,throttle:.1}});
 block();assert.equal(messages.filter(x=>x.type==='played').length,0);
 processor.receive({type:'pcm',samples:new Float32Array(2205).fill(.4),meta:{sequence:11,sourceAt:150,throttle:.4}});
 processor.receive({type:'pcm',samples:new Float32Array(2646).fill(.4)});
 for(let i=0;i<15;i++)block();
 assert.equal(messages.filter(x=>x.type==='played').at(-1).sequence,10);
 for(let i=0;i<7;i++)block();
 assert.equal(messages.filter(x=>x.type==='played').at(-1).sequence,11);
 assert.ok(messages.filter(x=>x.type==='played').at(-1).contextTime>.04);
 assert.equal(processor.droppedSamples,0);
});

test('long producer pauses are exposed and cannot silently grow latency into seconds',()=>{
 const {processor,push,block}=worklet({processorOptions:{hostedRealtime:true}});
 for(let i=0;i<20;i++){push(processor.targetSamples);for(let j=0;j<120;j++)block();}
 assert.ok(processor.underruns>0);assert.ok(processor.targetSamples/44.1<=160);
 assert.ok(processor.maxSamples/44.1<=240);
});
