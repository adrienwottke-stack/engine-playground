import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54Flywheel} from '../src/engine-3d-flywheel';
import {createM54CoolingPlumbing,setCoolingPlumbingPresentation} from '../src/engine-3d-cooling';
import {assemblyConnectors,engineRoutes} from '../src/engine-3d-layout';
import {createM54AccessoryDrive} from '../src/engine-3d-accessory-drive';
import {disposeSceneResources} from '../src/engine-three-resources';
import {createM54Casting} from '../src/engine-3d-casting';
import {createM54ExhaustManifolds} from '../src/engine-3d-exhaust-manifold';

const mat=(color:number,metalness=.5,roughness=.5)=>new T.MeshStandardMaterial({color,metalness,roughness});

test('released R6 manifolds seat around six open bores on the actual released R6 head',()=>{
  const ho=15.62,materials={cast:mat(0x74858c),machined:mat(0xbdc9cb),steel:mat(0x9ba9aa),black:mat(0x24343b),rubber:mat(0x121e23),brass:mat(0xa38a58),cut:mat(0xbd9173)};
  const casting=createM54Casting({deck:205+ho,headOffset:ho,boreScale:1,materials}),exhaust=createM54ExhaustManifolds(ho,mat);
  const scene=new T.Scene();scene.add(casting.closed,casting.cutBlock,casting.cutHead,casting.portMounts,exhaust.closed,exhaust.cut,exhaust.details);scene.updateMatrixWorld(true);
  const head=casting.closed.getObjectByName('M54B30 geschlossener Kopf Ventildeckel DoppelVANOS')!;
  for(const [i,port]of assemblyConnectors(ho).exhaustPorts.entries()){
    const [x,y]=port,rail=exhaust.details.getObjectByName(`Dreifachflansch ${i<3?'1–3':'4–6'}`)!;
    const bore=new T.Raycaster(new T.Vector3(x,y,90),new T.Vector3(0,0,-1),0,25);
    assert.equal(bore.intersectObject(head,true).length,0);assert.equal(bore.intersectObject(rail).length,0);
    for(let k=0;k<24;k++){
      const angle=k/24*Math.PI*2,px=x+Math.cos(angle)*17,py=y+Math.sin(angle)*17;
      const h=new T.Raycaster(new T.Vector3(px,py,82),new T.Vector3(0,0,-1),0,20).intersectObject(head,true)[0];
      const r=new T.Raycaster(new T.Vector3(px,py,70),new T.Vector3(0,0,1),0,20).intersectObject(rail)[0];
      assert.ok(h&&r,'all six flange annuli have supporting head metal');
      assert.ok(h.point.z-r.point.z>.5&&h.point.z-r.point.z<2.8,'flange and head meet with a small embedded seating allowance');
    }
  }
  for(const nut of exhaust.details.children.filter(part=>part.name.startsWith('Sechskantmutter')))for(let k=0;k<12;k++){
    const a=k/12*Math.PI*2;
    assert.ok(new T.Raycaster(new T.Vector3(nut.position.x+Math.cos(a)*2.8,nut.position.y+Math.sin(a)*2.8,82),new T.Vector3(0,0,-1),0,20).intersectObject(head,true).length,'all sixteen fasteners enter the current head');
  }
  disposeSceneResources(scene);
});

test('two-mass flywheel has an open crank bore and real secondary recesses at credible clutch scale',()=>{
  const flywheel=createM54Flywheel(mat);flywheel.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(flywheel),size=bounds.getSize(new T.Vector3());
  assert.ok(size.y>280&&size.y<300,'ring gear surrounds a 240mm class clutch instead of being smaller than two bores');
  assert.ok(size.x<40,'flywheel remains a compact axial assembly');
  const ray=new T.Raycaster(new T.Vector3(60,0,0),new T.Vector3(-1,0,0));
  assert.equal(ray.intersectObject(flywheel,true).length,0,'centre bore is open through all three masses');
  const secondary=flywheel.children.find(part=>part.userData.role==='secondary-friction-plate')!;
  ray.set(new T.Vector3(60,53,0),new T.Vector3(-1,0,0));
  assert.equal(ray.intersectObject(secondary,true).length,0,'arc slots are geometry, not black painted decals');
  ray.set(new T.Vector3(60,95,0),new T.Vector3(-1,0,0));
  assert.ok(ray.intersectObject(secondary,true).length>0,'working friction annulus remains continuous');
  const gear=flywheel.getObjectByName('Durchgehender trapezverzahnter Starterkranz')!;
  const gearBounds=new T.Box3().setFromObject(gear);
  for(const mass of flywheel.children.filter(part=>part.name==='Schwungmasse'))mass.scale.x=.66;
  assert.deepEqual(new T.Box3().setFromObject(gear).min.toArray(),gearBounds.min.toArray(),'light flywheel does not move starter engagement');
  assert.ok(flywheel.children.length<10);disposeSceneResources(flywheel);
});

test('coolant shells seat on the actual circuit nodes and do not duplicate free exterior stream tubes',()=>{
  for(const offset of [-37,0,45]){
    const plumbing=createM54CoolingPlumbing(offset,mat),nodes=assemblyConnectors(offset),routes=engineRoutes(offset);
    assert.equal(plumbing.hoses.length,4);assert.equal(plumbing.root.children.length,2,'all shells and their cuffs need only two batches');
    const upper=plumbing.hoses.find(hose=>hose.branch==='radiator')!,lower=plumbing.hoses.find(hose=>hose.branch==='radiator-return')!;
    for(const [hose,start,end]of [[upper,nodes.thermostat,nodes.radiatorUpper],[lower,nodes.radiatorLower,nodes.pump]]as const){
      assert.ok(hose.curve.getPointAt(0).distanceTo(new T.Vector3().fromArray(start))<1e-8);
      assert.ok(hose.curve.getPointAt(1).distanceTo(new T.Vector3().fromArray(end))<1e-8);
    }
    for(const hose of plumbing.hoses)assert.equal(routes.find(route=>route.medium==='water'&&route.branch===hose.branch)?.internal,true,'coolant is inside the authored shell');
    setCoolingPlumbingPresentation(plumbing,'cutaway','transparent');
    assert.ok(plumbing.materials.every(material=>material.transparent&&!material.depthWrite&&material.opacity<.3));
    setCoolingPlumbingPresentation(plumbing,'closed','transparent');
    assert.ok(plumbing.materials.every(material=>!material.transparent&&material.depthWrite&&material.opacity===1));
    setCoolingPlumbingPresentation(plumbing,'flow','transparent');assert.equal(plumbing.root.visible,false);
    setCoolingPlumbingPresentation(plumbing,'closed','off');assert.equal(plumbing.root.visible,false);
    disposeSceneResources(plumbing.root);
  }
});

test('formed coolant hoses clear the rotating accessory pulley discs at both belt planes',()=>{
  const plumbing=createM54CoolingPlumbing(0,mat),drive=createM54AccessoryDrive(assemblyConnectors().pump,mat);
  for(const hose of plumbing.hoses)for(let i=0;i<=400;i++){
    const point=hose.curve.getPointAt(i/400);
    for(const wheel of drive.wheels){
      const centre=wheel.part.position;
      if(Math.abs(point.x-centre.x)>hose.radius+6)continue;
      assert.ok(Math.hypot(point.y-centre.y,point.z-centre.z)>wheel.radius+hose.radius+1,`${hose.branch} intersects ${wheel.id} at ${point.toArray()}`);
    }
  }
  disposeSceneResources(plumbing.root);disposeSceneResources(drive.root);
});
