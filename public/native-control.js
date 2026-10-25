// One serialized control channel, independent of 3D/main-thread scheduling.
let latest=null,owned=false,busy=false,dirty=false,claim=false,reset=false,generation=0,lastUi=0;
let waiters=[],lastSent=0,maxGap=0;
let socket=null,socketUnsupported=typeof WebSocket!=='function',wireId=0;const socketPending=new Map();
function observe(sentAt,payload,reply,transport){
 owned=reply.accepted===true;
 self.postMessage({type:'command-observed',sentAt,receivedAt:performance.timeOrigin+performance.now(),sequence:reply.sequence,accepted:reply.accepted,throttle:payload.controls.throttle,ignition:payload.ignition,maxGapMs:maxGap,transport});
}
function openSocket(){
 if(socket||socketUnsupported)return;
 const url=new URL('/api/core/control-socket',self.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
 const ws=new WebSocket(url);socket=ws;let opened=false;
 ws.onopen=()=>{opened=true;pump();};ws.onerror=()=>{};
 ws.onmessage=({data})=>{
  let reply;try{reply=JSON.parse(data);}catch{return;}
  const request=socketPending.get(reply.id);if(!request)return;socketPending.delete(reply.id);
  let body;try{body=JSON.parse(reply.body);}catch{body={accepted:false};}
  observe(request.sentAt,request.payload,body,'websocket');
  for(const waiter of request.waiters)self.postMessage({type:'reply',id:waiter.id,status:reply.status,body:reply.body});
  if(dirty||waiters.length)pump();
 };
 ws.onclose=()=>{
  socket=null;owned=false;if(!opened)socketUnsupported=true;
  for(const request of socketPending.values())for(const waiter of request.waiters)self.postMessage({type:'reply',id:waiter.id,error:'Control socket closed'});
  socketPending.clear();if(socketUnsupported&&(claim||waiters.length))pump();
 };
}
self.onmessage=({data})=>{
 if(data.type==='release'){owned=false;latest=null;socket?.close();return;}
 if(data.type==='update'){
  lastUi=performance.now();if(!latest||data.state.clientId!==latest.clientId)return;
  const before=JSON.stringify([latest.controls,latest.ignition,latest.starter,latest.active]);
  latest={...latest,controls:{...latest.controls,...data.state.controls},ignition:data.state.ignition,starter:data.state.starter,active:data.state.active,reset:false,claim:false};
  if(JSON.stringify([latest.controls,latest.ignition,latest.starter,latest.active])!==before){generation++;dirty=true;if(owned)pump();}
 }
 if(data.type==='command'){
  lastUi=performance.now();latest={...data.payload,controls:{...data.payload.controls},reset:false,claim:false};
  claim||=data.payload.claim===true;reset||=data.payload.reset===true;generation++;
  waiters.push({id:data.id,generation});dirty=true;pump();
 }
};
async function pump(){
 if(busy||!latest||(!owned&&!claim&&!waiters.length))return;
 if(!socketUnsupported){
  openSocket();if(socket?.readyState!==1)return;
  const payload={...latest,claim,reset},sentAt=performance.timeOrigin+performance.now();
  claim=false;reset=false;dirty=false;if(lastSent)maxGap=Math.max(maxGap,sentAt-lastSent);lastSent=sentAt;
  const id=++wireId,current=waiters;waiters=[];
  socketPending.set(id,{sentAt,payload,waiters:current});
  socket.send(JSON.stringify({id,payload}));return;
 }
 busy=true;dirty=false;const version=generation,payload={...latest,claim,reset};claim=false;reset=false;
 const sentAt=performance.timeOrigin+performance.now();if(lastSent)maxGap=Math.max(maxGap,sentAt-lastSent);lastSent=sentAt;
 try{
  const response=await fetch('/api/core/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(1500)}),body=await response.text();
  const reply=JSON.parse(body);owned=response.ok&&reply.accepted===true;
  observe(sentAt,payload,reply,'http');
  const done=waiters.filter(w=>w.generation<=version);waiters=waiters.filter(w=>w.generation>version);
  for(const waiter of done)self.postMessage({type:'reply',id:waiter.id,status:response.status,body});
 }catch(error){
  const done=waiters.filter(w=>w.generation<=version);waiters=waiters.filter(w=>w.generation>version);
  for(const waiter of done)self.postMessage({type:'reply',id:waiter.id,error:String(error)});
 }finally{busy=false;if(dirty||waiters.length)pump();}
}
setInterval(()=>{
 for(const [id,request] of socketPending)if(performance.timeOrigin+performance.now()-request.sentAt>1500){socketPending.delete(id);for(const waiter of request.waiters)self.postMessage({type:'reply',id:waiter.id,error:'Control socket timed out'});}
 if(socketPending.size>30){socket?.close();owned=false;return;}
 if(performance.now()-lastUi>15000){owned=false;return;}
 if(owned)pump();
},200);
