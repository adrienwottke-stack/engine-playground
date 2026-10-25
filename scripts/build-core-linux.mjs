import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This build targets Linux x86_64: the existing native audio convolution uses SSE.');
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(project,'native/headless');
const build=resolve(target,'build-linux');
const generated=resolve(build,'generated/piranha/src');
const objectDirectory=resolve(build,'obj');
const cxx=process.env.CXX||'g++';
const jobs=Number(process.env.EP_BUILD_JOBS||1);
if(!Number.isInteger(jobs)||jobs<1||jobs>8)throw new Error('EP_BUILD_JOBS must be an integer from 1 to 8.');
const outputName=process.env.EP_CORE_BINARY||'engine-core';
if(!/^engine-core(?:-next)?$/.test(outputName))throw new Error('EP_CORE_BINARY must be engine-core or engine-core-next on Linux.');
for(const directory of [generated,objectDirectory,resolve(target,'bin')])mkdirSync(directory,{recursive:true});
// Generated parser sources retain upstream ../include references. Use a build-local
// symlink instead of overwriting the checked-in Windows-generated parser or headers.
const generatedInclude=resolve(generated,'../include');
if(!existsSync(generatedInclude))symlinkSync(relative(dirname(generatedInclude),resolve(target,'piranha/include')),generatedInclude,'dir');

