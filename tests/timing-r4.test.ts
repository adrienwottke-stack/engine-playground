import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54TimingDrive,timingChainPath,type TimingChain} from '../src/engine-3d-timing';
import {animateWorkshopAssembly} from '../src/engine-3d-assembly';
import {disposeSceneResources} from '../src/engine-three-resources';

const TAU=Math.PI*2,headOffset=15.62;
const create=()=>createM54TimingDrive(headOffset,(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness}));
function animate(drive:ReturnType<typeof create>,angle:number){
  const adapter={...drive,accessoryDrive:{wheels:[],belts:[]},fan:new T.Group(),pulley:new T.Group(),throttle:new T.Group()};
  animateWorkshopAssembly(adapter as unknown as Parameters<typeof animateWorkshopAssembly>[0],angle,0,0);
  drive.root.updateMatrixWorld(true);
}
function point(c:TimingChain,index=0){const m=new T.Matrix4();c.links.getMatrixAt(index,m);return new T.Vector3().setFromMatrixPosition(m);}
function contactSamples(c:TimingChain,center:T.Vector3,radius:number){
  const result:number[]=[];
  for(let i=0;i<2500;i++)if(Math.abs(c.curve.getPointAt(i/2500).distanceTo(center)-radius)<1e-7)result.push(i/2500);
  return result;
}

test('timing drive retains all shaft datums and separates moving geometry from stationary batches',()=>{
  const d=create(),camY=279+headOffset;
  assert.deepEqual(d.sprockets.map(s=>s.part.position.toArray()),[[-333,0,0],[-333,camY,23],[-320,camY,-23],[-320,camY,23]]);
  for(const c of d.chain){assert.equal(c.links.parent,d.root);assert.ok(!d.staticGroups.some(g=>g===c.links.parent));}
  for(const s of d.sprockets)assert.ok(!d.staticGroups.includes(s.part));
  assert.equal(d.chain.length,2);assert.equal(d.sprockets.length,4);assert.ok(d.staticGroups.length>=4);
  assert.equal(d.root.getObjectByName('M54B30 Doppel VANOS Stellkolben im Schnitt')!.userData.cutawayOnly,true,'the renderer can hide the cut VANOS body behind the full closed cover');
  d.root.traverse(o=>{if(o instanceof T.Mesh){const positions=o.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)assert.ok([positions.getX(i),positions.getY(i),positions.getZ(i)].every(Number.isFinite));for(const m of Array.isArray(o.material)?o.material:[o.material])assert.equal(m.depthTest,true);}});
  const initial=new T.Box3().setFromObject(d.root);assert.ok(initial.max.x<-300&&initial.min.x>=-375,'unanimated bounds stay at the real timing assembly, never at world zero');
  let triangles=0;d.root.traverse(o=>{if(o instanceof T.Mesh)triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*(o instanceof T.InstancedMesh?o.count:1);});assert.ok(triangles<80000,'detail stays within the bounded timing geometry budget');
  disposeSceneResources(d.root);
});

test('integer link pitch fits the circumference of every driven sprocket and the whole loop',()=>{
  const d=create();
  for(const [ci,indices] of [[0,[0,1]],[1,[2,3]]] as const){
    const c=d.chain[ci],pitch=c.length/c.links.count;
    assert.ok(Math.abs(pitch-c.links.userData.pitch)<1e-10);
    for(const index of indices){const data=d.sprockets[index].part.userData;assert.ok(Math.abs(TAU*data.pitchRadius/data.teeth-pitch)<1e-10);}
    let previous=c.curve.getPointAt(0);
    for(let i=1;i<=3000;i++){const p=c.curve.getPointAt(i/3000);assert.ok(Math.abs(p.distanceTo(previous)-c.length/3000)<.002,'equal phase steps have equal travel even at tangent transitions');previous=p;}
    assert.ok(c.curve.getPointAt(0).distanceTo(c.curve.getPointAt(1))<1e-10);
  }
  disposeSceneResources(d.root);
});

test('chain travel matches the sign and speed of the actual rotating X shafts at every wrapped contact',()=>{
  const d=create(),axis=new T.Vector3(1,0,0);
  for(const [ci,indices] of [[0,[0,1]],[1,[2,3]]] as const){
    const c=d.chain[ci];
    for(const index of indices){
      const sprocket=d.sprockets[index],center=sprocket.part.position,radius=sprocket.part.userData.pitchRadius,samples=contactSamples(c,center,radius);
      assert.ok(samples.length>100,'test actual circular contact, not arbitrary ratio table entries');
      for(const u of samples.filter((_n,i)=>i%17===0)){
        const p=c.curve.getPointAt(u),chainVelocity=c.curve.getTangentAt(u).multiplyScalar(c.pitchRadius),shaftVelocity=new T.Vector3().crossVectors(axis,p.clone().sub(center)).multiplyScalar(sprocket.ratio);
        assert.ok(chainVelocity.distanceTo(shaftVelocity)<1e-7,'same vector at the chain/sprocket contact');
      }
    }
  }
  // Measure displacement through the existing assembly animator, including
  // negative and many-turn crank angles. No second animation implementation.
  for(const angle of [-37*TAU-.4,-.6,0,1.2,53*TAU+.2])for(const c of d.chain){
    const h=1e-3;animate(d,angle-h);const before=point(c);animate(d,angle+h);const after=point(c);
    const u=((angle*c.pitchRadius/c.length)%1+1)%1,expected=c.curve.getTangentAt(u).multiplyScalar(c.pitchRadius);
    assert.ok(after.sub(before).multiplyScalar(1/(2*h)).distanceTo(expected)<.035,'Float32 instance motion follows the predicted signed speed');
  }
  disposeSceneResources(d.root);
});

