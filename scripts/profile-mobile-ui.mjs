// Synthetic native pose, local static app, no real engine or external commands.
import {chromium} from '@playwright/test';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('evidence/responsive-20261025/package/dist');
const sample=JSON.parse(await readFile('evidence/responsive-20261025/browser-websocket-wan.json','utf8')).data.first;
const server=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({connected:true,state:sample,tuningKey:'series|series|series|series|series',tuningSequence:sample.sequence,accepted:false}));return;}
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{const b=await readFile(file);res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':extname(file)==='.html'?'text/html':'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
const cap=Number(process.env.UI_FPS||0);
await page.addInitScript(({sample,cap})=>{
 window.EventSource=class {constructor(){let t=0;this.timer=setInterval(()=>{t+=.03;const s={...sample,t:sample.t+t,timestampMs:Date.now(),rpm:3000,omega:314.159,crankAngle:(t*314.159)%(4*Math.PI)};this.onmessage?.({data:JSON.stringify({connected:true,state:s,tuningKey:'series|series|series|series|series',tuningSequence:s.sequence})});},30);}close(){clearInterval(this.timer);}};
 if(cap){const raf=window.requestAnimationFrame.bind(window);let last=0;window.requestAnimationFrame=fn=>raf(function tick(at){if(at-last<1000/cap)return raf(tick);last=at;fn(at);});}
},{sample,cap});
const rows=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 for(let i=0;i<7;i++){
  await page.waitForTimeout(10000);
  const metrics=Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const ui=await page.evaluate(()=>({now:performance.now(),engine:window.__playground.engine3d,root:{...document.getElementById('app').dataset}}));
  rows.push({metrics,ui});
 }
 await writeFile('evidence/responsive-20261025/ui-profile-'+(cap||'uncapped')+'.json',JSON.stringify({synthetic:true,cap,errors,rows},null,2));
 console.log(JSON.stringify({cap,errors,rows:rows.map(r=>({at:r.ui.now,heapMB:r.metrics.JSHeapUsedSize/1048576,task:r.metrics.TaskDuration,script:r.metrics.ScriptDuration,layout:r.metrics.LayoutDuration,ready:r.ui.engine.ready,frame:r.ui.engine.scene?.frame,draws:r.ui.engine.scene?.drawCalls,renderMeanMs:r.ui.root.renderMeanMs}))}));
}finally{await browser.close();server.close();}
