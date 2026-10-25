import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createM54Intake} from '../src/engine-3d-intake';
import {m54IntakeNodes,m54IntakeRoutes} from '../src/engine-intake-layout';
import {intakeFlowMetadata,intakeRouteRate} from '../src/engine-intake-flow';
const mat=(color:number,metalness?:number,roughness?:number)=>new T.MeshStandardMaterial({color,metalness,roughness});
const model=createM54Intake(9,mat),nodes=m54IntakeNodes(9);

test('R7 feeds all six runners and paired head ports through two branches with DISA shut',()=>{
 const routes=m54IntakeRoutes(9),meta=intakeFlowMetadata(routes),main=routes.find(r=>r.branch==='main')!;
 assert.ok(!main.coords.some(p=>nodes.runnerNodes.some(q=>q.every((v,j)=>v===p[j]))),'main stops at distribution, not a serial path through six runners');
 assert.equal(routes.filter(r=>r.branch.startsWith('intake-')).length,2);
 assert.equal(routes.filter(r=>r.branch==='disa-coupling').length,0);
 for(let cylinder=1;cylinder<=6;cylinder++){
  const runner=routes.find(r=>r.branch==='runner'&&r.cylinder===cylinder)!;
  assert.ok(meta.offset(runner,cylinder)>0);
  for(const r of routes.filter(r=>r.cylinder===cylinder&&r.branch.startsWith('head-')))assert.ok(Math.abs(meta.offset(r,cylinder)-meta.offset(runner,cylinder)-meta.length(runner))<1e-8,'continuous inlet-to-head pulse distance');
  const wrong=routes.find(r=>r.branch===(cylinder<=3?'intake-rear':'intake-front'))!;
  assert.equal(meta.offset(wrong,cylinder),-1e6);
 }
 assert.equal(m54IntakeRoutes(9,true).filter(r=>r.branch==='disa-coupling'&&r.bidirectional).length,1);
 assert.deepEqual(routes.find(r=>r.branch==='idle-supply')!.coords[0],nodes.idleTap);
 assert.ok(routes.filter(r=>r.branch==='idle').every(r=>meta.offset(r,r.cylinder!)===-1e6));
});
test('R7 hollow passage centre lines are accessible in the joined shell',()=>{
 const surfaces=model.closed.children.filter(p=>p instanceof T.Mesh&&(/Geformtes Saugrohr|Hauptsammler|Resonanz|Drosseleintritt|Verbindungskanal|Aussenschale/.test(p.name))) as T.Mesh[];
 model.closed.updateMatrixWorld(true);
 for(const passage of model.passages){
  const begin=passage.spec.capStart?.valueOf()? .15: .015,end=passage.spec.capEnd?.valueOf()? .85: .985;
  for(let i=0;i<52;i++){
   const p=passage.curve.getPointAt(T.MathUtils.lerp(begin,end,i/52)),q=passage.curve.getPointAt(T.MathUtils.lerp(begin,end,(i+1)/52)),direction=q.clone().sub(p);
   assert.equal(new T.Raycaster(p,direction.clone().normalize(),.02,direction.length()-.02).intersectObjects(surfaces,false).length,0,`${passage.spec.id} section ${i} contains an unintended wall`);
  }
 }
});
test('R7 DISA physically blocks and opens the gallery coupling',()=>{
 const origin=new T.Vector3(-17,171,-224),ray=new T.Raycaster(origin,new T.Vector3(1,0,0),0,34);
 model.setDisaOpen(false);model.cut.updateMatrixWorld(true);assert.ok(ray.intersectObject(model.disaFlap,true).length>0);
 model.setDisaOpen(true);model.cut.updateMatrixWorld(true);assert.equal(ray.intersectObject(model.disaFlap,true).length,0);assert.equal(model.flowRoutes().filter(r=>r.branch==='disa-coupling').length,1);
 model.setDisaOpen(false);
});
test('R7 lower central throttle is axial to its inlet, with fixed head interfaces',()=>{
 assert.deepEqual(model.throttle.position.toArray(),nodes.throttle);assert.equal(nodes.throttle[0],-12);assert.ok(nodes.throttle[1]<120);
 const inlet=model.passages.find(p=>p.spec.id==='inlet')!,axis=new T.Vector3(...nodes.throttleAxis);
 assert.ok(inlet.curve.getTangentAt(0).angleTo(axis)<.002);
 const transformed=new T.Vector3(0,0,1).applyQuaternion(model.throttle.quaternion);assert.ok(transformed.angleTo(axis)<1e-6);
 assert.equal(model.details.children.filter(o=>o.name==='Offener Saugrohrflansch').length,6);
 for(let i=0;i<6;i++)assert.deepEqual(model.passages.find(p=>p.spec.cylinder===i+1)!.spec.coords.at(-1),nodes.intakePorts[i]);
});
test('R7 all six head mouths stay open through flange and collar faces',()=>{
 model.closed.updateMatrixWorld(true);model.details.updateMatrixWorld(true);
 for(const p of nodes.intakePorts){
  const ray=new T.Raycaster(new T.Vector3(p[0],p[1],p[2]+3),new T.Vector3(0,0,-1),.01,18);
  assert.equal(ray.intersectObjects([model.closed,model.details],true).length,0,'flattened hole must remain within its outer flange outline');
 }
});
test('R7 grouped flow sums the proper native samples and never invents an idle or DISA signal',()=>{
 const sample=(_m:any,c:number|undefined)=>c??21,cfg={} as any;
 assert.equal(intakeRouteRate({branch:'intake-front'},null,cfg,0,sample),6);
 assert.equal(intakeRouteRate({branch:'intake-rear'},null,cfg,0,sample),15);
 assert.equal(intakeRouteRate({branch:'main'},null,cfg,0,sample),21);
 for(const branch of ['idle','idle-supply','disa-coupling'])assert.equal(intakeRouteRate({branch},null,cfg,0,sample),0);
});
test('R7 variants remain finite and material batches remain mergeable',()=>{
 for(const intake of ['standard','sport','race'] as const){const m=intake==='standard'?model:createM54Intake(9,mat,{intake});
  for(const group of [m.closed,m.cut,m.details]){const batches=new Map<T.Material,T.BufferGeometry[]>();group.traverse(o=>{if(!(o instanceof T.Mesh))return;const p=o.geometry.getAttribute('position');for(const value of p.array)assert.ok(Number.isFinite(value));const material=o.material as T.Material,list=batches.get(material)??[];list.push(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone());batches.set(material,list);});
   for(const geometries of batches.values()){const merged=mergeGeometries(geometries);assert.ok(merged);merged.dispose();geometries.forEach(g=>g.dispose());}
  }
  const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>();for(const group of [m.closed,m.cut,m.details,m.throttle])group.traverse(o=>{if(o instanceof T.Mesh){geos.add(o.geometry);mats.add(o.material as T.Material);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
 }
});
