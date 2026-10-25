// Compile current sources into this round's evidence only; no shared build script.
import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, 'native/headless');
const output = resolve(project, 'evidence/sound-m54-r6/build');
const compiler = process.env.EP_R6_CXX || 'C:/Users/demo/Documents/Codex/2026-10-14/files-pasted-by-the-user-du/work/toolchains/llvm-mingw-20261006-ucrt-x86_64/bin/clang++.exe';
if (!existsSync(compiler)) throw Error('Existing compiler unavailable; no installation authorized.');
mkdirSync(output, { recursive: true });
const list = dir => readdirSync(resolve(root, dir)).filter(f => f.endsWith('.cpp') && f !== 'main.cpp').map(f => `${dir}/${f}`);
const sources = [...JSON.parse(readFileSync(resolve(root, 'SOURCES.json'))).core, ...list('engine/scripting/src'), ...list('solver/src'), ...list('piranha/src'), ...list('csv-io/src'), 'core_host.cpp'];
const flags = ['-std=c++17', '-O3', '-flto=thin', '-DNDEBUG', '-fms-extensions', '-D_CRT_SECURE_NO_WARNINGS', '-D_USE_MATH_DEFINES', '-include', 'cstring', '-include', 'algorithm', '-include', 'cassert', '-include', 'cmath', '-include', 'cstdlib', '-I.', '-Iengine/include', '-Iengine/scripting/include', '-Ipiranha/include', '-Ipiranha/src', '-Ipiranha/flex-include', '-Isolver/include', '-Icsv-io/include'];
const run = args => new Promise((ok, fail) => {
  const child = spawn(compiler, args, { cwd: root, windowsHide: true });
  try { setPriority(child.pid, 10); } catch {}
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  child.on('error', fail); child.on('exit', code => code ? fail(Error(log.slice(-7000))) : ok(log));
});
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const objects = [], input = sources.map(file => ({ file, sha256: hash(resolve(root, file)) }));
const hostOnly = process.argv.includes('--host-only');
const previous = hostOnly ? JSON.parse(readFileSync(resolve(output, 'build.json'))) : null;
if (hostOnly && input.some(s => s.file !== 'core_host.cpp' && previous.sources.find(p => p.file === s.file)?.sha256 !== s.sha256)) throw Error('Non-host source changed; full isolated rebuild required.');
console.log(`R6 isolated compile: ${sources.length} sources, one compiler process at a time`);
for (let i = 0; i < sources.length; i++) {
  const file = sources[i], object = resolve(output, `${String(i).padStart(3, '0')}.o`);
  if (!hostOnly || file === 'core_host.cpp') await run([...flags, '-c', file, '-o', object]);
  else if (!existsSync(object)) throw Error('Missing object; full isolated rebuild required.');
  objects.push(object);
  if ((i + 1) % 20 === 0) console.log(`Compiled ${i + 1}/${sources.length}`);
}
const response = resolve(output, 'objects.rsp');
writeFileSync(response, objects.map(o => JSON.stringify(o.replaceAll('\\', '/'))).join('\n'));
const binary = resolve(output, 'sound-m54-r6.exe');
await run(['-O3', '-flto=thin', '-Wl,--threads=1', '-static', '@' + response, '-o', binary]);
writeFileSync(resolve(output, 'build.json'), JSON.stringify({ builtAt: new Date().toISOString(), compiler: (await run(['--version'])).split('\n')[0], flags, sources: input, binary, sha256: hash(binary) }, null, 2));
console.log(JSON.stringify({ binary, sha256: hash(binary) }));
