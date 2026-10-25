import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Intake} from '../src/engine-3d-intake';
import {assemblyConnectors} from '../src/engine-3d-layout';
const mat=(color:number,metalness?:number,roughness?:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
test('throttle shoulder mates on its Z plane and encloses the fixed feed point without folded sections for every variant',()=>{
 for(const intake of ['standard','sport','race'] as const)for(const offset of [0,19]){
  const m=createM54Intake(offset,mat,{intake}),n=assemblyConnectors(offset),outlet=new T.Vector3(n.throttle[0],n.throttle[1],n.throttle[2]+32);
  for(const [group,name] of [[m.closed,'Unterer Sammleranschluss'],[m.cut,'Unterer Sammleranschluss im Schnitt']] as const){
   const mesh=group.getObjectByName(name) as T.Mesh<T.TubeGeometry>,curve=mesh.geometry.parameters.path;
   assert.ok(curve.getPointAt(0).distanceTo(outlet)<1e-8,'fixed outlet centre');
   const angle=T.MathUtils.radToDeg(curve.getTangentAt(0).angleTo(new T.Vector3(0,0,1)));
   assert.ok(angle<.001,'outlet axis angle to +Z is zero, not nearly 90 degrees');
   const a=mesh.geometry.getAttribute('position');
   for(let j=0;j<=24;j++){const p=new T.Vector3().fromBufferAttribute(a,j);assert.ok(Math.abs(p.z-outlet.z)<1e-5,'first mating ring lies in the throttle outlet plane');assert.ok(Math.abs(p.distanceTo(outlet)-30)<1e-4,'first ring is circular');}
   for(let i=1;i<=64;i++){
    assert.ok(a.getZ(i*25)>a.getZ((i-1)*25),'parallel loft sections advance in Z without folding back');
    for(let j=1;j<=24;j++)assert.ok(Math.abs(a.getZ(i*25+j)-a.getZ(i*25))<1e-5,'each cross-section stays planar');
   }
   let lo=0,hi=1;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(curve.getPointAt(mid).z<n.plenumFeed[2])lo=mid;else hi=mid;}
   const u=(lo+hi)/2,center=curve.getPointAt(u),r=T.MathUtils.lerp(30,21,T.MathUtils.smoothstep(u,0,1));
   assert.ok(center.distanceTo(new T.Vector3(...n.plenumFeed))<r,'unchanged shared feed point lies inside the moulded connection');
  }
 }
});
test('moulded runner roots spread into the plenum and collars retain open head bores',()=>{
 const m=createM54Intake(0,mat),s=new T.Scene();s.add(m.closed,m.cut,m.details);s.updateMatrixWorld(true);
 const runners=m.closed.children.filter(p=>p.name.startsWith('Geformtes Saugrohr')) as T.Mesh[];assert.equal(runners.length,6);
 for(const p of runners){const a=p.geometry.getAttribute('position'),width=(i:number)=>{const x=Array.from({length:25},(_,j)=>a.getX(i*25+j));return Math.max(...x)-Math.min(...x);};assert.ok(width(0)>65);assert.ok(width(32)<49);assert.ok(width(64)<35);}
 const collars=m.details.children.filter(p=>p.name==='Ovaler Kopfanschlusskragen');assert.equal(collars.length,6);
 for(const collar of collars){const x=collar.position.x;assert.equal(new T.Raycaster(new T.Vector3(x,226,-130),new T.Vector3(0,0,1)).intersectObject(collar).length,0);assert.ok(new T.Raycaster(new T.Vector3(x+19,226,-130),new T.Vector3(0,0,1)).intersectObject(collar).length>0);}
});
test('merged boot triangles expose the rigid MAF and the throttle mounting flange is open',()=>{
 const m=createM54Intake(0,mat),n=assemblyConnectors(),boot=m.details.getObjectByName('Gebogener Ansaugfaltenbalg') as T.Mesh;
 const vertices=boot.geometry.getAttribute('position'),indices=boot.geometry.getIndex()!;
 assert.ok(indices.count>0);assert.ok(boot.userData.firstBootRing>0);
 const minX=Math.min(...Array.from(indices.array,i=>vertices.getX(i)));assert.ok(minX>n.maf[0]+10,'no rendered boot triangles pass through the MAF housing');
 const flange=m.details.getObjectByName('Offener Drossel-Montageflansch')!;m.details.updateMatrixWorld(true);
 assert.equal(new T.Raycaster(new T.Vector3(n.throttle[0],n.throttle[1],n.throttle[2]-60),new T.Vector3(0,0,1)).intersectObject(flange).length,0);
 assert.ok(new T.Raycaster(new T.Vector3(n.throttle[0]+34,n.throttle[1],n.throttle[2]-60),new T.Vector3(0,0,1)).intersectObject(flange).length>0);
});