function run(executable,args){
  return new Promise((resolveResult,reject)=>{
    const child=spawn(executable,args,{cwd:target,stdio:['ignore','pipe','pipe']});
    let log='';const capture=data=>{log=(log+data.toString()).slice(-24000);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    child.once('error',reject);
    child.once('exit',code=>code===0?resolveResult(log):reject(new Error(`${executable} failed (${code}): ${args.join(' ')}\n${log}`)));
  });
}

const compiler=(await run(cxx,['--version'])).split('\n')[0];
await run('bison',[`--defines=${resolve(generated,'parser.auto.h')}`,'-o',resolve(generated,'parser.auto.cpp'),'piranha/flex-bison/specification.y']);
await run('flex',['-o',resolve(generated,'scanner.auto.cpp'),'piranha/flex-bison/scanner.l']);
const list=directory=>readdirSync(resolve(target,directory)).filter(name=>name.endsWith('.cpp')&&name!=='main.cpp'&&!name.endsWith('.auto.cpp')).sort().map(name=>`${directory}/${name}`);
const core=JSON.parse(readFileSync(resolve(target,'SOURCES.json'),'utf8')).core;
if(!Array.isArray(core)||!core.length)throw new Error('The existing headless physical-core source manifest is required.');
const sources=[...core,...list('engine/scripting/src'),...list('solver/src'),...list('piranha/src'),...list('csv-io/src'),resolve(generated,'parser.auto.cpp'),resolve(generated,'scanner.auto.cpp'),'core_host.cpp'];
// GCC accepts the original MSVC-style members (for example Piston *Piston) as
// warnings with -fpermissive. Retain their public names and the existing algorithms.
// Opt-in whole-program optimization retains IEEE finite/NaN checks and the
// original 10 kHz solver. Bound LTO to one job on the shared deployment host.
const realtime=process.env.EP_OPTIMIZE_REALTIME==='1';
const optimization=realtime?['-O3','-flto=1','-fno-math-errno']:['-O2'];
const flags=['-std=c++17',...optimization,'-DNDEBUG','-pthread','-fpermissive','-fno-strict-aliasing','-D_USE_MATH_DEFINES','-include',resolve(target,'linux_compat.h'),'-I.',`-I${generated}`,'-Iengine/include','-Iengine/scripting/include','-Ipiranha/include','-Ipiranha/src','-Isolver/include','-Icsv-io/include'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const headerFiles=[];
function collectHeaders(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=resolve(directory,entry.name);
    if(entry.isDirectory())collectHeaders(file);
    else if(entry.isFile()&&/\.(?:h|hh|hpp|hxx|inc|inl)$/.test(entry.name))headerFiles.push(file);
  }
}
for(const directory of ['engine','solver','piranha','csv-io'])collectHeaders(resolve(target,directory));
headerFiles.push(resolve(target,'linux_compat.h'),resolve(generated,'parser.auto.h'));
// The Flex C++ interface is the only directly included external nonstandard header.
if(existsSync('/usr/include/FlexLexer.h'))headerFiles.push('/usr/include/FlexLexer.h');
const headers=createHash('sha256');
for(const file of headerFiles.sort()){headers.update(file);headers.update('\0');headers.update(readFileSync(file));headers.update('\0');}
const sharedKey=hash(JSON.stringify({compiler,cxx,flags,sources,headers:headers.digest('hex'),manifest:readFileSync(resolve(target,'SOURCES.json'),'utf8')}));
const cacheFile=resolve(build,'object-cache.json');
let cache={version:1,objects:{}};
try{const previous=JSON.parse(readFileSync(cacheFile,'utf8'));if(previous.version===1&&previous.objects&&typeof previous.objects==='object')cache=previous;}catch{/* A missing or damaged cache triggers a full compile. */}
const saveCache=()=>writeFileSync(cacheFile,JSON.stringify(cache,null,2));
let cursor=0,completed=0,reused=0;
const objects=new Array(sources.length);
const perSourceFlags={};
const failures=[];
console.log(`Building the existing native physical core: ${sources.length} sources, ${jobs} job(s), ${compiler}`);
await Promise.all(Array.from({length:jobs},async()=>{
  while(cursor<sources.length){
    const index=cursor++,source=sources[index];
    const object=resolve(objectDirectory,`${String(index).padStart(3,'0')}.o`);objects[index]=object;
    // Deployment CPU advertises AVX2/FMA. Restrict its ISA to the measured hot
    // numerical units; other builds retain generic x86_64 compatibility.
    const hot=realtime&&process.env.EP_HOT_ISA==='v3'&&(/^(?:engine\/src\/(?:gas_system|combustion_chamber|piston_engine_simulator|function)|solver\/src\/)/.test(source)||source==='core_host.cpp');
    const sourceFlags=hot?['-march=x86-64-v3']:[];
    if(hot&&source==='engine/src/gas_system.cpp')sourceFlags.push('-fno-trapping-math','-fno-signed-zeros','-fassociative-math','-freciprocal-math');
    if(sourceFlags.length)perSourceFlags[source]=sourceFlags;
    const key=hash(sharedKey+'\0'+source+'\0'+(sourceFlags.length?JSON.stringify(sourceFlags)+'\0':'')+hash(readFileSync(resolve(target,source))));
    const cached=cache.objects[source];
    if(cached?.key===key&&cached.object===object&&existsSync(object)&&hash(readFileSync(object))===cached.objectSha256){
      reused++;
    }else{
      try{
        await run(cxx,[...flags,...sourceFlags,'-c',source,'-o',object]);
        cache.objects[source]={key,object,objectSha256:hash(readFileSync(object))};saveCache();
      }catch(error){
        delete cache.objects[source];saveCache();
        failures.push({source,error:error instanceof Error?error.message:String(error)});
        console.error(`Compile failed: ${source}; continuing to collect remaining errors.`);
      }
    }
    if(++completed%20===0||completed===sources.length)console.log(`Checked ${completed}/${sources.length}; reused ${reused}, failed ${failures.length}`);
  }
}));
if(failures.length){
  const log=failures.map(failure=>`SOURCE: ${failure.source}\n${failure.error}`).join('\n\n');
  const logFile=resolve(build,'compile-errors.log');writeFileSync(logFile,log);
  throw new Error(`${failures.length}/${sources.length} source files failed; linking skipped. Full compiler log: ${logFile}\n${log.slice(-24000)}`);
}
writeFileSync(resolve(build,'compile-errors.log'),'');
const executable=resolve(target,'bin',outputName);
await run(cxx,[...optimization,'-pthread',...objects,'-o',executable]);
writeFileSync(resolve(target,'BUILD.linux.json'),JSON.stringify({platform:'linux',architecture:'x64',builtAt:new Date().toISOString(),compiler,sources:sources.length,jobs,reusedObjects:reused,flags,perSourceFlags,executable:relative(target,executable),executableSha256:createHash('sha256').update(readFileSync(executable)).digest('hex'),scope:'Native engine-sim physics and Synthesizer with exact-zero sparse solver and closed-valve optimizations; build only, no self-test or hosted acceptance implied.'},null,2));
console.log(`Built ${executable}. Run acceptance separately; no engine process was started by this build.`);
