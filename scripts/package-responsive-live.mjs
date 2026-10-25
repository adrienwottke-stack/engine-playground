// Patch the deployed R5 bundle. Concurrent visual work in src/ is not packaged.
import ts from 'typescript';
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
const project=resolve(import.meta.dirname,'..'),run=resolve(project,'evidence/responsive-20261025'),base=resolve(process.env.RESPONSIVE_BASE_DIST||resolve(run,'live-dist')),target=resolve(run,'package');
const baseRelease=process.env.RESPONSIVE_BASE_RELEASE||'r5b-audio03-20261025';
assert.match(baseRelease,/^[a-z0-9-]+$/);
await mkdir(target,{recursive:true});await cp(base,resolve(target,'dist'),{recursive:true});
const html=await readFile(resolve(base,'index.html'),'utf8'),entry=html.match(/src="([^"]+\/index-[^"/]+\.js)"/)[1];
const original=await readFile(resolve(base,'.'+entry),'utf8'),ast=ts.createSourceFile('live.js',original,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
const classes=[],streams=[],slowNames=new Set(),polls=[],flushFunctions=[],graphicsWarmups=[],starts=[],startDisabled=[];
function scan(n){
 if(ts.isClassDeclaration(n)&&n.members.some(m=>m.name?.getText(ast)==='volume')&&n.members.some(m=>m.name?.getText(ast)==='enable'))classes.push(n);
 if(ts.isNewExpression(n)&&n.expression.getText(ast)==='EventSource'&&n.arguments?.[0]?.getText(ast).includes('/api/core/events'))streams.push(n);
 if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='slow'&&ts.isIdentifier(n.initializer))slowNames.add(n.initializer.text);
 if(ts.isStringLiteral(n)&&n.text==='/api/core/state')polls.push(n);
 if(ts.isFunctionDeclaration(n)&&n.body&&n.body.getText(ast).includes('/api/core/command')&&n.body.getText(ast).includes('JSON.stringify'))flushFunctions.push(n);
 if(ts.isAwaitExpression(n)&&n.expression.getText(ast).includes('.renderer.compileAsync'))graphicsWarmups.push(n);
 if(ts.isFunctionDeclaration(n)&&n.body&&n.body.getText(ast).includes('.enable(')&&n.body.getText(ast).includes('.ignition=!0'))starts.push(n);
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&/\("start"\)\.disabled$/.test(n.left.getText(ast)))startDisabled.push(n);
 ts.forEachChild(n,scan);
}scan(ast);
assert.equal(classes.length,1);assert.equal(streams.length,1);assert.equal(slowNames.size,1);assert.ok(polls.length>=1);
assert.equal(graphicsWarmups.length,1);assert.equal(starts.length,1);assert.equal(startDisabled.length,1);
const flush=flushFunctions.find(f=>f.body.getText(ast).includes('clientId:'));assert.ok(flush,'Missing claimed command function');
let bodyObject;
function payloadScan(n){if(ts.isObjectLiteralExpression(n)&&n.properties.some(p=>p.name?.getText(ast)==='clientId')&&n.properties.some(p=>p.name?.getText(ast)==='controls'))bodyObject=n;ts.forEachChild(n,payloadScan);}payloadScan(flush.body);assert.ok(bodyObject);
const fields=Object.fromEntries(bodyObject.properties.filter(p=>p.name).map(p=>[p.name.getText(ast),ts.isShorthandPropertyAssignment(p)?p.name.getText(ast):p.initializer.getText(ast)]));
const update=`window.__nativeControlUpdate?.({clientId:${fields.clientId},controls:${fields.controls},ignition:${fields.ignition},starter:${fields.starter},active:${fields.active}});`;
const slow=[...slowNames][0],cls=classes[0];
const compiled=ts.transpileModule(await readFile(resolve(project,'src/audio.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export class EngineAudio','class '+cls.name.text);
const events=`new class {
 constructor(){this.handler=null;this.reconnect=()=>{this.stream?.close();this.stream=new EventSource(${slow}?'/api/core/events':'/api/core/events?compact=1');this.stream.onmessage=this.handler;};this.reconnect();for(const id of ['slow','cooling-slow'])document.getElementById(id)?.addEventListener('change',this.reconnect);}
 set onmessage(fn){this.handler=fn;this.stream.onmessage=fn;}
 get onmessage(){return this.handler;}
 close(){this.stream.close();for(const id of ['slow','cooling-slow'])document.getElementById(id)?.removeEventListener('change',this.reconnect);}
}()`;
const edits=[{start:cls.getStart(ast),end:cls.end,text:compiled},{start:flush.body.getStart(ast)+1,end:flush.body.getStart(ast)+1,text:update},{start:streams[0].getStart(ast),end:streams[0].end,text:events},...polls.map(n=>({start:n.getStart(ast),end:n.end,text:`(${slow}?'/api/core/state':'/api/core/state?compact=1')`}))];
const warm=graphicsWarmups[0],rendererOwner=warm.expression.expression.expression.expression.getText(ast);
edits.push({start:warm.getStart(ast),end:warm.end,text:`(${warm.getText(ast)},await(await import('/native-render-prewarm.js?v=0.5.0')).prepare(${rendererOwner}))`});
edits.push({start:starts[0].body.getStart(ast)+1,end:starts[0].body.getStart(ast)+1,text:'if(window.__nativeAudioReady&&!window.__nativeAudioReady())return;'});
const disabled=startDisabled[0].right;
edits.push({start:disabled.getStart(ast),end:disabled.end,text:`(${disabled.getText(ast)})||(!${fields.ignition}&&window.__nativeAudioReady&&!window.__nativeAudioReady())`});
let patched=original;for(const e of edits.sort((a,b)=>b.start-a.start))patched=patched.slice(0,e.start)+e.text+patched.slice(e.end);
patched='import "/native-control-client.js?v=0.5.0";\n'+patched.replaceAll(' · Ton ca. 1,2 s verzögert','');
assert.ok(!patched.includes('Ton ca. 1,2 s verzögert'));
const hash=b=>createHash('sha256').update(b).digest('hex'),newEntry=dirname(entry).replaceAll('\\','/')+'/index-responsive-'+hash(patched).slice(0,12)+'.js';
await writeFile(resolve(target,'dist','.'+newEntry),patched);
const retargeted=[];
async function retarget(folder){for(const d of await readdir(folder,{withFileTypes:true})){
 const path=resolve(folder,d.name);if(d.isDirectory()){await retarget(path);continue;}
 if(!/\.(js|html)$/.test(d.name))continue;
 const text=await readFile(path,'utf8');let next=text.replaceAll(entry,newEntry);
 if(path!==resolve(target,'dist','.'+newEntry))next=next.replaceAll('"./'+basename(entry)+'"','"./'+basename(newEntry)+'"');
 if(next!==text){await writeFile(path,next);retargeted.push(path.slice(target.length+1));}
}}
await retarget(resolve(target,'dist'));
for(const file of ['native-audio.js','native-stream.js','native-control.js','native-control-client.js','native-render-prewarm.js'])await cp(resolve(project,'public',file),resolve(target,'dist',file));
await cp(resolve(project,'server.mjs'),resolve(target,'server.mjs'));
await mkdir(resolve(target,'native'),{recursive:true});
for(const file of ['core-runtime.mjs','audio-framing.mjs','realtime-sockets.mjs','vendor'])await cp(resolve(project,'native',file),resolve(target,'native',file),{recursive:true});
await writeFile(resolve(target,'Dockerfile'),`FROM engine-playground:${baseRelease}\nCOPY dist /app/dist\nCOPY server.mjs /app/server.mjs\nCOPY native /app/native\n`);
const manifest={release:'responsive01-20261025',baseRelease,entry,newEntry,sha256:hash(patched),retargeted,bufferMs:160,maxRecoveryMs:160,files:[]};
async function files(folder){for(const d of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,d.name);if(d.isDirectory())await files(path);else manifest.files.push({path:path.slice(target.length+1).replaceAll('\\','/'),sha256:hash(await readFile(path))});}}
await files(target);await writeFile(resolve(run,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({...manifest,files:manifest.files.length}));
