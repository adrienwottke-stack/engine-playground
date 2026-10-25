// Preserve the live UI byte-for-byte outside its audio class and volume markup.
// The live source UI predates the local workshop. Parse its actual JS AST, then
// substitute the compiled, tested audio.ts class instead of rebuilding that UI.
import ts from 'typescript';
import { readFile, writeFile, cp, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const evidence=new URL('../evidence/audio-fix-20261025/',import.meta.url);
const baseline=new URL('live-dist/',evidence),output=new URL('patched-dist/',evidence);
await mkdir(output,{recursive:true});await cp(baseline,output,{recursive:true});
let html=await readFile(new URL('index.html',baseline),'utf8');
const asset=html.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
const original=await readFile(new URL('.'+asset,baseline),'utf8');
const ast=ts.createSourceFile('live.js',original,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
const classes=ast.statements.filter(node=>ts.isClassDeclaration(node)&&node.members.some(member=>member.name?.getText(ast)==='volume')&&node.members.some(member=>member.name?.getText(ast)==='enable'));
assert.equal(classes.length,1,'Expected exactly the live EngineAudio class');
const node=classes[0];
const source=await readFile(new URL('../src/audio.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
assert.ok(compiled.includes('export class EngineAudio'));
const replacement=compiled.replace('export class EngineAudio',`class ${node.name.text}`);
let patched=original.slice(0,node.getStart(ast))+replacement+original.slice(node.end);
const oldMarkup='id="volume" type="range" min="0" max="35" value="8"';
assert.equal(patched.split(oldMarkup).length,2);
patched=patched.replace(oldMarkup,'id="volume" type="range" min="0" max="100" value="50"').replace('id="volume-output">8 %','id="volume-output">50 %');
const originalNote='AngeTheGreat: originaler Motor- und Soundkern · Kühlung als separates Wärmemodell';
assert.equal(patched.split(originalNote).length,2);
patched=patched.replace(originalNote,'AngeTheGreat: Motor- und Soundkern · Servermodus 4.000 Hz (Referenz 10.000 Hz) · Ton folgt dem Gas mit ca. 1,2 s Verzögerung · Kühlung als separates Wärmemodell');
const name='/assets/index-audio-'+createHash('sha256').update(patched).digest('hex').slice(0,12)+'.js';
await writeFile(new URL('.'+name,output),patched);
// Vite's lazy 3D chunk imports shared bindings from the entry module. Retarget
// that back-reference too, otherwise opening 3D boots a second copy of the app.
const relOld='./'+asset.split('/').at(-1),relNew='./'+name.split('/').at(-1),retargeted=[];
for(const file of await readdir(new URL('assets/',baseline))){
  if(!file.endsWith('.js'))continue;
  const text=await readFile(new URL('assets/'+file,baseline),'utf8');
  if(text.includes('"'+relOld+'"')){
    await writeFile(new URL('assets/'+file,output),text.replaceAll('"'+relOld+'"','"'+relNew+'"'));
    retargeted.push(file);
  }
}
assert.equal(retargeted.length,1,'Expected exactly the current lazy 3D back-reference');
html=html.replace(asset,name).replace('<html lang="de">','<html lang="de" data-hosted-audio="true">');
await writeFile(new URL('index.html',output),html);
for(const file of ['native-audio.js','native-stream.js','engine-audio.js'])await cp(new URL('../public/'+file,import.meta.url),new URL(file,output));
const manifest={baselineAsset:asset,baselineSha256:createHash('sha256').update(original).digest('hex'),asset:name,sha256:createHash('sha256').update(patched).digest('hex'),retargeted,replacedClass:node.name.text,source:'src/audio.ts',defaultVolume:.5,maxVolume:1,hostedBufferMs:1200};
await writeFile(new URL('frontend-patch.json',evidence),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
