import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PhysicalCore} from '../native/core-runtime.mjs';

test('audio worker preserves signed PCM across odd chunks and reconnects after EOF',async()=>{
  const messages=[],statuses=[];let requests=0,connected;
  const reconnected=new Promise(resolve=>connected=resolve);
  const chunks=[new Uint8Array([0]),new Uint8Array([64,0,192,0,128,255]),new Uint8Array([127])];
  const self={postMessage:data=>statuses.push(data),onmessage:null};
  const context=vm.createContext({self,AbortController,Float32Array,Promise,performance,
    setTimeout:fn=>setImmediate(fn),fetch:async()=>{
      const second=++requests===2;if(second)connected();let index=0;
      return {ok:true,body:{getReader:()=>({read:()=>second?new Promise(()=>{}):Promise.resolve(index<chunks.length?{value:chunks[index++],done:false}:{done:true}),releaseLock(){}})}};
    }});
  vm.runInContext(readFileSync(new URL('../public/native-stream.js',import.meta.url),'utf8'),context);
  self.onmessage({data:{type:'connect',port:{postMessage:data=>messages.push(data),close(){}}}});
  await reconnected;
  assert.deepEqual(messages.filter(x=>x.type==='pcm').flatMap(x=>Array.from(x.samples)),[.5,-.5,-1,32767/32768]);
  assert.ok(statuses.some(x=>x.connected===false));
  assert.ok(messages.filter(x=>x.type==='reset').length>=2);
});

test('native telemetry is pushed immediately and slow consumers cannot queue stale gauges',()=>{
  const core=Object.create(PhysicalCore.prototype),messages=[];
  core.buffer=Buffer.alloc(0);core.child={};core.clients=new Set();
  const slow={writableLength:65537,destroyed:false,destroy(){this.destroyed=true;}};
  core.stateClients=new Set([{writableLength:0,write:data=>messages.push(data)},slow]);
  const s={source:'ange-physical',schemaVersion:2,timestampMs:Date.now(),cylinders:Array.from({length:6},()=>({pressureKpa:100,gasTemperatureK:300,intakeLiftMm:0,exhaustLiftMm:0,fuelFraction:0}))};
  for(const key of ['sequence','t','rpm','omega','crankAngle','actualThrottle','speedKmh','wheelRpm','totalRatio','torqueNm','powerKw','wheelTorqueNm','slipRpm','clutchHeatKw','estimatedHeatKw','manifoldKpa'])s[key]=0;
  s.rpm=2000;const payload=Buffer.from(JSON.stringify(s)),header=Buffer.alloc(8);header.writeUInt32LE(1);header.writeUInt32LE(payload.length,4);
  core.parse(Buffer.concat([header,payload]));
  assert.equal(messages.length,1);assert.equal(JSON.parse(messages[0].slice(6)).state.rpm,2000);
  assert.equal(slow.destroyed,true);assert.equal(core.stateClients.size,1);
});

