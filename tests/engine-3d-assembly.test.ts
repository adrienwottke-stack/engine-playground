import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildWorkshopAssembly,animateWorkshopAssembly,timingChainPath,createWorkshopFlywheel} from '../src/engine-3d-assembly';
import {disposeSceneResources} from '../src/engine-three-resources';
import {assemblyDimensions} from '../src/engine-3d-model';
import {copyConfig} from '../src/model';
import {createM54ExhaustManifolds} from '../src/engine-3d-exhaust-manifold';
import {assemblyConnectors} from '../src/engine-3d-layout';

test('timing chain follows the two external tangents and never crosses either sprocket hub',()=>{
  for(const [a,ra,b,rb] of [[[0,0],13,[292,23],26],[[292,-23],15,[292,23],15]] as [number[],number,number[],number][]){
    const points=timingChainPath(-333,a,ra,b,rb),curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),true,'centripetal');
    assert.ok(curve.getLength()>100);assert.ok(curve.getLength()<800);
    for(let i=0;i<=400;i++){
      const p=curve.getPointAt(i/400);assert.ok(p.toArray().every(Number.isFinite));assert.equal(p.x,-333);
      for(const [center,r] of [[a,ra],[b,rb]] as [number[],number][])assert.ok(Math.hypot(p.y-center[0],p.z-center[1])>r-1.2,'links follow the sprocket perimeter');
    }
  }
});

test('complete authored cutaway has finite real depth-tested geometry and batched details',()=>{
  const scene=new T.Scene(),extras=new T.Group(),housing=new T.Group(),head=new T.Group();extras.add(head);scene.add(extras,housing);
  const dimensions=assemblyDimensions(copyConfig()),mat=(color:number)=>new T.MeshStandardMaterial({color});
  const assembly=buildWorkshopAssembly({extras,housing,head,...dimensions,mat});
  animateWorkshopAssembly(assembly,0,0,0);scene.updateMatrixWorld(true);
  let meshes=0,vertices=0;
  scene.traverse(object=>{
    if(!(object instanceof T.Mesh))return;meshes++;
    const positions=object.geometry.getAttribute('position');vertices+=positions.count;
    for(let i=0;i<positions.count;i++)assert.ok(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)));
    for(const m of Array.isArray(object.material)?object.material:[object.material])assert.equal(m.depthTest,true);
  });
  // R4 adds two real drive systems. Keep the existing exterior budget and
  // bound their incremental work separately, including hidden alternative views.
  const batches=(root:T.Object3D)=>{let count=0;root.traverse(p=>{if(p instanceof T.Mesh)count++;});return count;};
  const accessoryBatches=batches(assembly.accessoryDrive.root),timingBatches=batches(assembly.timingDrive.root);
  assert.ok(meshes-accessoryBatches-timingBatches<100,'existing exterior stays within its original batch budget');
  assert.ok(accessoryBatches<=36,'accessory wheels, belts and supports stay batched');
  assert.ok(timingBatches<=32,'timing details keep their measured module budget');
  // R7 keeps an independently tilted throttle carrier and two DISA gates for
  // the closed/cut alternatives. Stationary nested surfaces are still batched.
  assert.ok(meshes<155,`${meshes} batches including both drives and hidden R7 views`);assert.ok(vertices>5000);
  assert.ok(assembly.partNames.includes('M54B30 Gussblock im Schnitt'));assert.ok(assembly.partNames.includes('Abgasnachbehandlung'));
  assert.equal(assembly.closedHousing.parent,housing);assert.equal(assembly.closedHousing.visible,false);
  assert.equal(assembly.chain.length,2);assert.ok(assembly.chain.every(c=>c.links.count>20));
  const before=new T.Matrix4();assembly.chain[0].links.getMatrixAt(0,before);
  animateWorkshopAssembly(assembly,Math.PI,1,900);
  const after=new T.Matrix4();assembly.chain[0].links.getMatrixAt(0,after);assert.notDeepEqual(before.elements,after.elements);
  assert.equal(assembly.sprockets[0].part.rotation.x,Math.PI);
  for(const s of assembly.sprockets.slice(1))assert.equal(s.part.rotation.x,Math.PI/2);
  assert.ok(assembly.throttle.rotation.y>1.4);assert.ok(assembly.fan.rotation.x>0);
  const disposal=disposeSceneResources(scene);assert.ok(disposal.geometries>20);
});

