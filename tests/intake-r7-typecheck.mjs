/** Type-check shared integration in memory, without editing shared files. */
import ts from 'typescript';
import {basename} from 'node:path';
import {intakeR7Integration} from './intake-r7-integration.mjs';
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,noEmit:true,types:['vite/client','node']};
const host=ts.createCompilerHost(options),read=host.readFile.bind(host);
host.readFile=path=>{const source=read(path);return source&&/[\\/]src[\\/]/.test(path)&&['engine-3d-layout.ts','engine-flow-view.ts','engine-three.ts'].includes(basename(path))?intakeR7Integration(basename(path),source):source;};
const program=ts.createProgram(['src/engine-three.ts','tests/intake-r7.test.ts'],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));process.exit(1);}
console.log('R7 intake plus all three shared source adapters type-check successfully in memory.');
