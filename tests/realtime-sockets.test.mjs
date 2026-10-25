import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket} from '../native/vendor/ws/wrapper.mjs';
import {installRealtimeSockets} from '../native/realtime-sockets.mjs';
import {frameAudio,AUDIO_MAGIC} from '../native/audio-framing.mjs';

test('real sockets preserve command ordering, native PCM bytes, and strict Origin checks',async()=>{
 const server=http.createServer((req,res)=>res.end()),core={clients:new Set(),start(){}},seen=[];
 let queue=Promise.resolve(),seq=0;
 const hosts=new Set(),origin='https://engine.test';
 const sockets=installRealtimeSockets(server,core,{allowedHosts:hosts,allowedOrigins:new Set([origin]),dispatchCommand(payload){const op=queue.then(()=>{seen.push(payload.controls.throttle);return {accepted:true,sequence:++seq};});queue=op;return op;}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const host='127.0.0.1:'+server.address().port;hosts.add(host);
 const control=new WebSocket('ws://'+host+'/api/core/control-socket',{origin});
 const audio=new WebSocket('ws://'+host+'/api/core/audio-socket',{origin});
 try{
  await Promise.all([once(control,'open'),once(audio,'open')]);
  const replies=[];const done=new Promise(resolve=>control.on('message',b=>{replies.push(JSON.parse(b));if(replies.length===2)resolve();}));
  control.send(JSON.stringify({id:1,payload:{controls:{throttle:.2}}}));control.send(JSON.stringify({id:2,payload:{controls:{throttle:.5}}}));await done;
  assert.deepEqual(seen,[.2,.5]);assert.deepEqual(replies.map(r=>JSON.parse(r.body).sequence),[1,2]);
  const received=once(audio,'message'),pcm=Buffer.from([0,64,0,192]);
  [...core.clients][0].write(frameAudio(pcm,{sequence:2,timestampMs:100,actualThrottle:.5,rpm:2000},1));
  const [b]=await received;assert.equal(b.readUInt32LE(0),AUDIO_MAGIC);assert.equal(b.readDoubleLE(16),2);assert.deepEqual(b.subarray(48),pcm);
  const foreign=new WebSocket('ws://'+host+'/api/core/control-socket',{origin:'https://foreign.test'});
  await assert.rejects(once(foreign,'open'),/403/);
  assert.equal(seen.length,2);
 }finally{const closed=[once(control,'close'),once(audio,'close')];sockets.close();await Promise.all(closed);await new Promise(resolve=>server.close(resolve));}
});
