import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Intake} from '../src/engine-3d-intake';
import {assemblyConnectors} from '../src/engine-3d-layout';
import {disposeSceneResources} from '../src/engine-three-resources';

const build=()=>createM54Intake(0,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}));
test('intake has six genuinely open mounting ports and a lower, axially connected throttle',()=>{
  const a=build(),scene=new T.Scene();scene.add(a.closed,a.cut,a.details,a.throttle);scene.updateMatrixWorld(true);
  const faces=a.details.children.filter(p=>p.name==='Offener Saugrohrflansch');assert.equal(faces.length,6);
  for(const face of faces){
    const x=face.position.x;
    assert.equal(new T.Raycaster(new T.Vector3(x,226,-120),new T.Vector3(0,0,1)).intersectObject(face).length,0);
    assert.ok(new T.Raycaster(new T.Vector3(x+19,226,-120),new T.Vector3(0,0,1)).intersectObject(face).length>0);
  }
  const n=assemblyConnectors();assert.ok(n.throttle[1]+31<n.plenumFront[1],'throttle sits beneath the collector');
  const end=n.intakeBoot.at(-1)!,previous=n.intakeBoot.at(-2)!;
  assert.equal(end[0],n.throttle[0]);assert.equal(end[1],n.throttle[1]);assert.equal(previous[0],end[0]);assert.equal(previous[1],end[1]);
  assert.equal(end[2],n.throttle[2]-32,'boot meets the real open inlet rim rather than its side wall');
  disposeSceneResources(scene);
});

test('curved boot has outward finite normals through bends without collapsed rings',()=>{
  const a=build(),n=assemblyConnectors(),boot=a.details.children.find(p=>p.name==='Gebogener Ansaugfaltenbalg') as T.Mesh;
  const curve=new T.CatmullRomCurve3([n.airboxOutlet,n.maf,...n.intakeBoot].map(p=>new T.Vector3(...p)),false,'centripetal');
  const positions=boot.geometry.getAttribute('position'),normals=boot.geometry.getAttribute('normal');
  for(let i=1;i<64;i++)for(const j of [0,6,12,18]){
    const vertex=new T.Vector3().fromBufferAttribute(positions,i*25+j),normal=new T.Vector3().fromBufferAttribute(normals,i*25+j),radial=vertex.sub(curve.getPointAt(i/64));
    assert.ok(radial.length()>26&&radial.length()<29,'curved sections never collapse at a tangent parallel to the viewing axis');
    assert.ok(normal.toArray().every(Number.isFinite));assert.ok(normal.dot(radial.normalize())>.8,'outside surface points outward');
  }
  const scene=new T.Scene();scene.add(a.closed,a.cut,a.details,a.throttle);disposeSceneResources(scene);
});
