import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Matrix4,Vector3,Quaternion} from 'three';
import {PISTON_SPEC} from '../src/piston-spec';

function load(name:string){
 const buffer=readFileSync(new URL('../public/models/'+name,import.meta.url));
 assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const length=buffer.readUInt32LE(12);assert.equal(buffer.readUInt32LE(16),0x4e4f534a);
 const document=JSON.parse(buffer.toString('utf8',20,20+length));
 const nodes:{node:any;matrix:Matrix4}[]=[];
 const visit=(id:number,parent:Matrix4)=>{
  const node=document.nodes[id],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
  const matrix=parent.clone().multiply(local);nodes.push({node,matrix});for(const child of node.children??[])visit(child,matrix);
 };
 for(const id of document.scenes[document.scene??0].nodes)visit(id,new Matrix4());
 return {document,nodes,buffer};
}

for(const name of ['m52-piston-reference.glb','m52-piston-engine.glb'])test(`${name}: actual exported datums, hollow-pin dimensions and split assembly remain usable`,()=>{
 const {document,nodes,buffer}=load(name);
 const pieces=nodes.filter(item=>item.node.extras?.part_name);assert.equal(pieces.length,9);
 const pin=pieces.find(item=>item.node.extras.part_name==='wrist_pin')!;
 assert.ok(new Vector3().setFromMatrixPosition(pin.matrix).length()<1e-8,'native wrist-pin origin is zero');
 const crown=nodes.find(item=>item.node.extras?.datum_name==='anchor_crown')!;
 assert.ok(new Vector3().setFromMatrixPosition(crown.matrix).distanceTo(new Vector3(0,PISTON_SPEC.compressionHeightMm/1000,0))<1e-7);
 const pinMesh=document.meshes[pin.node.mesh],bounds=new Box3();
 for(const primitive of pinMesh.primitives){
  const accessor=document.accessors[primitive.attributes.POSITION];
  for(const x of [accessor.min[0],accessor.max[0]])for(const y of [accessor.min[1],accessor.max[1]])for(const z of [accessor.min[2],accessor.max[2]])bounds.expandByPoint(new Vector3(x,y,z).applyMatrix4(pin.matrix));
 }
 const size=bounds.getSize(new Vector3()).multiplyScalar(1000);
 assert.ok(Math.abs(size.x-PISTON_SPEC.pinLengthMm)<.05);assert.ok(Math.abs(size.y-PISTON_SPEC.pinDiameterMm)<.05);assert.ok(Math.abs(size.z-PISTON_SPEC.pinDiameterMm)<.05);
 assert.ok(pinMesh.primitives.every((primitive:any)=>document.accessors[primitive.indices].count>100),'pin has actual annular geometry');
 // All image data travels inside this local file; no third-party texture host.
 assert.ok((document.images??[]).every((image:any)=>image.bufferView!==undefined&&!image.uri));
 assert.ok(buffer.length<2_000_000,'first-part transfer budget');
 // glTF omits metallicFactor when it equals the specification default (1).
 const materials=document.materials;assert.ok(materials.some((m:any)=>(m.pbrMetallicRoughness?.metallicFactor??1)===1));
 assert.ok(materials.some((m:any)=>m.normalTexture),'authored turning-mark normal texture survives GLB export');
});

test('engine asset reduces the actual exported triangle count while preserving named datums',()=>{
 const total=(document:any)=>document.meshes.reduce((sum:number,mesh:any)=>sum+mesh.primitives.reduce((n:number,p:any)=>n+document.accessors[p.indices].count/3,0),0);
 const hero=total(load('m52-piston-reference.glb').document),engine=total(load('m52-piston-engine.glb').document);
 assert.ok(engine<hero*.55);assert.ok(engine<40_000);
 const metadata=JSON.parse(readFileSync(new URL('../public/models/m52-piston-reference.json',import.meta.url),'utf8'));
 assert.equal(metadata.dimensions.compressionHeightMm,PISTON_SPEC.compressionHeightMm);
 assert.equal(metadata.engineLod.triangles,engine);assert.equal(metadata.manufacturerCad,false);assert.ok(metadata.approximate.length>0);
});
