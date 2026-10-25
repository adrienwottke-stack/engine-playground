// Isolated local integration preview; does not touch the shared4196 process or dist.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PhysicalCore} from '../native/core-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=resolve(root,'.tuning-dist');
const port=4198,origin=`http://127.0.0.1:${port}`,core=new PhysicalCore(root);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
let lastUse=Date.now(),queue=Promise.resolve();
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){json(res,403,{error:'Local preview only'});return;}
 try{
  const path=new URL(req.url,origin).pathname;
  if(path.startsWith('/api/'))lastUse=Date.now();
  if(path==='/api/health'){json(res,200,{ok:true,app:'engine-playground',variant:'tuning-isolated-preview',port});return;}
  if(path==='/api/core/state'){json(res,200,core.snapshot());return;}
  if(path==='/api/core/events'){core.events(res);return;}
  if(path==='/api/core/audio'){core.audio(res);return;}
  if(path==='/api/core/command'&&req.method==='POST'){
   if(![origin,`http://localhost:${port}`].includes(req.headers.origin)){json(res,403,{error:'Unzulässiger Ursprung'});return;}
   if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'JSON erforderlich'});return;}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('Befehl zu groß');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),op=queue.then(()=>core.command(data));queue=op.catch(()=>{});json(res,202,await op);return;
  }
  if(path.startsWith('/api/')){json(res,404,{error:'Nur native Vorschau verfügbar'});return;}
  const file=resolve(dist,decodeURIComponent(path).replace(/^\/+/, '')||'index.html');
  if(!file.startsWith(dist+sep)){json(res,403,{error:'Unzulässiger Pfad'});return;}
  const actual=(await stat(file).catch(()=>null))?.isFile()?file:resolve(dist,'index.html');
  res.writeHead(200,{'Content-Type':mime[extname(actual)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(actual));
 }catch(error){json(res,400,{error:error.message});}
});
const timer=setInterval(()=>{if(Date.now()-lastUse>30000)core.close();},10000);timer.unref();
function stop(){clearInterval(timer);core.close();server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.listen(port,'127.0.0.1',()=>console.log(`Isolierte Tuning-Vorschau: ${origin}`));