test('one stdout batch publishes only its freshest telemetry and retains earlier curves and cycles',()=>{
  const core=Object.create(PhysicalCore.prototype),messages=[];
  const client={
    writableLength:0,destroyed:false,
    write(message){messages.push(message);this.writableLength+=Buffer.byteLength(message);return false;},
    destroy(){this.destroyed=true;},
  };
  Object.assign(core,{buffer:Buffer.alloc(0),child:{},clients:new Set(),stateClients:new Set([client])});
  const frame=(type,value)=>{
    const payload=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(8);
    header.writeUInt32LE(type);header.writeUInt32LE(payload.length,4);return Buffer.concat([header,payload]);
  };
  const state=sequence=>{
    const value={source:'ange-physical',schemaVersion:2,timestampMs:Date.now(),cylinders:Array.from({length:6},()=>({pressureKpa:100,gasTemperatureK:300,intakeLiftMm:0,exhaustLiftMm:0,fuelFraction:0}))};
    for(const key of ['sequence','t','rpm','omega','crankAngle','actualThrottle','speedKmh','wheelRpm','totalRatio','torqueNm','powerKw','wheelTorqueNm','slipRpm','clutchHeatKw','estimatedHeatKw','manifoldKpa'])value[key]=0;
    value.sequence=sequence;value.t=sequence/10;value.rpm=2000+sequence*100;return value;
  };
  const valveCurves={samples:Array.from({length:6},()=>Array.from({length:288},()=>[1,2]))};
  const cycles=Array.from({length:6},(_,i)=>({cylinder:i+1,samples:Array.from({length:144},()=>[100.123456789,300.987654321,1.123456789,.123456789,-.0123456789,.0234567891,1])}));
  const next=frame(1,state(4)),partial=next.subarray(0,12);
  core.parse(Buffer.concat([frame(3,{valveCurves}),frame(1,state(1)),frame(4,{cycles}),frame(1,state(2)),frame(1,state(3)),partial]));
  assert.equal(messages.length,1,'a batch emits one synchronous SSE update');
  assert.equal(client.destroyed,false,'a large cycle update must not disconnect itself before draining');
  assert.ok(client.writableLength>65536,'the realistic cycle payload exercises the existing backpressure boundary');
  assert.equal(core.stateClients.has(client),true);
  const published=JSON.parse(messages[0].slice(6));
  assert.equal(published.connected,true);assert.equal(published.state.sequence,3);assert.equal(published.state.rpm,2300);
  assert.deepEqual(published.state.valveCurves,valveCurves);assert.deepEqual(published.state.cycles,cycles);
  assert.equal(core.curvesPending,false);assert.equal(core.cyclesPending,false);
  assert.equal(core.buffer.length,partial.length,'the incomplete next frame does not hold back the completed update');

  // A drained client can receive the completed next frame without metadata repeats.
  client.writableLength=0;core.parse(next.subarray(partial.length));
  assert.equal(messages.length,2);assert.equal(client.destroyed,false);
  const following=JSON.parse(messages[1].slice(6));assert.equal(following.state.sequence,4);
  assert.equal(following.state.valveCurves,undefined);assert.equal(following.state.cycles,undefined);

  // Validation remains fail-closed if a later state in the batch is invalid.
  client.writableLength=0;
  core.parse(Buffer.concat([frame(1,state(5)),frame(1,{...state(6),rpm:null})]));
  assert.equal(messages.length,3);assert.equal(core.state,null);
  const invalid=JSON.parse(messages[2].slice(6));assert.equal(invalid.connected,false);assert.equal(invalid.state,null);
  assert.match(invalid.reason,/rpm/);
});

test('static valve curves are validated, cached for new clients, and omitted from normal live updates',()=>{
  const core=Object.create(PhysicalCore.prototype),messages=[];
  Object.assign(core,{buffer:Buffer.alloc(0),child:{},clients:new Set(),stateClients:new Set([{writableLength:0,write:data=>messages.push(data)}])});
  const packet=value=>{const data=Buffer.from(JSON.stringify(value)),header=Buffer.alloc(8);header.writeUInt32LE(3);header.writeUInt32LE(data.length,4);core.parse(Buffer.concat([header,data]));};
  const valveCurves={samples:Array.from({length:6},()=>Array.from({length:288},()=>[1,2]))};
  packet({valveCurves});assert.equal(core.curvesPending,true);assert.equal(core.valveCurves.samples.length,6);
  core.state={timestampMs:Date.now()};core.publishState(true);core.publishState();
  assert.equal(JSON.parse(messages[0].slice(6)).state.valveCurves.samples.length,6);
  assert.equal(JSON.parse(messages[1].slice(6)).state.valveCurves,undefined);
  assert.equal(core.snapshot().state.valveCurves.samples.length,6);
  packet({valveCurves:{samples:[[[-1,NaN]]]}});assert.equal(core.valveCurves.samples.length,6);
});

test('six captured cylinder cycles are sent once per update and bad packets preserve the cache',()=>{
  const core=Object.create(PhysicalCore.prototype),messages=[];
  Object.assign(core,{buffer:Buffer.alloc(0),child:{},clients:new Set(),state:{timestampMs:Date.now()},stateClients:new Set([{writableLength:0,write:data=>messages.push(data)}])});
  const cycles=Array.from({length:6},(_,i)=>({cylinder:i+1,samples:Array.from({length:144},()=>[100,300,1,0,-.01,.02,0])}));
  const packet=value=>{const data=Buffer.from(JSON.stringify({cycles:value})),header=Buffer.alloc(8);header.writeUInt32LE(4);header.writeUInt32LE(data.length,4);core.parse(Buffer.concat([header,data]));};
  packet(cycles);assert.equal(core.cyclesPending,true);core.publishState(false,true);core.publishState();
  assert.equal(JSON.parse(messages[0].slice(6)).state.cycles.length,6);
  assert.equal(JSON.parse(messages[1].slice(6)).state.cycles,undefined);
  assert.deepEqual(core.snapshot().state.cycles,cycles);
  packet([{cylinder:1,samples:[]}]);assert.deepEqual(core.cycles,cycles);
});
