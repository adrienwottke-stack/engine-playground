import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54ExhaustManifolds as after} from '../src/engine-3d-exhaust-manifold';
import {createM54ExhaustManifolds as before} from '../evidence/detail-r6-integration/before-src/engine-3d-exhaust-manifold';
import {createM54Casting} from '../evidence/detail-r6-integration/before-src/engine-3d-casting';
import {CYLINDER_X} from '../evidence/detail-r6-integration/before-src/engine-3d-model';
import {disposeSceneResources} from '../src/engine-three-resources';
import {writeFile} from 'node:fs/promises';
const mat=(color:number)=>new T.MeshStandardMaterial({color}),report:any={};

test('R6 six gas seats overlap the actual frozen R5 head face, with open bores',()=>{
 const ho=15.62,materials={cast:mat(0x74858c),machined:mat(0xbdc9cb),steel:mat(0x9ba9aa),black:mat(0x24343b),rubber:mat(0x121e23),brass:mat(0xa38a58),cut:mat(0xbd9173)};
 const casting=createM54Casting({deck:205+ho,headOffset:ho,boreScale:1,materials}),head=casting.closed.children.find(p=>p.name==='M54B30 geschlossener Kopf Ventildeckel DoppelVANOS')!;
 const a=after(ho,mat),old=before(ho,mat),scene=new T.Scene();scene.add(head,...a.groups);scene.updateMatrixWorld(true);report.seatOverlap=[];
 for(let i=0;i<6;i++){
  const x=CYLINDER_X[i],y=226+ho,rail=a.details.getObjectByName(`Dreifachflansch ${i<3?'1–3':'4–6'}`)!;
  const bore=new T.Raycaster(new T.Vector3(x,y,90),new T.Vector3(0,0,-1),0,30);
  assert.equal(bore.intersectObject(head,true).length,0,'actual head opening stays clear');assert.equal(bore.intersectObject(rail).length,0,'rail opening remains aligned');
  const socket=a.closed.getObjectByName(`Integrierter Anschlusskragen ${x}`)!;
  const socketRay=new T.Raycaster(new T.Vector3(x,y,79),new T.Vector3(0,0,1),0,25);
  assert.equal(socketRay.intersectObject(socket).length,0,'six seated sockets have true entrance bores');
  assert.ok(new T.Raycaster(new T.Vector3(x+18,y,130),new T.Vector3(0,0,-1),0,45).intersectObject(socket).length,'the new tapered socket has a real wall, sampled from outside rather than from inside the wall');
  let minOverlap=Infinity;
  for(let k=0;k<24;k++){
   const angle=k/24*Math.PI*2,px=x+Math.cos(angle)*17,py=y+Math.sin(angle)*17;
   const h=new T.Raycaster(new T.Vector3(px,py,82),new T.Vector3(0,0,-1),0,20).intersectObject(head,true)[0];
   const r=new T.Raycaster(new T.Vector3(px,py,70),new T.Vector3(0,0,1),0,20).intersectObject(rail)[0];
   assert.ok(h&&r,'every entrance has a full supported annulus');const overlap=h.point.z-r.point.z;assert.ok(overlap>.5&&overlap<1.1,`rear rail face meets actual head metal: x=${x} angle=${angle} head=${h.point.z} rail=${r.point.z}`);minOverlap=Math.min(minOverlap,overlap);
  }
  report.seatOverlap.push({x,minOverlap});
 }
 let unsupportedBefore=0;
 for(const nut of old.details.children.filter(p=>p.name.startsWith('Sechskantmutter'))){const ray=new T.Raycaster(new T.Vector3(nut.position.x,nut.position.y,82),new T.Vector3(0,0,-1),0,20);if(!ray.intersectObject(head,true).length)unsupportedBefore++;}
 for(const nut of a.details.children.filter(p=>p.name.startsWith('Sechskantmutter'))){
  const rail=a.details.getObjectByName(nut.name.includes('1–3')?'Dreifachflansch 1–3':'Dreifachflansch 4–6')!;
  for(let k=0;k<12;k++){
   const angle=k/12*Math.PI*2,x=nut.position.x+Math.cos(angle)*2.8,y=nut.position.y+Math.sin(angle)*2.8;
   assert.ok(new T.Raycaster(new T.Vector3(x,y,82),new T.Vector3(0,0,-1),0,20).intersectObject(head,true).length,'all stud sections now enter the actual head');
  }
  assert.ok(new T.Raycaster(new T.Vector3(nut.position.x+6,nut.position.y,100),new T.Vector3(0,0,-1)).intersectObject(rail).length,'each nut seat has real rail beneath it');
 }
 assert.equal(unsupportedBefore,8,'the frozen baseline exposes the eight unsupported lower studs');report.unsupportedStuds={before:unsupportedBefore,after:0};
 disposeSceneResources(scene);for(const g of old.groups)disposeSceneResources(g);for(const g of casting.groups)disposeSceneResources(g);
});

