import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {frameAudio,AUDIO_MAGIC,AUDIO_HEADER} from '../native/audio-framing.mjs';
import {PhysicalCore} from '../native/core-runtime.mjs';

test('PCM framing retains the native-confirmed command and every signed sample',()=>{
 const pcm=Buffer.from([0,64,0,192,0,128,255,127]);
 const b=frameAudio(pcm,{timestampMs:1792940000000.25,sequence:1792940000000001,t:123.45,actualThrottle:.25,rpm:3200},8);
 assert.equal(b.readUInt32LE(0),AUDIO_MAGIC);assert.equal(b.readUInt32LE(4),4);
 assert.equal(b.readDoubleLE(16),1792940000000001);assert.equal(b.readFloatLE(32),.25);
 assert.deepEqual(b.subarray(AUDIO_HEADER),pcm);assert.throws(()=>frameAudio(Buffer.alloc(3),null,0));
});

test('audio worker decodes framed PCM and markers across single-byte HTTP fragments',async()=>{
 const b=frameAudio(Buffer.from([0,64,0,192,0,128,255,127]),{timestampMs:123,sequence:456,t:7,actualThrottle:.25,rpm:2000},9);
 const messages=[];let reconnect;const ready=new Promise(r=>reconnect=r);let requests=0;
 const self={postMessage(){},onmessage:null};
 const context=vm.createContext({self,AbortController,Float32Array,Promise,performance,setTimeout:fn=>setImmediate(fn),fetch:async()=>{
  const second=++requests===2;if(second)reconnect();let index=0;
  return {ok:true,headers:{get:()=> 'epa2-s16le-mono'},body:{getReader:()=>({read:()=>second?new Promise(()=>{}):Promise.resolve(index<b.length?{value:new Uint8Array([b[index++]]),done:false}:{done:true}),releaseLock(){}})}};
 }});
 vm.runInContext(readFileSync(new URL('../public/native-stream.js',import.meta.url),'utf8'),context);
 self.onmessage({data:{type:'connect',port:{postMessage:d=>messages.push(d),close(){}}}});await ready;
 const packet=messages.find(m=>m.type==='pcm');assert.deepEqual(Array.from(packet.samples),[.5,-.5,-1,32767/32768]);
 assert.equal(packet.meta.sequence,456);assert.equal(packet.meta.sourceAt,123);assert.equal(packet.meta.throttle,.25);
});

test('compact viewers retain control state but do not repeat full cycle arrays at 33 Hz',()=>{
 const core=Object.create(PhysicalCore.prototype);core.start=()=>{};
 core.state={timestampMs:Date.now(),sequence:3,rpm:1200,cycle:{samples:[1,2,3]}};
 core.cycles=[{samples:[4,5,6]}];core.stateClients=new Set();
 const compact=[],full=[];
 const a={epCompact:true,epCycleAt:0,writableLength:0,write:s=>compact.push(JSON.parse(s.slice(6)))};
 const b={writableLength:0,write:s=>full.push(JSON.parse(s.slice(6)))};
 core.stateClients.add(a);core.stateClients.add(b);
 core.publishState(false,true);core.publishState(false,true);
 assert.equal(compact[0].state.rpm,1200);assert.equal(compact[0].state.cycle,undefined);
 assert.ok(compact[0].state.cycles);assert.equal(compact[1].state.cycles,undefined);
 assert.deepEqual(full[1].state.cycle.samples,[1,2,3]);assert.ok(full[1].state.cycles);
});