test('closed M54 block has real cast side walls while cutaway opens the bores and ports are drilled',()=>{
  const extras=new T.Group(),housing=new T.Group(),head=new T.Group();extras.add(head);
  const dimensions=assemblyDimensions(copyConfig()),assembly=buildWorkshopAssembly({extras,housing,head,...dimensions,mat:color=>new T.MeshStandardMaterial({color})});
  housing.updateMatrixWorld(true);extras.updateMatrixWorld(true);
  const cut=housing.children.find(p=>p.name==='M54B30 Gussblock im Schnitt')!,ports=extras.children.find(p=>p.name==='Verschraubte Ansaug und Abgasflansche')!;
  for(const x of [-250,-50,150]){
    const ray=new T.Raycaster(new T.Vector3(x,145,300),new T.Vector3(0,0,-1));
    const outside=ray.intersectObject(assembly.closedHousing,true),inside=ray.intersectObject(cut,true);
    assert.ok(outside.length>0&&outside[0].point.z>65,'closed view meets a solid volumetric outer cast wall');
    assert.ok(inside.length>0&&inside[0].point.z<20,'cut view opens the front of the cylinder');
  }
  const portY=226+dimensions.headOffset;
  const boreRay=new T.Raycaster(new T.Vector3(-250,portY,125),new T.Vector3(0,0,-1));
  assert.equal(boreRay.intersectObject(ports,true).length,0,'gas enters through a real open flange bore');
  const studRay=new T.Raycaster(new T.Vector3(-277,portY+22,125),new T.Vector3(0,0,-1));
  const studHits=studRay.intersectObject(extras,true);
  assert.ok(studHits.length>0&&studHits[0].point.z>89,'new supported manifold fastener sits in front of the mounting rail');
  const pan=extras.children.find(p=>p.name==='Gegossene Oelwanne')!,panRay=new T.Raycaster(new T.Vector3(0,-52,0),new T.Vector3(0,-1,0)),floor=panRay.intersectObject(pan,true);
  assert.ok(floor.length>0&&floor[0].point.y<-70,'sump has an open cavity above its floor instead of solid material through the crank sweep');
  assembly.fan.traverse(part=>{if(!(part instanceof T.Mesh))return;const p=part.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Math.hypot(p.getY(i),p.getZ(i))<76,'blade tips clear the 80mm fan shroud aperture');});
  disposeSceneResources(housing);disposeSceneResources(extras);
});

test('flywheel retains an open bolt pattern, ring gear and independently thinner mass',()=>{
  const flywheel=createWorkshopFlywheel(color=>new T.MeshStandardMaterial({color}));
  const masses=flywheel.children.filter(p=>p.name==='Schwungmasse');assert.equal(masses.length,3);assert.ok(flywheel.children.length<10);
  const bounds=new T.Box3().setFromObject(flywheel);assert.ok(bounds.max.y>65&&bounds.min.y<-65);
  for(const mass of masses)mass.scale.x=.66;
  const lightBounds=new T.Box3().setFromObject(flywheel);assert.equal(lightBounds.max.y,bounds.max.y);
  disposeSceneResources(flywheel);
});

