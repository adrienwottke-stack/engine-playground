import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {build} from 'esbuild';import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {castRibWithRoot} from '../src/engine-casting-blends';
import {disposeSceneResources} from '../src/engine-three-resources';
const require=createRequire(import.meta.url);
async function loadFactory(before:boolean){const compiled=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {createM54Block} from './src/engine-3d-block';"},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'frozen-neutral-comparison',setup(b){b.onLoad({filter:/[\\/]src[\\/]engine-material-profiles\.ts$/},()=>({contents:"import * as T from 'three';export function createEngineMaterial(color,metalness,roughness){return new T.MeshStandardMaterial({color,metalness,roughness});}",loader:'ts'}));if(before)b.onLoad({filter:/[\\/]src[\\/]engine-3d-block\.ts$/},async()=>({contents:await readFile('evidence/casting-r5/before/engine-3d-block.ts','utf8'),loader:'ts',resolveDir:`${process.cwd()}/src`}));}}]});const module={exports:{} as {createM54Block:(o:unknown)=>T.Group}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports.createM54Block;}
function sample(factory:(o:unknown)=>T.Group){const materials={machined:new T.MeshStandardMaterial(),steel:new T.MeshStandardMaterial(),black:new T.MeshStandardMaterial()},start=performance.now(),root=factory({deck:205,boreScale:1,materials}),ms=performance.now()-start;root.updateMatrixWorld(true);return {root,materials,ms};}
function isMesh(o:T.Object3D):o is T.Mesh{return (o as T.Mesh).isMesh===true;}
function triangles(root:T.Group){let n=0;root.traverse(o=>{if(isMesh(o))n+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});assert.ok(n>10000,'both module formats must actually be inspected');return n;}

test('R5 keeps the R4 bounding silhouette, machined openings and finite batch budget',async()=>{
  const before=sample(await loadFactory(true)),after=sample(await loadFactory(false));
  const bounds=(root:T.Group)=>new T.Box3().setFromObject(root);
  assert.ok(bounds(before.root).min.distanceTo(bounds(after.root).min)<1e-4);assert.ok(bounds(before.root).max.distanceTo(bounds(after.root).max)<1e-4);
  const machined=(s:typeof before)=>{const hashes:string[]=[];s.root.traverse(o=>{if(isMesh(o)&&o.material===s.materials.machined){const p=o.geometry.getAttribute('position');hashes.push(createHash('sha256').update(Buffer.from(p.array.buffer,p.array.byteOffset,p.array.byteLength)).digest('hex'));}});assert.ok(hashes.length>0);return hashes;};
  assert.deepEqual(machined(after),machined(before),'deck, rails and machined flange positions remain byte-identical');
  const nBefore=triangles(before.root),nAfter=triangles(after.root);assert.ok(nAfter<=nBefore*1.08,'local fillets must not trigger a full remesh');assert.equal(after.root.children.length,before.root.children.length);
  after.root.traverse(o=>{if(isMesh(o))for(const name of ['position','normal','uv']){const p=o.geometry.getAttribute(name);assert.ok(p,`${name} preserved for batching`);for(let i=0;i<p.array.length;i++)assert.ok(Number.isFinite(p.array[i]));}});
  await writeFile('evidence/casting-r5/geometry-budget.json',JSON.stringify({beforeTriangles:nBefore,afterTriangles:nAfter,changePercent:(nAfter/nBefore-1)*100,beforeBatches:before.root.children.length,afterBatches:after.root.children.length,neutralConstructionMs:{before:before.ms,after:after.ms},note:'Single neutral-factory sample under parallel work; not an integrated frame-time benchmark.'},null,2));
  disposeSceneResources(before.root);disposeSceneResources(after.root);
});

test('filleted replacement keeps its crest while meeting the backing skin with a broad root',()=>{
  for(const side of [-1,1]){const geometry=castRibWithRoot([0,-30,side*87],[0,30,side*87],9,18,()=>63,5),root=new T.Mesh(geometry,new T.MeshStandardMaterial());root.updateMatrixWorld(true);
    const hit=(x:number)=>new T.Raycaster(new T.Vector3(x,0,side*160),new T.Vector3(0,0,-side)).intersectObject(root)[0];
    assert.ok(Math.abs(Math.abs(hit(0).point.z)-96)<1e-4,'existing crest is fixed');assert.ok(Math.abs(hit(8).point.z)<67,'foot flares into the backing instead of hovering above it');assert.ok(Math.abs(hit(8).normal!.z)>.8,'outer root approaches the skin normal');geometry.dispose();(root.material as T.Material).dispose();
  }
});
