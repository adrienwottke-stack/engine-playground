// Fetch/decode PCM away from the UI thread and feed the worklet directly.
let streamPort, controller;
self.onmessage = ({ data }) => {
  if (data.type !== 'connect') return;
  controller?.abort(); streamPort?.close();
  streamPort = data.port; controller = new AbortController();
  readNative(controller).catch(() => {});
};
async function readNative(connection) {
  while (!connection.signal.aborted) {
    try {
      let response;
      if(typeof WebSocket==='function'){try{response=await socketResponse(connection);}catch{if(connection.signal.aborted)return;}}
      response??=await fetch('/api/core/audio?framed=1', { signal: connection.signal, cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error('Native audio unavailable');
      streamPort.postMessage({ type: 'reset' }); self.postMessage({ type: 'stream', connected: true, transport:response.transport||'http' });
      const reader = response.body.getReader(); let carry = -1, lastPacket = 0, maxGap = 0, reportAt = 0,pending=new Uint8Array(0);
      const framed=response.headers?.get('X-Audio-Format')==='epa2-s16le-mono';
      try {
        while (!connection.signal.aborted) {
          const next = await reader.read(); if (next.done) break;
          const now=performance.now();if(lastPacket)maxGap=Math.max(maxGap,now-lastPacket);lastPacket=now;
          if(now>reportAt){self.postMessage({type:'timing',maxPacketGapMs:maxGap});maxGap=0;reportAt=now+500;}
          if(framed){
            const joined=new Uint8Array(pending.length+next.value.length);joined.set(pending);joined.set(next.value,pending.length);pending=joined;
            let offset=0;
            while(pending.length-offset>=48){
              const view=new DataView(pending.buffer,pending.byteOffset+offset),count=view.getUint32(4,true);
              if(view.getUint32(0,true)!==0x32415045||count>16384||view.getUint32(44,true)!==44100)throw Error('Invalid framed PCM');
              const size=48+count*2;if(pending.length-offset<size)break;
              const samples=new Float32Array(count);for(let i=0;i<count;i++)samples[i]=view.getInt16(48+i*2,true)/32768;
              const meta={sourceAt:view.getFloat64(8,true),sequence:view.getFloat64(16,true),simTime:view.getFloat64(24,true),throttle:view.getFloat32(32,true),rpm:view.getFloat32(36,true),frame:view.getUint32(40,true)};
              streamPort.postMessage({type:'pcm',samples,meta},[samples.buffer]);offset+=size;
            }
            pending=pending.slice(offset);if(pending.length>100000)throw Error('Oversized PCM frame');
            continue;
          }
          const bytes = next.value, count = Math.floor((bytes.length + (carry >= 0 ? 1 : 0)) / 2);
          const samples = new Float32Array(count); let at = 0, i = 0;
          if (carry >= 0 && bytes.length) { samples[at++] = ((carry | (bytes[i++] << 8)) << 16 >> 16) / 32768; carry = -1; }
          while (i + 1 < bytes.length) { samples[at++] = ((bytes[i] | (bytes[i + 1] << 8)) << 16 >> 16) / 32768; i += 2; }
          if (i < bytes.length) carry = bytes[i];
          if (samples.length) streamPort.postMessage({ type: 'pcm', samples }, [samples.buffer]);
        }
      } finally { reader.releaseLock(); }
    } catch { if (connection.signal.aborted) return; }
    // Reset retains volume across EOF/reconnect, while discarding old sound.
    streamPort.postMessage({ type: 'reset' }); self.postMessage({ type: 'stream', connected: false });
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
function socketResponse(connection){
 return new Promise((resolve,reject)=>{
  const url=new URL('/api/core/audio-socket',self.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(url);ws.binaryType='arraybuffer';const queue=[];let waiting,ended=false,opened=false,queued=0;
  const abort=()=>ws.close();connection.signal.addEventListener('abort',abort,{once:true});
  ws.onmessage=({data})=>{const value=new Uint8Array(data);if(waiting){const done=waiting;waiting=null;done({value,done:false});}else{queue.push(value);queued+=value.length;if(queued>262144)ws.close();}};
  ws.onopen=()=>{opened=true;resolve({ok:true,transport:'websocket',headers:{get:()=> 'epa2-s16le-mono'},body:{getReader:()=>({read(){if(queue.length){const value=queue.shift();queued-=value.length;return Promise.resolve({value,done:false});}if(ended)return Promise.resolve({done:true});return new Promise(done=>waiting=done);},releaseLock(){ws.close();}})}});};
  ws.onerror=()=>{};
  ws.onclose=()=>{ended=true;connection.signal.removeEventListener('abort',abort);if(waiting){waiting({done:true});waiting=null;}if(!opened)reject(Error('Audio socket unavailable'));};
 });
}
