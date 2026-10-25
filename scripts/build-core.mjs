import {setPriority} from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = resolve(project, 'native/source');
const target = resolve(project, 'native/headless');
const outputName=process.env.EP_CORE_BINARY||'engine-core.exe';
if(!/^engine-core(-next)?\.exe$/.test(outputName))throw Error('Invalid build output name');
const toolsRoot = resolve(project, '../../work/toolchains');
const cxx = resolve(toolsRoot, 'llvm-mingw-20261006-ucrt-x86_64/bin/clang++.exe');
const flex = resolve(toolsRoot, 'winflex/win_flex.exe'), bison = resolve(toolsRoot, 'winflex/win_bison.exe');
if (![cxx, flex, bison].every(existsSync)) throw new Error('Portable LLVM-MinGW and winflexbison are required in work/toolchains.');
mkdirSync(target, { recursive: true });
const copy = (from, to) => cpSync(resolve(upstream, from), resolve(target, to), { recursive: true });
if (!existsSync(resolve(target, 'PORTED.json'))) {
  copy('include', 'engine/include'); copy('src', 'engine/src'); copy('scripting', 'engine/scripting');
  copy('dependencies/submodules/simple-2d-constraint-solver/include', 'solver/include'); copy('dependencies/submodules/simple-2d-constraint-solver/src', 'solver/src');
  copy('dependencies/submodules/piranha/include', 'piranha/include'); copy('dependencies/submodules/piranha/src', 'piranha/src');
  copy('dependencies/submodules/piranha/flex-bison', 'piranha/flex-bison');
  copy('dependencies/submodules/piranha/dependencies/libraries/flex/include', 'piranha/flex-include');
  copy('dependencies/submodules/csv-io/include', 'csv-io/include'); copy('dependencies/submodules/csv-io/src', 'csv-io/src');
  copy('es', 'es'); copy('assets', 'assets');
  const patch = (name, change) => { const file = resolve(target, name); writeFileSync(file, change(readFileSync(file, 'utf8'))); };
  patch('engine/include/scs.h', s => s.replace('../dependencies/submodules/simple-2d-constraint-solver/include/scs.h', '../../solver/include/scs.h'));
  patch('piranha/include/path.h', s => s.replace(/\/\/ Forward Boost declaration[\s\S]*?namespace piranha/, '#include <filesystem>\n\nnamespace piranha').replaceAll('boost::filesystem', 'std::filesystem'));
  patch('piranha/src/path.cpp', s => s.replace('#include <boost/filesystem.hpp>', '#include <filesystem>').replaceAll('boost::filesystem', 'std::filesystem').replace('->is_complete()', '->is_absolute()'));
  patch('engine/include/crankshaft.h', s => s.replace('        inline double getFlywheelMass()', '        void setPlaygroundInertia(double value) { m_I = value; m_body.I = value; }\n        inline double getFlywheelMass()'));
  patch('engine/include/transmission.h', s => s.replace('        inline int getGear()', '        double playgroundRatio() const { return m_gear < 0 ? 0 : m_gearRatios[m_gear]; }\n        double playgroundClutchTorque() const { return m_clutchConstraint.F_t[0][0]; }\n        double playgroundOutputOmega() const { return m_rotatingMass->v_theta; }\n        void playgroundRatios(const double *ratios) { for (int i=0;i<m_gearCount && i<5;i++) m_gearRatios[i]=ratios[i]; }\n        inline int getGear()'));
  patch('engine/include/vehicle.h', s => s.replace('return m_rollingResistance;', 'return m_rollingResistance + m_playgroundBrake;').replace('        void update(double dt);', '        void update(double dt);\n        double m_playgroundBrake = 0;'));
  writeFileSync(resolve(target, 'PORTED.json'), JSON.stringify({ originalCommit: '85f7c3b959a908ed5232ede4f1a4ac7eafe6b630', changes: ['console host', 'std::filesystem instead of Boost.Filesystem', 'runtime inertia/ratios/brake accessors'], license: 'MIT original engine-sim; retained dependency notices' }, null, 2));
}
for (const [from, to] of [['LICENSE','ENGINE_SIM_LICENSE.txt'],['dependencies/submodules/simple-2d-constraint-solver/LICENSE','SOLVER_LICENSE.txt'],['dependencies/submodules/csv-io/LICENSE','CSV_LICENSE.txt']]) if (existsSync(resolve(upstream,from))) copy(from, to);
const gasHeader = resolve(target, 'engine/include/gas_system.h');
writeFileSync(gasHeader, readFileSync(gasHeader, 'utf8').replaceAll('const Mix &mix = {}', 'const Mix &mix = {0.0, 1.0, 0.0}'));
const ringHeader=resolve(target,'engine/include/ring_buffer.h');
writeFileSync(ringHeader,readFileSync(ringHeader,'utf8').replace('if (start + index < m_capacity)','if (m_start + index < m_capacity)'));
const synthSource=resolve(target,'engine/src/synthesizer.cpp');
writeFileSync(synthSource,readFileSync(synthSource,'utf8').replace('#include "../include/delta.h"',''));
const allocatorHeader=resolve(target,'piranha/include/standard_allocator.h');
writeFileSync(allocatorHeader,readFileSync(allocatorHeader,'utf8')
  .replace(/#include <cstdlib>(?:\r?\n#include <malloc.h>)*/, '#include <cstdlib>\n#include <malloc.h>')
  .replace(/#ifdef _MSC_VER[\s\S]*?std::aligned_alloc\(alignment, sizeof\(t_alloc\) \* n\);\s*#endif/,
    'void *buffer = _aligned_malloc(sizeof(t_alloc) * n, std::max<unsigned int>(alignment, sizeof(void *)));')
  .replace(/[^\r\n]*free\(FTRACK\(\(void \*\)memory\)\);/, '            ::_aligned_free(FTRACK((void *)memory));'));
const referenceHeader=resolve(target,'engine/scripting/include/object_reference_node.h');
writeFileSync(referenceHeader,readFileSync(referenceHeader,'utf8').replaceAll('\r\n','\n')
  .replace('template <typename Type>\n        void overrideType()', 'template <typename OverrideType>\n        void overrideType()')
  .replace('m_output.overrideType(LookupChannelType<Type>());', 'm_output.overrideType(LookupChannelType<OverrideType>());'));
const sparseHeader=resolve(target,'solver/include/sparse_matrix.h');
if (!readFileSync(sparseHeader,'utf8').includes('#include "matrix.h"')) writeFileSync(sparseHeader, '#include "matrix.h"\n' + readFileSync(sparseHeader,'utf8'));
for (const name of ['engine/include/constants.h','engine/include/units.h']) {
  const file=resolve(target,name); writeFileSync(file,readFileSync(file,'utf8').replaceAll('extern constexpr', 'inline constexpr'));
}
const vehicleHeader=resolve(target,'engine/include/vehicle.h');
if (!readFileSync(vehicleHeader,'utf8').includes('playgroundConfigure')) writeFileSync(vehicleHeader,readFileSync(vehicleHeader,'utf8').replace('double m_playgroundBrake = 0;', 'double m_playgroundBrake = 0;\n        void playgroundConfigure(const Parameters &params) { const double beforeMass = m_mass; initialize(params); if (m_rotatingMass && beforeMass > 0) m_rotatingMass->I *= m_mass / beforeMass; }'));
mkdirSync(resolve(target, 'bin'), { recursive: true }); mkdirSync(resolve(target, 'obj'), { recursive: true });
async function run(exe, args) {
  return new Promise((ok, fail) => {
    const child = spawn(exe, args, { cwd: target, windowsHide: true }); try{setPriority(child.pid,10);}catch{} let log = '';
    child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
    child.on('error', fail); child.on('exit', code => code === 0 ? ok(log) : fail(new Error(`${basename(exe)} ${args.at(-1)}\n${log.slice(-12000)}`)));
  });
}
await run(bison, ['--defines=piranha/src/parser.auto.h', '-o', 'piranha/src/parser.auto.cpp', 'piranha/flex-bison/specification.y']);
await run(flex, ['-o', 'piranha/src/scanner.auto.cpp', 'piranha/flex-bison/scanner.l']);
const sourceManifest=resolve(target,'SOURCES.json');
const core = existsSync(sourceManifest) ? JSON.parse(readFileSync(sourceManifest,'utf8')).core : readFileSync(resolve(upstream,'CMakeLists.txt'),'utf8').split('add_library(engine-sim STATIC')[1].split('target_link_libraries(engine-sim')[0].match(/src\/[a-z_]+\.cpp/g).map(s => 'engine/' + s);
writeFileSync(sourceManifest, JSON.stringify({core},null,2));
const list = dir => readdirSync(resolve(target, dir)).filter(f => f.endsWith('.cpp') && f !== 'main.cpp').map(f => `${dir}/${f}`);
const sources = [...core, ...list('engine/scripting/src'), ...list('solver/src'), ...list('piranha/src'), ...list('csv-io/src'), 'core_host.cpp'];
const common = ['-std=c++17', '-O3', '-flto=thin', '-DNDEBUG', '-fms-extensions', '-D_CRT_SECURE_NO_WARNINGS', '-D_USE_MATH_DEFINES', '-include', 'cstring', '-include', 'algorithm', '-include', 'cassert', '-include', 'cmath', '-include', 'cstdlib', '-I.', '-Iengine/include', '-Iengine/scripting/include', '-Ipiranha/include', '-Ipiranha/src', '-Ipiranha/flex-include', '-Isolver/include', '-Icsv-io/include'];
let cursor = 0, completed = 0; const objects = [];
await Promise.all(Array.from({length:2}, async () => {
  while (cursor < sources.length) {
    const file = sources[cursor++], object = 'obj/' + file.replaceAll('/', '_').replace('.cpp', '.o'); objects.push(object);
    if (!existsSync(resolve(target, object)) || statSync(resolve(target, file)).mtimeMs > statSync(resolve(target, object)).mtimeMs || process.argv.includes('--all')) await run(cxx, [...common, '-c', file, '-o', object]);
    completed++; if (completed % 30 === 0) console.log(`Compiled ${completed}/${sources.length}`);
  }
}));
writeFileSync(resolve(target, 'objects.rsp'), objects.map(x => '"' + x + '"').join('\n'));
console.log(await run(cxx, ['-O3','-flto=thin','-static', '@objects.rsp', '-o', 'bin/'+outputName]));
console.log('Native physical Engine Simulator core built: native/headless/bin/engine-core.exe');
writeFileSync(resolve(target,'BUILD.json'),JSON.stringify({originalCommit:'85f7c3b959a908ed5232ede4f1a4ac7eafe6b630',builtAt:new Date().toISOString(),compiler:(await run(cxx,['--version'])).split('\n')[0],toolchain:'llvm-mingw-20261006-ucrt-x86_64',winflexbison:'2.5.25',sources:sources.length,flags:common,link:'-O3 -flto=thin -static',executableSha256:createHash('sha256').update(readFileSync(resolve(target,'bin/'+outputName))).digest('hex')},null,2));
writeFileSync(resolve(target,'PORTED.json'),JSON.stringify({originalCommit:'85f7c3b959a908ed5232ede4f1a4ac7eafe6b630',changes:['Own console host and IPC/audio streaming','Zero-latency partitioned FFT convolution, direct first 128 taps; all original IR taps retained and tested against scalar FIR','Fixed PCM clock without DirectSound latency feedback; script-defined 10000 Hz physics without adaptive reduction','Windows AboveNormal process priority and optional 32 MB working-set protection','Piranha std::filesystem instead of Boost.Filesystem','Windows aligned allocation with matching free and correct size/alignment order','Clang template parameter shadow fix','Complete Matrix definition in solver template','C++17 inline constexpr constants instead of duplicate extern definitions','Explicit default gas Mix for Clang','RingBuffer m_start typo correction','Removed unused graphical delta.h include from Synthesizer','Runtime crank inertia, gear ratios, brake and mass update accessors','Optional explicit idle assist (off by default), pedal lag, sampled calculated cycle, derived telemetry and assumed heat fraction'],enginePhysics:'original algorithms; compatibility fixes and runtime accessors described above',license:'Retained original/dependency notices; no license assumption for Community Edition'},null,2));
