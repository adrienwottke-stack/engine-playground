import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {accessoryBeltPath,createM54AccessoryDrive,animateM54AccessoryDrive} from '../src/engine-3d-accessory-drive';
import {createEngineMaterial} from '../src/engine-material-profiles';

const create=()=>createM54AccessoryDrive([-344,63,-30],createEngineMaterial);
const near=(actual:number,expected:number,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function dispose(drive:ReturnType<typeof create>){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  drive.root.traverse(object=>{if(object instanceof T.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

test('both flat ribbed belts retain the pump node, separate tracks and mounted X axes',()=>{
  const drive=create();try{
    assert.deepEqual(drive.pulley.position.toArray(),[-398,63,-30]);
    assert.deepEqual(drive.pumpShaft.from,[-344,63,-30]);assert.deepEqual(drive.pumpShaft.to,[-398,63,-30]);
    assert.equal(drive.wheels.length,9);assert.equal(drive.belts.length,2);
    near(Math.abs(drive.planes.main-drive.planes.ac),22);
    for(const belt of drive.belts){
      const geometry=belt.mesh.geometry;geometry.computeBoundingBox();
      near(geometry.boundingBox!.max.x-geometry.boundingBox!.min.x,belt.width,1e-3);
      assert.equal(geometry.userData.section,'flat-longitudinal-v-ribs');assert.equal(geometry.userData.ribs,belt.id==='main'?6:4);
      for(const wheel of drive.wheels.filter(w=>w.belt===belt.id))near(wheel.part.position.x,belt.path.x);
    }
    drive.root.traverse(object=>{if(object instanceof T.Mesh)assert.notEqual(object.geometry.type,'TubeGeometry');});
    assert.ok(drive.mounts.length>=9);assert.ok(drive.mounts.every(m=>m.from[0]===-336&&m.to[0]<-336));
  }finally{dispose(drive);}
});

test('straight spans meet every pitch circle tangentially and wrap joins stay C1',()=>{
  const drive=create();try{
    for(const belt of drive.belts){
      const {path}=belt,arcs=path.segments.filter(s=>s.kind==='arc');
      assert.equal(arcs.length,path.pulleys.length);
      for(let i=0;i<path.pulleys.length;i++){
        const a=path.pulleys[i],b=path.pulleys[(i+1)%path.pulleys.length],span=path.segments[i*2+1];assert.equal(span.kind,'line');
        const dy=span.end[0]-span.start[0],dz=span.end[1]-span.start[1];
        near((span.start[0]-a.center[0])*dy+(span.start[1]-a.center[1])*dz,0);
        near((span.end[0]-b.center[0])*dy+(span.end[1]-b.center[1])*dz,0);
        near(Math.hypot(span.start[0]-a.center[0],span.start[1]-a.center[1]),a.radius);
        near(Math.hypot(span.end[0]-b.center[0],span.end[1]-b.center[1]),b.radius);
      }
      let distance=0;
      for(const segment of path.segments){
        const before=path.sample(distance-1e-5),after=path.sample(distance+1e-5);
        assert.ok(before.tangent.dot(after.tangent)>.999999);assert.ok(before.point.distanceTo(after.point)<3e-5);distance+=segment.length;
      }
      assert.ok(path.sample(0).point.distanceTo(path.sample(path.length).point)<1e-9);
    }
  }finally{dispose(drive);}
});

test('belt centreline never shortcuts through another pulley, including reverse rollers',()=>{
  const drive=create();try{
    for(const {path} of drive.belts){
      for(let i=0;i<1500;i++){
        const p=path.sample(i/1500*path.length).point;
        for(const wheel of path.pulleys)assert.ok(Math.hypot(p.y-wheel.center[0],p.z-wheel.center[1])>=wheel.radius-1e-7,wheel.id);
      }
      for(const arc of path.segments.filter(s=>s.kind==='arc'))assert.ok(Math.abs(arc.sweep)>Math.PI/12&&Math.abs(arc.sweep)<Math.PI*1.5);
    }
  }finally{dispose(drive);}
});

test('rim contact velocity matches each belt on driven and back-side pulleys',()=>{
  const drive=create(),epsilon=1e-6;try{
    for(const belt of drive.belts){
      let distance=0;
      for(const segment of belt.path.segments){
        if(segment.kind==='arc'){
          const wheel=drive.wheels.find(w=>w.id===segment.pulley)!,angle=segment.startAngle+segment.sweep/2;
          const local=new T.Vector3(0,segment.radius*Math.cos(angle),segment.radius*Math.sin(angle));
          animateM54AccessoryDrive(drive,0);const rim0=local.clone().applyAxisAngle(new T.Vector3(1,0,0),wheel.part.rotation.x).add(wheel.part.position);
          animateM54AccessoryDrive(drive,epsilon);const rim1=local.clone().applyAxisAngle(new T.Vector3(1,0,0),wheel.part.rotation.x).add(wheel.part.position);
          const belt0=belt.path.sample(distance+segment.length/2).point,belt1=belt.path.sample(distance+segment.length/2+epsilon*belt.driverRadius).point;
          assert.ok(rim1.sub(rim0).divideScalar(epsilon).distanceTo(belt1.sub(belt0).divideScalar(epsilon))<.002,wheel.id);
        }
        distance+=segment.length;
      }
    }
    assert.ok(drive.wheels.filter(w=>w.side===-1).every(w=>w.ratio<0));
    assert.equal(drive.wheels.find(w=>w.id==='crank')!.ratio,1);assert.equal(drive.wheels.find(w=>w.id==='crank-ac')!.ratio,1);
  }finally{dispose(drive);}
});

test('seeking, pausing and rewinding depend only on crank angle, without accumulated time',()=>{
  const drive=create();try{
    const pose=()=>({wheels:drive.wheels.map(w=>w.part.rotation.x),marks:drive.belts.flatMap(b=>b.marks.map(m=>[...m.part.position.toArray(),m.part.rotation.x]))});
    animateM54AccessoryDrive(drive,.7);const initial=pose();
    animateM54AccessoryDrive(drive,90);animateM54AccessoryDrive(drive,-20);animateM54AccessoryDrive(drive,.7);assert.deepEqual(pose(),initial);
    animateM54AccessoryDrive(drive,.7);assert.deepEqual(pose(),initial);
    animateM54AccessoryDrive(drive,-.7);
    drive.wheels.forEach((wheel,index)=>near(wheel.part.rotation.x,-initial.wheels[index]));
    const staticSet=new Set(drive.staticGroups.flatMap(group=>{const objects:T.Object3D[]=[];group.traverse(o=>objects.push(o));return objects;}));
    assert.ok(drive.wheels.every(w=>!staticSet.has(w.part)));assert.ok(drive.belts.every(b=>b.marks.every(m=>!staticSet.has(m.part))));
  }finally{dispose(drive);}
});

test('invalid nodes and geometrically impossible belt spans fail explicitly',()=>{
  assert.throws(()=>createM54AccessoryDrive([0,NaN,0],createEngineMaterial));
  assert.throws(()=>accessoryBeltPath(0,[{id:'a',center:[0,0],radius:20,side:1},{id:'b',center:[10,0],radius:20,side:-1}]));
  const drive=create();try{assert.throws(()=>animateM54AccessoryDrive(drive,Infinity));}finally{dispose(drive);}
});
