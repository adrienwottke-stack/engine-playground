import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCommand, commandLine, validateTelemetry } from './native/protocol.mjs';
import { PhysicalCore } from './native/core-runtime.mjs';
import { installRealtimeSockets } from './native/realtime-sockets.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const appVersion = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4196);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port muss zwischen 1024 und 65535 liegen.');
const publicOrigin=process.env.EP_PUBLIC_ORIGIN;
const publicUrl=publicOrigin?new URL(publicOrigin):null;
if(publicUrl&&(publicUrl.protocol!=='https:'||publicUrl.origin!==publicOrigin))throw new Error('EP_PUBLIC_ORIGIN muss ein vollständiger HTTPS-Ursprung ohne Pfad sein.');
const bindHost=process.env.EP_BIND_HOST||'127.0.0.1';
const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,...(publicUrl?[publicUrl.host]:[])]);
const dist = resolve(root, 'dist');
const mailbox = resolve(root, 'native/runtime/mailbox');
const physicalCore = new PhysicalCore(root);
await mkdir(mailbox, { recursive: true });
let sequence = Date.now() * 1000;
let resetId = 0, previousReset = false;
let commandQueue = Promise.resolve();
const allowedOrigins = new Set(publicUrl?[publicUrl.origin]:[`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173']);
const websocketSources=[...allowedOrigins].map(origin=>origin.replace(/^http/,'ws')).join(' ');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.glb':'model/gltf-binary', '.bin':'application/octet-stream' };
function json(res, code, payload) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)); }
async function body(req) {
  let total = 0; const chunks = [];
  for await (const chunk of req) { total += chunk.length; if (total > 4096) throw new Error('Befehl ist zu groß.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  if (!allowedHosts.has(host)) { json(res, 403, { error: 'Unzulässiger Host.' }); return; }
  if(publicUrl)res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`),path=requestUrl.pathname;
  if(path.startsWith('/api/core/'))lastCoreUse=Date.now();
  try {
    if (path === '/api/health') { json(res, 200, { ok: true, mode: publicUrl?'hosted':'local', app: 'engine-playground', variant:'motor-workshop', version: appVersion, release:process.env.EP_RELEASE||'local',physicalCoreBuilt: existsCore() }); return; }
    if (path === '/api/core/state' && req.method === 'GET') { const compact=requestUrl.searchParams.get('compact')==='1';json(res,200,physicalCore.snapshot(!compact,!compact,compact));return; }
    if (path === '/api/core/events' && req.method === 'GET') { physicalCore.events(res,requestUrl.searchParams.get('compact')==='1');return; }
    if (path === '/api/core/audio' && req.method === 'GET') { physicalCore.audio(res,requestUrl.searchParams.get('framed')==='1');return; }
    if (path === '/api/core/command' && req.method === 'POST') {
      if(!allowedOrigins.has(req.headers.origin)){json(res,403,{error:'Unzulässiger Ursprung.'});return;}
      if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: 'JSON erforderlich.' }); return; }
      const command = await body(req);
      const op=commandQueue.then(()=>physicalCore.command(command));
      commandQueue=op.catch(()=>{});json(res,202,await op);return;
    }
    if (path === '/api/native/state' && req.method === 'GET') {
      try {
        const info = await stat(resolve(mailbox, 'telemetry.json'));
        if (info.size > 16384) throw new Error('Native Telemetrie ist zu groß.');
        const state = validateTelemetry(JSON.parse(await readFile(resolve(mailbox, 'telemetry.json'), 'utf8')));
        json(res, 200, { connected: true, state });
      } catch (error) { json(res, 200, { connected: false, state: null, reason: error?.code === 'ENOENT' ? 'Keine native Telemetrie. Die C++-Bridge benötigt einen eigenen Windows-Build.' : error.message }); }
      return;
    }
    if (path === '/api/native/command' && req.method === 'POST') {
      if (!allowedOrigins.has(req.headers.origin)) { json(res, 403, { error: 'Unzulässiger Ursprung.' }); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: 'JSON erforderlich.' }); return; }
      const command = validateCommand(await body(req));
      const op = commandQueue.then(async () => {
        const seq = ++sequence;
        if (command.reset && !previousReset) resetId++;
        previousReset = command.reset;
        const temp = resolve(mailbox, 'command.tmp');
        await writeFile(temp, commandLine(command, seq, Date.now(), resetId), 'utf8');
        await rename(temp, resolve(mailbox, 'command.txt'));
        return { accepted: true, sequence: seq, resetId, applied: false };
      });
      commandQueue = op.catch(() => {});
      json(res, 202, await op); return;
    }
    if (path.startsWith('/api/')) { json(res, 404, { error: 'Unbekannter lokaler Endpunkt.' }); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Methode nicht erlaubt.' }); return; }
    const file = resolve(dist, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(dist + sep)) { json(res, 403, { error: 'Pfad nicht erlaubt.' }); return; }
    let bytes;
    try { bytes = await readFile(file); }
    catch { if (extname(path)) { json(res, 404, { error: 'Datei fehlt.' }); return; } bytes = await readFile(resolve(dist, 'index.html')); }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${websocketSources} blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : 'Lokaler Serverfehler.' }); }
});
const realtime=installRealtimeSockets(server,physicalCore,{allowedHosts,allowedOrigins,dispatchCommand(raw){const op=commandQueue.then(()=>physicalCore.command(raw));commandQueue=op.catch(()=>{});return op;}});
// A hosted engine should not consume a CPU after its last viewer leaves.
// Open telemetry/audio streams keep it alive, including background browser tabs.
let lastCoreUse=Date.now();
if(publicUrl)setInterval(()=>{
  if(physicalCore.clients.size||physicalCore.stateClients.size){lastCoreUse=Date.now();return;}
  if(physicalCore.child&&Date.now()-lastCoreUse>30000)physicalCore.child.stdin.end();
},5000).unref();
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} ist bereits belegt. Nutze --port 4174 oder den laufenden Server.` : error.message); process.exit(1); });
server.listen(port, bindHost, () => console.log(`Engine Playground v${appVersion} läuft auf ${publicOrigin||`http://127.0.0.1:${port}`}\nOriginaler Motor- und Soundkern verfügbar.`));
function existsCore(){return existsSync(resolve(root,'native/headless/bin',process.env.EP_CORE_BINARY||(process.platform==='win32'?'engine-core.exe':'engine-core')));}
function close(){realtime.close();physicalCore.close();server.close(()=>process.exit(0));}
process.on('SIGINT',close);process.on('SIGTERM',close);
