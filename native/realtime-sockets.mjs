import {WebSocketServer,WebSocket} from './vendor/ws/wrapper.mjs';

export function installRealtimeSockets(server,core,{allowedHosts,allowedOrigins,dispatchCommand}){
 const audio=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 const control=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const target=path==='/api/core/audio-socket'?audio:path==='/api/core/control-socket'?control:null;
  if(!target||!allowedHosts.has(req.headers.host)||!allowedOrigins.has(req.headers.origin)){
   socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;
  }
  target.handleUpgrade(req,socket,head,ws=>target.emit('connection',ws,req));
 });
 audio.on('connection',ws=>{
  ws.on('error',()=>{});core.start();
  const client={epFramed:true,get writableLength(){return ws.bufferedAmount;},write:b=>{if(ws.readyState===WebSocket.OPEN)ws.send(b,{binary:true});},destroy:()=>ws.terminate(),end:()=>ws.close()};
  core.clients.add(client);ws.on('close',()=>core.clients.delete(client));
  ws.on('message',()=>ws.close(1008,'Receive-only stream'));
 });
 control.on('connection',ws=>{
  ws.on('error',()=>{});
  ws.on('message',async(data,binary)=>{
   let id=0;
   try{
    if(binary)throw Error('JSON required');
    const message=JSON.parse(data.toString());id=message.id;
    if(!Number.isSafeInteger(id)||id<1||Buffer.byteLength(JSON.stringify(message.payload))>4096)throw Error('Invalid command envelope');
    const reply=await dispatchCommand(message.payload);
    if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id,status:202,body:JSON.stringify(reply)}));
   }catch(error){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id,status:400,body:JSON.stringify({error:error.message})}));}
  });
 });
 return {close(){for(const group of [audio,control]){for(const ws of group.clients)ws.terminate();group.close();}}};
}
