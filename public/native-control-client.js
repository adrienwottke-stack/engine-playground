// Compatibility fetch adapter: the existing UI keeps its request/Response API.
const direct=window.fetch.bind(window),worker=new Worker(new URL('./native-control.js?v=0.5.0',import.meta.url));
window.__nativeAudioReady=()=>{const host=document.querySelector('.engine-three-host');return !host||(host.dataset.webgl==='ready'&&host.dataset.audioWarm!=='warming')||host.dataset.webgl==='unavailable';};
let nextId=0;const pending=new Map();
worker.onmessage=({data})=>{
 if(data.type!=='reply')return;const request=pending.get(data.id);if(!request)return;pending.delete(data.id);
 if(data.error)request.reject(new Error(data.error));else request.resolve(new Response(data.body,{status:data.status,headers:{'Content-Type':'application/json'}}));
};
worker.onerror=()=>{for(const request of pending.values())request.reject(new Error('Control worker unavailable'));pending.clear();};
window.__nativeControlUpdate=state=>worker.postMessage({type:'update',state});
window.fetch=function(input,init){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin||url.pathname!=='/api/core/command'||init?.method!=='POST')return direct(input,init);
 const payload=JSON.parse(init.body);
 if(!payload.clientId)return direct(input,init);
 const id=++nextId;return new Promise((resolve,reject)=>{
  if(init.signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
  pending.set(id,{resolve,reject});
  init.signal?.addEventListener('abort',()=>{if(pending.delete(id))reject(new DOMException('Aborted','AbortError'));},{once:true});
  worker.postMessage({type:'command',id,payload});
 });
};
window.addEventListener('pagehide',()=>{worker.postMessage({type:'release'});worker.terminate();});