test('a repeated crank angle restores the same matrices without elapsed-time drift',()=>{
  const d=create();animate(d,.713);
  const saved=d.chain.map(c=>Array.from(c.links.instanceMatrix.array));
  animate(d,-22.18);animate(d,1e4);animate(d,.713);
  d.chain.forEach((c,i)=>assert.deepEqual(Array.from(c.links.instanceMatrix.array),saved[i]));
  assert.equal(d.sprockets[0].part.rotation.x,.713);assert.ok(d.sprockets.slice(1).every(s=>s.part.rotation.x===.713*.5));
  disposeSceneResources(d.root);
});

test('visible roller ends sit in real tooth pockets rather than sliding over the tooth tips',()=>{
  const d=create();
  for(const angle of [-.7,.2,2.1]){
    animate(d,angle);
    for(const [ci,indices] of [[0,[0,1]],[1,[2,3]]] as const){
      const c=d.chain[ci],half=c.links.userData.pitch/2,roller=c.links.userData.pitch*.21;
      for(const si of indices){
        const s=d.sprockets[si],center=s.part.position,radius=s.part.userData.pitchRadius;let checked=0;
        for(let i=0;i<c.links.count;i++){
          const m=new T.Matrix4();c.links.getMatrixAt(i,m);const middle=new T.Vector3().setFromMatrixPosition(m);
          if(Math.abs(middle.distanceTo(center)-radius)>.0001)continue;
          const pin=new T.Vector3(0,half,0).applyMatrix4(m),radial=pin.clone().sub(center).normalize(),origin=pin.clone().addScaledVector(radial,8);
          const hit=new T.Raycaster(origin,radial.clone().negate(),0,20).intersectObject(s.part,true)[0];assert.ok(hit,'a tooth-pocket surface exists below each wrapped roller');
          const gap=pin.distanceTo(center)-roller-hit.point.distanceTo(center);
          assert.ok(gap>-.14&&gap<.95,`roller clears the root and fits between tooth flanks, measured gap ${gap}`);checked++;
        }
        assert.ok(checked>=6);
      }
    }
  }
  disposeSceneResources(d.root);
});

test('guides have a close roller contact face, supports into the front casting, and no secondary tooth collision',()=>{
  const d=create(),guides=d.root.getObjectByName('M54B30 Steuerketten Gleitschienen')!,camY=279+headOffset,chain=d.chain[0],roller=chain.links.userData.pitch*.21;
  d.root.updateMatrixWorld(true);
  for(const name of ['Primaere Spannschiene','Primaere feste Gleitschiene']){
    const rail=guides.getObjectByName(name) as T.Mesh;assert.ok(rail);
    const positions=rail.geometry.getAttribute('position');let closest=Infinity;
    for(let i=0;i<positions.count;i++){
      const p=new T.Vector3(-333,positions.getY(i),positions.getZ(i));
      for(let k=0;k<1400;k++)closest=Math.min(closest,p.distanceTo(chain.curve.getPointAt(k/1400)));
    }
    assert.ok(closest>=roller-.03&&closest<roller+.35,'sliding rail meets the roller without entering its centreline');
  }
  const support=new T.Box3().setFromObject(guides);assert.ok(support.max.x>=-310,'backing bosses reach the existing front casting');
  const bridge=d.root.getObjectByName('M54B30 mittlerer Kettenfuehrer und Sekundaerspanner')!;
  for(const name of ['Unterer Kettengleitbelag','Oberer Kettenspannbelag']){
    const shoe=bridge.getObjectByName(name) as T.Mesh,box=new T.Box3().setFromObject(shoe),r=d.sprockets[2].part.userData.pitchRadius;
    for(const z of [-23,23])for(const y of [box.min.y,box.max.y])for(const v of [box.min.z,box.max.z])assert.ok(Math.hypot(y-camY,v-z)>r+.65,'shoe corners clear both tooth tips');
  }
  assert.equal(bridge.userData.mountingBolts,4);assert.equal(bridge.userData.guideBolts,2);
  disposeSceneResources(d.root);
});

test('legacy sampled paths remain finite and never enter either sprocket hub',()=>{
  for(const [a,ra,b,rb] of [[[0,0],13,[294.62,23],26],[[294.62,-23],15,[294.62,23],15]] as [number[],number,number[],number][]){
    const path=timingChainPath(-333,a,ra,b,rb),curve=new T.CatmullRomCurve3(path.map(p=>new T.Vector3(...p)),true,'centripetal');
    for(let i=0;i<2000;i++){const p=curve.getPointAt(i/2000);assert.ok(p.toArray().every(Number.isFinite));for(const [center,r] of [[a,ra],[b,rb]] as [number[],number][])assert.ok(Math.hypot(p.y-center[0],p.z-center[1])>r-.12);}
  }
  assert.throws(()=>timingChainPath(0,[0,0],20,[0,0],10),RangeError);
  assert.throws(()=>createM54TimingDrive(NaN,color=>new T.MeshStandardMaterial({color})),RangeError);
});
