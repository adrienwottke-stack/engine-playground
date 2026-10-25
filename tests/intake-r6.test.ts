import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createM54Intake} from '../src/engine-3d-intake';
import {assemblyConnectors} from '../src/engine-3d-layout';
const mat=(color:number,metalness?:number,roughness?:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
const models=(['standard','sport','race'] as const).map(intake=>createM54Intake(9,mat,{intake}));
const skins=(group:T.Group)=>group.children.filter(p=>p instanceof T.Mesh&&(p.name==='Breiter Kunststoffsammler'||p.name==='Sammlerboden im Schnitt'||p.name.startsWith('Geformtes Saugrohr')||p.name.startsWith('Geöffnetes Saugrohr')||p.name.startsWith('Unterer Sammleranschluss'))) as T.Mesh[];
test('R6 has no collector partitions across the throttle or any of the six runner centre paths',()=>{
 for(const model of models)for(const group of [model.closed,model.cut]){
  group.updateMatrixWorld(true);const surfaces=skins(group),passages=surfaces.filter(p=>p.geometry instanceof T.TubeGeometry);
  assert.equal(passages.length,7);
  const n=assemblyConnectors(9),inlet=new T.Vector3(n.throttle[0],n.throttle[1],n.throttle[2]-33);
  assert.equal(new T.Raycaster(inlet,new T.Vector3(0,0,1),.002,64.99).intersectObjects(surfaces,false).length,0,'collector shell must not cover the throttle barrel upstream of its outlet');
  for(const passage of passages){const curve=(passage.geometry as T.TubeGeometry).parameters.path;
   for(let i=0;i<64;i++){const p=curve.getPointAt(i/64),q=curve.getPointAt((i+1)/64),direction=q.clone().sub(p),ray=new T.Raycaster(p,direction.clone().normalize(),.002,direction.length()-.002),hits=ray.intersectObjects(surfaces,false);
    assert.equal(hits.length,0,`${model.variant.intake} ${group===model.cut?'cut':'closed'}: ${passage.name}, segment ${i} has a blocking wall`);
   }
  }
 }
});
test('R6 keeps a circular tangential throttle mouth and creates a wider integrated shoulder',()=>{
 const n=assemblyConnectors(9),outlet=new T.Vector3(n.throttle[0],n.throttle[1],n.throttle[2]+32);
 for(const m of models){assert.deepEqual(m.throttle.position.toArray(),n.throttle);const skin=m.closed.getObjectByName('Unterer Sammleranschluss') as T.Mesh<T.TubeGeometry>,a=skin.geometry.getAttribute('position'),path=skin.geometry.parameters.path;
  assert.ok(path.getPointAt(0).distanceTo(outlet)<1e-8);assert.ok(path.getTangentAt(0).angleTo(new T.Vector3(0,0,1))<1e-5);
  for(let j=0;j<=24;j++){const p=new T.Vector3().fromBufferAttribute(a,j);assert.ok(Math.abs(p.z-outlet.z)<1e-5);assert.ok(Math.abs(p.distanceTo(outlet)-30)<1e-4);}
  const endX=Array.from({length:25},(_,j)=>a.getX(64*25+j));assert.ok(Math.max(...endX)-Math.min(...endX)>100,'shoulder widens into the plenum rather than ending as a small stub');
  assert.equal(m.details.children.filter(p=>p.name==='Offener Saugrohrflansch').length,6);assert.equal(m.variant.unsupportedKeys.length,0);
 }
});
test('R6 retains collector wall away from ports, finite local geometry and mergeable attributes',()=>{
 for(const m of models){const shell=m.closed.getObjectByName('Breiter Kunststoffsammler') as T.Mesh;m.closed.updateMatrixWorld(true);
  const hits=new T.Raycaster(new T.Vector3(100,189,-320),new T.Vector3(0,0,1),0,200).intersectObject(shell);assert.ok(hits.length>=4,'front and back each retain an outer and inner wall');
  for(const group of [m.closed,m.cut,m.details]){const batches=new Map<T.Material,T.BufferGeometry[]>();group.traverse(p=>{if(!(p instanceof T.Mesh))return;const pos=p.geometry.getAttribute('position');for(let i=0;i<pos.count;i++){assert.ok(Number.isFinite(pos.getX(i))&&Number.isFinite(pos.getY(i))&&Number.isFinite(pos.getZ(i)));if(skins(group).includes(p))assert.ok(Math.abs(pos.getX(i))<600&&Math.abs(pos.getY(i))<400&&Math.abs(pos.getZ(i))<400,'no skin spikes from inner-wall construction');}const material=p.material as T.Material,list=batches.get(material)??[];list.push(p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone());batches.set(material,list);});
   for(const geometries of batches.values()){const merged=mergeGeometries(geometries);assert.ok(merged);merged.dispose();geometries.forEach(g=>g.dispose());}
  }
 }
});