test('R6 preserves catalysts, outlet geometry and eight fasteners per bank; sockets have finite normals',()=>{
 for(const ho of [0,18]){
  const a=after(ho,mat),b=before(ho,mat);
  for(const p of b.closed.children.filter(p=>/Katalysator|Kat |Blechkante/.test(p.name))){const next=a.closed.children.find(q=>q.name===p.name&&q.position.equals(p.position)) as T.Mesh;assert.ok(next);assert.deepEqual(next.geometry.getAttribute('position').array,(p as T.Mesh).geometry.getAttribute('position').array);assert.deepEqual(next.quaternion.toArray(),p.quaternion.toArray());}
  for(const label of ['1–3','4–6'])assert.equal(a.details.children.filter(p=>p.name===`Sechskantmutter ${label}`).length,8);
  for(const p of a.closed.children){const mesh=p as T.Mesh,positions=mesh.geometry.getAttribute('position'),normals=mesh.geometry.getAttribute('normal');for(let i=0;i<positions.count;i++){assert.ok(Number.isFinite(positions.getX(i)+positions.getY(i)+positions.getZ(i)));assert.ok(Number.isFinite(normals.getX(i)+normals.getY(i)+normals.getZ(i)));if(/Anschlusskragen|Zusammenhängender/.test(p.name))assert.ok(Math.abs(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))-1)<.015,`${p.name} normal ${i}: ${[normals.getX(i),normals.getY(i),normals.getZ(i)]}`);}}
  for(const g of [...a.groups,...b.groups])disposeSceneResources(g);
 }
});

test('R6 all three cast branches and the accepted bank envelope survive the precision-neck split',()=>{
 const a=after(0,mat);for(const [bank,label] of ['1–3','4–6'].entries()){
  const body=a.closed.getObjectByName(`Zusammenhängender Dreierkrümmer ${label}`)!;body.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(body),xs=CYLINDER_X.slice(bank*3,bank*3+3);
  for(const x of xs){
   const neck=a.closed.getObjectByName(`Integrierter Anschlusskragen ${x}`)!;bounds.union(new T.Box3().setFromObject(neck));
   assert.ok(new T.Raycaster(new T.Vector3(x,300,112),new T.Vector3(0,-1,0)).intersectObject(body).length,'all three cast branches still have their real upper wall');
  }
  assert.ok(bounds.max.x-bounds.min.x>240&&bounds.max.y-bounds.min.y>90,'the full bank, including its precision sockets, retains the original envelope check');
  const center=bank===0?-150:150;for(const gap of [-50,50])assert.equal(new T.Raycaster(new T.Vector3(center+gap,300,134),new T.Vector3(0,-1,0)).intersectObject(body).length,0,'both deep recesses stay open');
  report[`bank-${label}`]={min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new T.Vector3()).toArray()};
 }
 for(const g of a.groups)disposeSceneResources(g);
});

test('write R6 contact evidence',async()=>{await writeFile('evidence/exhaust-r6/contact-audit.json',JSON.stringify(report,null,2))});
