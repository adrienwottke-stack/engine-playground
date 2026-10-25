import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function harness(){
 let clock=0,tick,accept=true;const requests=[],messages=[];
 const self={postMessage:m=>messages.push(m)};
 const context=vm.createContext({self,performance:{now:()=>clock,timeOrigin:100000},AbortSignal,setInterval:fn=>tick=fn,fetch:async(url,options)=>{
  requests.push(JSON.parse(options.body));const reply={accepted:accept,sequence:requests.length};return {ok:true,status:202,text:async()=>JSON.stringify(reply)};
 }});
 vm.runInContext(readFileSync(new URL('../public/native-control.js',import.meta.url),'utf8'),context);
 const send=data=>self.onmessage({data}),drain=()=>new Promise(r=>setImmediate(r));
 const payload={clientId:'control-test',claim:true,reset:true,ignition:true,starter:false,active:true,controls:{throttle:0},config:{engine:{}}};
 return {requests,messages,send,drain,payload,tick:()=>tick(),advance:ms=>clock+=ms,reject:()=>accept=false};
}
test('owner heartbeat survives a busy UI without replaying Reset or claiming another tab',async()=>{
 const h=harness();h.send({type:'command',id:1,payload:h.payload});await h.drain();
 h.advance(9000);h.tick();await h.drain();
 assert.equal(h.requests.length,2);assert.equal(h.requests[0].reset,true);assert.equal(h.requests[1].reset,false);assert.equal(h.requests[1].claim,false);
 assert.equal(h.requests[1].ignition,true);assert.equal(h.messages.filter(m=>m.type==='reply').length,1);
 h.reject();h.tick();await h.drain();const n=h.requests.length;
 h.send({type:'update',state:{clientId:'control-test',controls:{throttle:.5},ignition:true,starter:false,active:true}});h.tick();await h.drain();
 assert.equal(h.requests.length,n,'passive updates cannot reclaim controls after another owner took over');
});
test('Stop updates the independent control channel immediately and a closed UI loses its lease',async()=>{
 const h=harness();h.send({type:'command',id:1,payload:{...h.payload,reset:false}});await h.drain();
 h.send({type:'update',state:{clientId:'control-test',controls:{throttle:0},ignition:false,starter:false,active:true}});await h.drain();
 assert.equal(h.requests.at(-1).ignition,false);
 const n=h.requests.length;h.advance(16000);h.tick();await h.drain();assert.equal(h.requests.length,n);
});

test('WebSocket sends new gas immediately while a previous heartbeat acknowledgement is pending',async()=>{
 const messages=[],frames=[];let tick,ws;
 class Socket{readyState=0;constructor(){ws=this;setImmediate(()=>{this.readyState=1;this.onopen();});}send(text){frames.push(JSON.parse(text));}close(){this.readyState=3;this.onclose();}}
 const self={location:{href:'http://engine.test/native-control.js'},postMessage:m=>messages.push(m)};
 const context=vm.createContext({self,URL,WebSocket:Socket,performance:{now:()=>0,timeOrigin:1000},AbortSignal,setInterval:fn=>tick=fn,fetch:()=>{throw Error('HTTP fallback must not run');}});
 vm.runInContext(readFileSync(new URL('../public/native-control.js',import.meta.url),'utf8'),context);
 self.onmessage({data:{type:'command',id:1,payload:{clientId:'socket-test',claim:true,reset:false,ignition:true,starter:false,active:true,controls:{throttle:0},config:{}}}});
 await new Promise(r=>setImmediate(r));assert.equal(frames.length,1);
 ws.onmessage({data:JSON.stringify({id:1,status:202,body:JSON.stringify({accepted:true,sequence:1})})});
 tick();assert.equal(frames.length,2);
 self.onmessage({data:{type:'update',state:{clientId:'socket-test',controls:{throttle:.5},ignition:true,starter:false,active:true}}});
 assert.equal(frames.length,3,'new control must not await heartbeat reply');assert.equal(frames[2].payload.controls.throttle,.5);assert.equal(frames[2].payload.claim,false);
 assert.equal(messages.find(m=>m.type==='command-observed').transport,'websocket');
});
