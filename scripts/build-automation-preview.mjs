import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const outDir=resolve(root,'dist','automation-preview');
// A preview build only writes its own subtree. Existing main and Fachchat
// outputs remain available, including currently open preview pages.
// A visual release may retain an explicitly captured, stable audio/control entry
// while the audio owner continues a separate candidate in the shared sources.
const overlay=process.env.EP_RELEASE_ENTRY_OVERLAY;
const plugins=overlay?[{name:'captured-release-entry',enforce:'pre',async load(id){
  const clean=id.split('?')[0].replaceAll('\\','/');
  for(const file of ['main.ts','audio.ts'])if(clean===resolve(root,'src',file).replaceAll('\\','/'))
    return readFile(resolve(overlay,file),'utf8');
}}]:[];
await build({root,base:'/automation-preview/',plugins,build:{outDir,emptyOutDir:false}});
console.log('Automation-Vorschau: http://127.0.0.1:4196/automation-preview/index.html?workshop=automation#mechanics');
