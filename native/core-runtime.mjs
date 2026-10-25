import { DEFAULT_SOUND, validateSound, referenceScript } from './reference-settings.mjs';
import { DEFAULT_TUNING, validateTuning, tuningKey } from './tuning-settings.mjs';
import { ControlLease } from './control-lease.mjs';
import { frameAudio } from './audio-framing.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const finite = (x, min, max, name) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Error(`Ungültiger Wert: ${name}`); return x; };
export class PhysicalCore {
  constructor(project) {
    this.directory = resolve(project, 'native/headless'); this.child = null; this.state = null; this.reason = 'Physischer Motorkern startet …'; this.clients = new Set(); this.stateClients = new Set(); this.buffer = Buffer.alloc(0); this.sequence = Date.now()*1000; this.resetId = 0; this.stderr = ''; this.geometry = [84,89.6,135]; this.tuning=validateTuning(); this.scriptKey=JSON.stringify(['m54','default_0',tuningKey(this.tuning)]); this.sound={...DEFAULT_SOUND}; this.retryAt=0;
    this.confirmedTuningKey=null;this.confirmedTuningSequence=null;this.confirmedScriptKey=null;this.pendingTuning=null;
    // Each server gets private scripts so an independent test/reload cannot alter another engine.
    this.valveCurves=null;this.curvesPending=false;this.cycles=null;this.cyclesPending=false;
    const runtimeRoot=resolve(this.directory,'runtime');mkdirSync(runtimeRoot,{recursive:true});
    this.runtimeDirectory=mkdtempSync(resolve(runtimeRoot,'core-'));
    mkdirSync(resolve(this.runtimeDirectory,'bin'));
    this.assetsDirectory=resolve(this.runtimeDirectory,'assets');
    cpSync(resolve(this.directory,'assets'),this.assetsDirectory,{recursive:true});
    cpSync(resolve(this.directory,'es'),resolve(this.runtimeDirectory,'es'),{recursive:true});
    const original=readFileSync(resolve(this.directory,'assets/engines/bmw/M54B30.mr'),'utf8');
    writeFileSync(resolve(this.assetsDirectory,'runtime_i6.mr'),referenceScript(original,this.sound,this.geometry));
    writeFileSync(resolve(this.assetsDirectory,'main.mr'),'import "engine_sim.mr"\nimport "runtime_i6.mr"\nmain()\n');
    // This exact series script is written before the child can start. Its
    // selection becomes observable only when valid fresh native telemetry lands.
    this.bootTuning={key:tuningKey(DEFAULT_TUNING),scriptKey:this.scriptKey};
  }
  start() {
    if (this.child || Date.now()<this.retryAt) return;
    const executable = resolve(this.directory, 'bin', process.env.EP_CORE_BINARY || (process.platform==='win32'?'engine-core.exe':'engine-core'));
    if (!existsSync(executable)) { this.reason = 'Der physische Kern ist noch nicht gebaut.'; return; }
    const child = spawn(executable, [], { cwd: resolve(this.runtimeDirectory, 'bin'), windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child = child; this.buffer=Buffer.alloc(0);this.stderr='';
    child.stdin.on('error',()=>{});
    child.stdout.on('data', data => this.parse(data));
    child.stderr.on('data', data => { this.stderr = (this.stderr + data.toString()).slice(-3000); });
    child.on('error', e => { this.reason=e.message; this.child=null; this.state=null;this.retryAt=Date.now()+5000; });
    child.on('exit', code => { this.reason=`Physischer Motorkern beendet (${code}). ${this.stderr.slice(-500)}`;this.child=null;this.state=null;this.retryAt=Date.now()+5000;for(const client of this.clients)client.end();this.clients.clear(); });
  }
  parse(data) {
    this.buffer = Buffer.concat([this.buffer,data]);
    let stateChanged=false,includeCurves=false,includeCycles=false;
    while(this.buffer.length>=8) {
      const type=this.buffer.readUInt32LE(0), size=this.buffer.readUInt32LE(4);
      if(size>200000 || ![1,2,3,4].includes(type)) { this.reason='Ungültiger Datenrahmen vom Motorkern.'; this.buffer=Buffer.alloc(0); break; }
      if(this.buffer.length<8+size) break;
      const payload=this.buffer.subarray(8,8+size); this.buffer=this.buffer.subarray(8+size);
      if(type===1) {
        try { const s=JSON.parse(payload.toString('utf8')); if(s.source!=='ange-physical'||s.schemaVersion!==2||s.cylinders?.length!==6)throw new Error('Unvollständiger physischer Zustand');
          for(const key of ['timestampMs','sequence','t','rpm','omega','crankAngle','actualThrottle','speedKmh','wheelRpm','totalRatio','torqueNm','powerKw','wheelTorqueNm','slipRpm','clutchHeatKw','estimatedHeatKw','manifoldKpa'])if(!Number.isFinite(s[key]))throw new Error('Ungültiger Messwert '+key);
          for(const c of s.cylinders)for(const key of ['pressureKpa','gasTemperatureK','intakeLiftMm','exhaustLiftMm','fuelFraction'])if(!Number.isFinite(c[key]))throw new Error('Ungültiger Zylinderwert');
          this.state=s;this.reason='';stateChanged=true;includeCurves||=!!this.curvesPending;includeCycles||=!!this.cyclesPending;this.curvesPending=false;this.cyclesPending=false;
          if(Date.now()-s.timestampMs<1200){
            if(this.pendingTuning && s.sequence>=this.pendingTuning.sequence){this.confirmedTuningKey=this.pendingTuning.key;this.confirmedScriptKey=this.pendingTuning.scriptKey;this.pendingTuning=null;}
            else if(!this.pendingTuning && !this.confirmedTuningKey && this.bootTuning){this.confirmedTuningKey=this.bootTuning.key;this.confirmedScriptKey=this.bootTuning.scriptKey;}
            if(!this.pendingTuning && this.confirmedTuningKey)this.confirmedTuningSequence=s.sequence;
          } }
        catch(e){ this.state=null;this.reason='Physischer Zustand ungültig: '+e.message; }
      } else if(type===3) {
        try {
          const curves=JSON.parse(payload.toString('utf8')).valveCurves;
          if(!Array.isArray(curves?.samples)||curves.samples.length!==6||!curves.samples.every(rows=>Array.isArray(rows)&&rows.length===288&&rows.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(value=>Number.isFinite(value)&&value>=0&&value<=100))))throw new Error('Unvollständige Ventilkinematik');
          this.valveCurves=curves;this.curvesPending=true;this.cycles=[];this.cyclesPending=true;
        }catch(e){this.reason='Ventilkinematik ungültig: '+e.message;}
      } else if(type===4) {
        try{
          const cycles=JSON.parse(payload.toString('utf8')).cycles;
          if(!Array.isArray(cycles)||cycles.length!==6||!cycles.every((cycle,i)=>cycle.cylinder===i+1&&Array.isArray(cycle.samples)&&cycle.samples.length===144&&cycle.samples.every(row=>row===null||(Array.isArray(row)&&row.length===7&&row.every(value=>Number.isFinite(value)&&Math.abs(value)<1e12)&&(row[6]===0||row[6]===1)))))throw new Error('Unvollständige Zylinderzyklen');
          this.cycles=cycles;this.cyclesPending=true;
        }catch(e){this.reason='Zylinderzyklen ungültig: '+e.message;}
      } else {
        const framed=[...this.clients].some(client=>client.epFramed)?frameAudio(payload,this.state,this.audioFrame=(this.audioFrame??0)+1):null;
        for(const client of this.clients) { if(client.writableLength>65536){client.destroy();this.clients.delete(client);}else client.write(client.epFramed?framed:payload); }
      }
    }
    // One stdout delivery can contain several telemetry frames. Publish its
    // freshest state synchronously, retaining metadata consumed by earlier frames.
    // A trailing partial packet stays buffered without delaying this update.
    if(stateChanged)this.publishState(includeCurves,includeCycles);
  }
  snapshot(includeCurves=true,includeCycles=includeCurves,compact=false) { this.start(); const connected=!!this.state && Date.now()-this.state.timestampMs<1200; const state=connected?{...this.state,...(includeCurves&&this.valveCurves?{valveCurves:this.valveCurves}:{}),...(includeCycles&&this.cycles?{cycles:this.cycles}:{})}:null;if(compact&&state)delete state.cycle;return { connected, state, tuningKey:connected?this.confirmedTuningKey:null, tuningSequence:connected&&!this.pendingTuning?this.confirmedTuningSequence:null, reason:connected?'':this.reason||'Physischer Zustand veraltet.' }; }
  publishState(includeCurves=false,includeCycles=false) {
    if(!this.stateClients.size)return;
    let message;
    let compactMessage,compactCycleMessage;
    for(const client of this.stateClients){
      if(client.writableLength>65536){client.destroy();this.stateClients.delete(client);}
      else if(client.epCompact){
        const cycles=includeCycles&&Date.now()-(client.epCycleAt??0)>=1000;
        if(cycles){client.epCycleAt=Date.now();compactCycleMessage??='data: '+JSON.stringify(this.snapshot(includeCurves,true,true))+'\n\n';client.write(compactCycleMessage);}
        else {compactMessage??='data: '+JSON.stringify(this.snapshot(includeCurves,false,true))+'\n\n';client.write(compactMessage);}
      }else {message??='data: '+JSON.stringify(this.snapshot(includeCurves,includeCycles))+'\n\n';client.write(message);}
    }
  }
  events(res,compact=false) {
    res.socket?.setNoDelay(true);
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
    res.epCompact=compact;res.epCycleAt=Date.now();
    res.flushHeaders();res.write('retry: 500\ndata: '+JSON.stringify(this.snapshot(true,true,compact))+'\n\n');
    this.stateClients.add(res);res.on('close',()=>this.stateClients.delete(res));
  }
  async command(raw) {
    if(!raw || typeof raw !== 'object')throw new Error('Befehl fehlt.');
    const c=raw.controls, cfg=raw.config;
    if(!c||!cfg?.engine||!cfg?.vehicle)throw new Error('Bedienung und Konfiguration fehlen.');
    const e=cfg.engine,v=cfg.vehicle;
    if(!Array.isArray(v.gears)||v.gears.length!==5)throw new Error('Fünf Gänge erforderlich.');
    if(!Number.isInteger(c.gear))throw new Error('Ungültiger Gang.');
    for(const key of ['active','ignition','starter','reset'])if(typeof raw[key]!=='boolean')throw new Error('Ungültiger Schalter.');
    if(typeof c.dynoEnabled!=='boolean')throw new Error('Ungültiger Lastschalter.');
    const validated=[finite(c.throttle,0,1,'Gas'),finite(c.gear,0,5,'Gang'),finite(c.clutch,0,1,'Kupplung'),finite(c.dynoNm,0,200,'Last'),finite(e.flywheelKgM2,.04,1,'Trägheit'),finite(e.throttleLagS,0,2,'Gasverzögerung'),finite(v.massKg,400,3000,'Masse'),finite(v.finalDrive,2,5,'Achse'),finite(v.wheelRadiusM,.2,.45,'Radius'),finite(v.dragAreaM2,0,1.5,'Luftwiderstand'),finite(v.rollingCoefficient,0,.04,'Rollwiderstand'),finite(c.brake,0,1,'Bremse'),...v.gears.map(g=>finite(g,.5,5,'Übersetzung'))];
    const geometry=[finite(e.boreMm,70,100,'Bohrung'),finite(e.strokeMm,60,105,'Hub'),finite(e.rodMm,110,170,'Pleuel')];
    this.controlLease ??= new ControlLease();
    if (!this.controlLease.accept(raw.clientId, raw.claim)) return { accepted: false, reason: 'Ein anderes Playground-Fenster bedient den Motor.' };
    const sound=validateSound(cfg.sound);
    const tuning=validateTuning(cfg.tuning),partsKey=tuningKey(tuning);
    if(sound.preset==='i6' && partsKey!==tuningKey(DEFAULT_TUNING))throw new Error('Diese Tuningteile gehören zum BMW M52B28 / M54B30.');
    if(partsKey!==tuningKey(this.tuning) && (raw.ignition||raw.starter||c.throttle!==0||c.clutch!==0))throw new Error('Zum Einbauen zuerst den Motor stoppen, Gas lösen und Kupplung öffnen.');
    const focus=raw.focusCylinder??1;
    if(!Number.isInteger(focus)||focus<1||focus>6)throw new Error('Ungültiger Zylinder.');
    const scriptKey=JSON.stringify([sound.preset,sound.impulse,partsKey,...(sound.preset==='i6'?geometry:[])]);
    if(scriptKey!==this.scriptKey) {
      const file=sound.preset==='m54'?'assets/engines/bmw/M54B30.mr':sound.preset==='m52'?'assets/engines/bmw/M52B28.mr':'assets/engines/playground/i6_3l.mr';
      const script=referenceScript(await readFile(resolve(this.directory,file),'utf8'),sound,geometry,tuning);
      await writeFile(resolve(this.assetsDirectory,'runtime_i6.mr'),script);
      this.geometry=geometry;this.scriptKey=scriptKey;this.resetId++;
    }
    this.sound=sound;this.tuning=tuning;
    if(raw.reset)this.resetId++;
    const fields=[++this.sequence,Date.now(),+raw.active,validated[0],+raw.ignition,+raw.starter,validated[1],validated[2],+c.dynoEnabled,validated[3],.08,this.resetId,...validated.slice(4),sound.preset==='i6'?1:0,+sound.idleAssist,sound.hfGain,sound.noise,sound.jitter,sound.convolution,focus];
    this.start();if(!this.child?.stdin.writable)throw new Error('Physischer Kern nicht erreichbar.');
    // A written command is only queued. The matching valid native telemetry
    // confirms application; script compile/load failures therefore stay pending.
    if((this.pendingTuning?.scriptKey??this.confirmedScriptKey)!==scriptKey)this.pendingTuning={key:partsKey,sequence:this.sequence,scriptKey};
    this.child.stdin.write(fields.join(' ')+'\n');return {accepted:true,sequence:this.sequence,tuningKey:partsKey};
  }
  audio(res,framed=false) { this.start();res.epFramed=framed;res.socket?.setNoDelay(true); res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no','X-Audio-Sample-Rate':'44100','X-Audio-Format':framed?'epa2-s16le-mono':'s16le-mono'});res.flushHeaders();this.clients.add(res);res.on('close',()=>this.clients.delete(res)); }
  close() { if(this.child) this.child.stdin.end(); for(const client of [...this.clients,...this.stateClients])client.end();this.clients.clear();this.stateClients.clear(); }
}