test('photo-referenced manifolds retain complete outer bellies and real three-port flanges',()=>{
  const assembly=createM54ExhaustManifolds(0,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}));
  const scene=new T.Scene();scene.add(assembly.closed,assembly.details,assembly.cut);scene.updateMatrixWorld(true);
  for(let bank=0;bank<2;bank++){
    const cx=bank===0?-150:150,name=bank===0?'1–3':'4–6';
    const manifold=assembly.closed.children.find(p=>p.name===`Zusammenhängender Dreierkrümmer ${name}`) as T.Mesh;
    manifold.geometry.computeBoundingBox();const bounds=manifold.geometry.boundingBox!.clone();
    // R6's supported necks are separate precision surfaces belonging to this
    // bank. Measure the whole casting while retaining the original envelope.
    for(const x of [cx-100,cx,cx+100])bounds.union(new T.Box3().setFromObject(assembly.closed.getObjectByName('Integrierter Anschlusskragen '+x)!));
    assert.ok(bounds.max.z>168,'the generated front wall must survive the geometry buffer limit');
    assert.ok(bounds.max.x-bounds.min.x>240&&bounds.max.y-bounds.min.y>90,'all three lobes and the lower belly remain present');
    const front=new T.Raycaster(new T.Vector3(cx,183,260),new T.Vector3(0,0,-1)).intersectObject(manifold);
    assert.ok(front.length>0&&front[0].point.z>160,'the wide front is a real closed surface, not detached pipe rings');
    for(const x of [cx-100,cx,cx+100])assert.ok(new T.Raycaster(new T.Vector3(x,300,112),new T.Vector3(0,-1,0)).intersectObject(manifold).length>0,'each of the three cast branches remains an actual wall');
    for(const gap of [-50,50]){
      const recess=new T.Raycaster(new T.Vector3(cx+gap,300,134),new T.Vector3(0,-1,0));
      assert.equal(recess.intersectObject(manifold).length,0,'two deep U recesses pass through the fan-shaped shell between the ports');
    }
    const flange=assembly.details.children.find(p=>p.name===`Dreifachflansch ${name}`)!;
    for(const x of [cx-100,cx,cx+100]){
      const centre=new T.Raycaster(new T.Vector3(x,226,110),new T.Vector3(0,0,-1));
      assert.equal(centre.intersectObject(flange).length,0,'three actual port holes pass through the mounting plate');
      const wall=new T.Raycaster(new T.Vector3(x+20,226,110),new T.Vector3(0,0,-1));
      assert.ok(wall.intersectObject(flange).length>0,'real flange metal surrounds each bore');
    }
  }
  disposeSceneResources(scene);
});

test('manifold-to-cat neck has a complete round wall and meets the cone without a radial step',()=>{
  const assembly=createM54ExhaustManifolds(0,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}));
  const scene=new T.Scene();scene.add(assembly.closed,assembly.details,assembly.cut);scene.updateMatrixWorld(true);
  const nodes=assemblyConnectors();
  for(let bank=0;bank<2;bank++){
    const label=bank===0?'1–3':'4–6',inlet=nodes.catalystInlets[bank];
    const neck=assembly.closed.getObjectByName(`Zusammenhängender Dreierkrümmer ${label}`)!;
    const cat=assembly.closed.getObjectByName(`Länglicher Katalysator ${label}`)!;
    const radiusAt=(part:T.Object3D,y:number,angle:number)=>{
      const outward=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
      const origin=new T.Vector3(inlet[0],y,inlet[2]).addScaledVector(outward,90);
      const hit=new T.Raycaster(origin,outward.clone().negate(),0,180).intersectObject(part)[0];
      assert.ok(hit,'the wall is present around the full circumference');
      return Math.hypot(hit.point.x-inlet[0],hit.point.z-inlet[2]);
    };
    for(const y of [154,160,166,175]){
      const radii=Array.from({length:36},(_,i)=>radiusAt(neck,y,i/36*Math.PI*2));
      assert.ok(Math.min(...radii)>20.4&&Math.max(...radii)<25.1,'the sleeve surrounds the old thin wall');
      assert.ok(Math.max(...radii)-Math.min(...radii)<.15,'no jagged notches or protruding tabs remain on the circular wall');
    }
    for(let i=0;i<24;i++){
      const angle=i/24*Math.PI*2;
      assert.ok(Math.abs(radiusAt(neck,inlet[1]+.025,angle)-radiusAt(cat,inlet[1]-.025,angle))<.12,'neck and cone meet on one circle without a visible step');
    }
  }
  disposeSceneResources(scene);
});
