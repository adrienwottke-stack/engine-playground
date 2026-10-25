import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2;
type Point2=readonly [number,number];
export type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
export type TimingChain={links:T.InstancedMesh;curve:T.Curve<T.Vector3>;length:number;pitchRadius:number};
export type TimingSprocket={part:T.Group;ratio:number};
type Segment={length:number;point:(u:number,target:T.Vector3)=>T.Vector3;tangent:(u:number,target:T.Vector3)=>T.Vector3};

/** Arc-length parametrised line/arc loop. Unlike an interpolating spline this
 * never bows through a tooth root or changes speed at a guide transition. */
class TimingLoop extends T.Curve<T.Vector3>{
  private readonly total:number;
  constructor(readonly segments:Segment[]){super();this.total=segments.reduce((n,s)=>n+s.length,0);}
  private at(t:number){
    let distance=Math.max(0,Math.min(1,t))*this.total;
    for(const s of this.segments){if(distance<=s.length)return {s,u:distance/s.length};distance-=s.length;}
    return {s:this.segments[this.segments.length-1],u:1};
  }
  getPoint(t:number,target=new T.Vector3()){const {s,u}=this.at(t);return s.point(u,target);}
  getPointAt(u:number,target=new T.Vector3()){return this.getPoint(u,target);}
  getTangent(t:number,target=new T.Vector3()){const {s,u}=this.at(t);return s.tangent(u,target);}
  getTangentAt(u:number,target=new T.Vector3()){return this.getTangent(u,target);}
  getLength(){return this.total;}
}

function loopGeometry(x:number,a:Point2,ra:number,b:Point2,rb:number){
  const dy=b[0]-a[0],dz=b[1]-a[1],distance=Math.hypot(dy,dz);
  if(![x,...a,ra,...b,rb].every(Number.isFinite)||ra<=0||rb<=0||distance<=ra+rb)throw new RangeError('Timing sprockets need finite, separate pitch circles.');
  const uy=dy/distance,uz=dz/distance,k=(ra-rb)/distance,q=Math.sqrt(1-k*k);
  const plus:[number,number]=[uy*k-uz*q,uz*k+uy*q],minus:[number,number]=[uy*k+uz*q,uz*k-uy*q];
  const point=(c:Point2,r:number,n:Point2)=>new T.Vector3(x,c[0]+r*n[0],c[1]+r*n[1]);
  const ap=point(a,ra,plus),bp=point(b,rb,plus),am=point(a,ra,minus),bm=point(b,rb,minus);
  const line=(from:T.Vector3,to:T.Vector3):Segment=>({length:from.distanceTo(to),point:(u,t)=>t.copy(from).lerp(to,u),tangent:(_u,t)=>t.copy(to).sub(from).normalize()});
  const arc=(center:Point2,r:number,from:Point2,to:Point2):Segment=>{
    const start=Math.atan2(from[1],from[0]);let sweep=((Math.atan2(to[1],to[0])-start)%TAU+TAU)%TAU;
    // The legacy path winds clockwise in the YZ plane for both chains.
    if(sweep>0)sweep-=TAU;
    return {length:-sweep*r,point:(u,t)=>{const angle=start+sweep*u;return t.set(x,center[0]+r*Math.cos(angle),center[1]+r*Math.sin(angle));},tangent:(u,t)=>{const angle=start+sweep*u;return t.set(0,Math.sin(angle),-Math.cos(angle));}};
  };
  const curve=new TimingLoop([line(ap,bp),arc(b,rb,plus,minus),line(bm,am),arc(a,ra,minus,plus)]);
  return {curve,plus,minus,ap,bp,am,bm,lineLength:ap.distanceTo(bp)};
}

/** Compatibility sampling for the existing assembly tests. The runtime uses
 * exact circular arcs; the returned array remains a non-duplicated closed path. */
export function timingChainPath(x:number,a:number[],ra:number,b:number[],rb:number){
  const {curve}=loopGeometry(x,[a[0],a[1]],ra,[b[0],b[1]],rb),points:number[][]=[];
  for(const s of curve.segments){const count=Math.max(2,Math.ceil(s.length/2));for(let i=0;i<count;i++)points.push(s.point(i/count,new T.Vector3()).toArray());}
  return points;
}

function extrusion(shape:T.Shape,width:number,curveSegments=10){
  const g=new T.ExtrudeGeometry(shape,{depth:width,steps:1,bevelEnabled:false,curveSegments});
  return g.applyMatrix4(new T.Matrix4().set(0,0,1,-width/2,1,0,0,0,0,1,0,0,0,0,0,1));
}
function hole(shape:T.Shape,y:number,z:number,r:number){const h=new T.Path();h.absarc(y,z,r,0,TAU,true);shape.holes.push(h);}
function merge(pieces:T.BufferGeometry[]){
  const copies=pieces.map(g=>g.index?g.toNonIndexed():g.clone()),result=mergeGeometries(copies)!;
  copies.forEach(g=>g.dispose());pieces.forEach(g=>g.dispose());return result;
}
function sprocketGeometry(radius:number,teeth:number,phase:number,width:number,style:'crank'|'primary'|'secondary'){
  const shape=new T.Shape(),roller=radius*TAU/teeth*.21;
  const profile=[[-.5,.65],[-.32,.65],[-.19,-.05],[0,-roller-.08],[.19,-.05],[.32,.65]];
  for(let tooth=0;tooth<teeth;tooth++)for(let i=0;i<profile.length;i++){
    const [fraction,offset]=profile[i],angle=phase+(tooth+fraction)*TAU/teeth,r=radius+offset;
    const y=Math.cos(angle)*r,z=Math.sin(angle)*r;
    if(tooth===0&&i===0)shape.moveTo(y,z);else shape.lineTo(y,z);
  }
  shape.closePath();hole(shape,0,0,style==='crank'?4:radius*.23);
  if(style==='primary')for(let i=0;i<6;i++){const a=i/6*TAU;hole(shape,Math.cos(a)*radius*.65,Math.sin(a)*radius*.65,radius*.09);}
  if(style==='secondary')for(let i=0;i<3;i++){
    const angle=i/3*TAU,h=new T.Path(),inner=radius*.42,outer=radius*.73,span=.53;
    h.absarc(0,0,outer,angle-span,angle+span,false);h.absarc(0,0,inner,angle+span,angle-span,true);h.closePath();shape.holes.push(h);
  }
  return extrusion(shape,width);
}

/** One roller per pitch, two side plates with relieved waists. Adjacent rivet
 * heads meet; the small chordal articulation is an illustration at this scale. */
function linkGeometry(pitch:number){
  const half=pitch/2,r=pitch*.29,shape=new T.Shape();
  shape.moveTo(-half,-r);shape.quadraticCurveTo(0,-r*.56,half,-r);shape.absarc(half,0,r,-Math.PI/2,Math.PI/2,false);shape.quadraticCurveTo(0,r*.56,-half,r);shape.absarc(-half,0,r,Math.PI/2,Math.PI*1.5,false);shape.closePath();
  hole(shape,-half,0,pitch*.105);hole(shape,half,0,pitch*.105);
  const plate=extrusion(shape,.65,3),pieces:T.BufferGeometry[]=[plate.clone().translate(-2.1,0,0),plate.clone().translate(2.1,0,0)];plate.dispose();
  const roller=new T.CylinderGeometry(pitch*.21,pitch*.21,3.55,6);roller.rotateZ(Math.PI/2);roller.translate(0,half,0);pieces.push(roller);
  // Only the forward rivet is authored: the preceding instance supplies the
  // other end. This avoids duplicated, coplanar rivet faces on straight spans.
  for(const x of [-2.62,2.62]){const pin=new T.CylinderGeometry(pitch*.125,pitch*.125,.5,6);pin.rotateZ(Math.PI/2);pin.translate(x,half,0);pieces.push(pin);}
  return merge(pieces);
}

/** Illustration radii are solved so an integer number of visible links and
 * teeth share one exact arc pitch. These are not asserted OEM tooth counts. */
function primaryRadius(distance:number){
  let lo=distance*.01,hi=distance*.1;
  for(let i=0;i<60;i++){
    const r=(lo+hi)/2,loop=loopGeometry(0,[0,0],r,[distance,0],2*r),pitch=TAU*r/16;
    if(loop.curve.getLength()/pitch>140)lo=r;else hi=r;
  }
  return (lo+hi)/2;
}

export function createM54TimingDrive(headOffset:number,mat:MaterialFactory){
  if(!Number.isFinite(headOffset))throw new RangeError('A finite head offset is required.');
  const root=new T.Group();root.name='M54B30 Steuertrieb';
  const chain:TimingChain[]=[],sprockets:TimingSprocket[]=[],staticGroups:T.Group[]=[],partNames:string[]=[];
  const steel=mat(0x8e999d,.82,.3),darkSteel=mat(0x414b50,.73,.43),machined=mat(0xc2c8c8,.8,.29),cast=mat(0x8b9393,.45,.62),polymer=mat(0x50392b,.05,.72),black=mat(0x22272a,.08,.7);
  const group=(name:string)=>{const g=new T.Group();g.name=name;root.add(g);staticGroups.push(g);partNames.push(name);return g;};
  const mesh=(geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D,x=0,y=0,z=0,name='')=>{const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.name=name;parent.add(m);return m;};
  const cyl=(p:T.Object3D,r:number,length:number,material:T.Material,x:number,y:number,z:number,segments=20)=>{const g=new T.CylinderGeometry(r,r,length,segments);g.rotateZ(Math.PI/2);return mesh(g,material,p,x,y,z);};
  const ring=(p:T.Object3D,r:number,thickness:number,material:T.Material,x:number,y:number,z:number)=>{const g=new T.TorusGeometry(r,thickness,5,32);g.rotateY(Math.PI/2);return mesh(g,material,p,x,y,z);};
  const bar=(p:T.Object3D,from:T.Vector3,to:T.Vector3,width:number,depth:number,material:T.Material)=>{
    const length=from.distanceTo(to),m=mesh(new T.BoxGeometry(width,length,depth),material,p);m.position.copy(from).lerp(to,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),to.clone().sub(from).normalize());return m;
  };
  const camY=279+headOffset,r=primaryRadius(Math.hypot(camY,23)),secondaryR=46/Math.PI;
  const primary=loopGeometry(-333,[0,0],r,[camY,23],r*2),secondary=loopGeometry(-320,[camY,-23],secondaryR,[camY,23],secondaryR);
  const definitions=[{path:primary,radius:r,ratio:1,teeth:16,count:140,name:'Primaere Steuerkette'},{path:secondary,radius:secondaryR,ratio:.5,teeth:20,count:40,name:'Sekundaere Steuerkette'}];
  for(const d of definitions){
    const length=d.path.curve.getLength(),pitch=TAU*d.radius/d.teeth;
    const links=new T.InstancedMesh(linkGeometry(pitch),steel,d.count);links.name=d.name;links.instanceMatrix.setUsage(T.DynamicDrawUsage);links.frustumCulled=false;
    links.userData={pitch,teeth:d.teeth,pitchRadius:d.radius};root.add(links);partNames.push(d.name);
    // Clockwise path winding needs a negative displacement for positive X rotation.
    chain.push({links,curve:d.path.curve,length,pitchRadius:-d.radius*d.ratio});
  }
  const sprocket=(name:string,x:number,y:number,z:number,radius:number,teeth:number,ratio:number,phase:number,style:'crank'|'primary'|'secondary')=>{
    const part=new T.Group();part.name=name;part.position.set(x,y,z);root.add(part);partNames.push(name);
    part.userData={pitchRadius:radius,teeth,phase};
    mesh(sprocketGeometry(radius,teeth,phase+Math.PI/teeth,3.1,style),darkSteel,part,0,0,0,'Zahnkranz mit Rollentaschen');
    ring(part,radius*.83,.5,steel,-1.6,0,0);cyl(part,style==='crank'?4.7:radius*.3,6,machined,0,0,0);
    if(style==='primary')for(let i=0;i<3;i++){
      const angle=i/3*TAU+.22,y=Math.cos(angle)*radius*.47,z=Math.sin(angle)*radius*.47;
      const slot=new T.Shape();slot.absarc(0,0,2.2,0,TAU);mesh(extrusion(slot,1.1),machined,part,-2,y,z);cyl(part,1.6,4,steel,-3.6,y,z,6);
    }
    if(style==='secondary'){
      const sleeve=new T.Group();sleeve.name='VANOS Keilwellenkupplung';part.add(sleeve);
      cyl(sleeve,5.3,14,darkSteel,-11,0,0);
      const splines:T.BufferGeometry[]=[];
      for(let i=0;i<10;i++){
        const a=i/10*TAU,g=new T.BoxGeometry(13,.9,1);g.rotateX(a+.2);g.translate(-10,Math.cos(a)*5.4,Math.sin(a)*5.4);splines.push(g);
      }
      mesh(merge(splines),machined,sleeve);
    }
    sprockets.push({part,ratio});return part;
  };
  const primaryStart=Math.atan2(primary.plus[1],primary.plus[0]),secondaryStart=Math.atan2(secondary.plus[1],secondary.plus[0]);
  sprocket('Kurbelwellenkettenrad',-333,0,0,r,16,1,primaryStart,'crank');
  sprocket('Primaeres Nockenwellenrad',-333,camY,23,r*2,32,.5,primaryStart+primary.lineLength/(r*2),'primary');
  sprocket('Sekundaeres Einlass Nockenwellenrad',-320,camY,-23,secondaryR,20,.5,secondaryStart,'secondary');
  sprocket('Sekundaeres Auslass Nockenwellenrad',-320,camY,23,secondaryR,20,.5,secondaryStart+secondary.lineLength/secondaryR,'secondary');

  // Full-width polymer slide faces are offset by the roller radius; backing
  // ribs and bearing bosses physically join the front block/head datum x=-310.
  const guides=group('M54B30 Steuerketten Gleitschienen');
  const rails:{from:T.Vector3;to:T.Vector3;normal:T.Vector3;name:string}[]=[];
  const rail=(from:T.Vector3,to:T.Vector3,normal:T.Vector3,pitch:number,name:string)=>{
    const slideFrom=from.clone().addScaledVector(normal,pitch*.21+.1),slideTo=to.clone().addScaledVector(normal,pitch*.21+.1);
    const shape=new T.Shape(),direction=to.clone().sub(from).normalize(),length=from.distanceTo(to),tip=2;
    // Rounded plan ends. Local YZ coordinates use distance along the rail and
    // depth outward, so no cylindrical rod stands in for a sliding surface.
    shape.moveTo(0,.05);shape.lineTo(length,.05);shape.quadraticCurveTo(length+tip,2,length,4.2);shape.lineTo(0,4.2);shape.quadraticCurveTo(-tip,2,0,.05);shape.closePath();
    const geometry=extrusion(shape,7.2),transform=new T.Matrix4().set(1,0,0,slideFrom.x,0,direction.y,normal.y,slideFrom.y,0,direction.z,normal.z,slideFrom.z,0,0,0,1);
    mesh(geometry.applyMatrix4(transform),polymer,guides,0,0,0,name);
    bar(guides,slideFrom.clone().addScaledVector(normal,5.2),slideTo.clone().addScaledVector(normal,5.2),8.6,2.6,black);
    for(const fraction of [.04,.49,.96]){
      const p=slideFrom.clone().lerp(slideTo,fraction).addScaledVector(normal,6.2);
      cyl(guides,4.5,Math.abs(-310-p.x),cast,(p.x-310)/2,p.y,p.z);
      cyl(guides,2.2,11,machined,p.x-1,p.y,p.z,6);ring(guides,3.8,.65,darkSteel,p.x-5,p.y,p.z);
    }
    rails.push({from:slideFrom,to:slideTo,normal,name});
  };
  rail(primary.ap.clone().lerp(primary.bp,.085),primary.ap.clone().lerp(primary.bp,.84),new T.Vector3(0,...primary.plus),chain[0].links.userData.pitch,'Primaere Spannschiene');
  rail(primary.am.clone().lerp(primary.bm,.09),primary.am.clone().lerp(primary.bm,.81),new T.Vector3(0,...primary.minus),chain[0].links.userData.pitch,'Primaere feste Gleitschiene');

  const hydraulic=group('M54B30 angebundener hydraulischer Kettenspanner'),outer=rails[0],seat=outer.from.clone().lerp(outer.to,.87).addScaledVector(outer.normal,4.2);
  const axis=outer.normal.clone(),cylinder=(radius:number,length:number,center:T.Vector3,material:T.Material,segments=20)=>{
    const g=new T.CylinderGeometry(radius,radius,length,segments),m=mesh(g,material,hydraulic);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);m.position.copy(center);return m;
  };
  cylinder(2.7,9,seat.clone().addScaledVector(axis,4.5),machined);
  cylinder(5.6,13,seat.clone().addScaledVector(axis,14.5),cast);
  cylinder(7,5,seat.clone().addScaledVector(axis,23.5),machined,6);
  const boss=seat.clone().addScaledVector(axis,13);cyl(hydraulic,8,20,cast,-320,boss.y,boss.z);
  for(const t of [8.7,11,13.3,15.6,17.9])cylinder(5.85,.7,seat.clone().addScaledVector(axis,t),darkSteel);

  const bridge=group('M54B30 mittlerer Kettenfuehrer und Sekundaerspanner');
  // The lower shoe sits inside the lower straight secondary strand, the upper
  // hydraulic shoe inside its upper strand. Both have a real bolted carrier.
  const secondaryRoller=chain[1].links.userData.pitch*.21,lowerY=camY-secondaryR+secondaryRoller+1.58,upperY=camY+secondaryR-secondaryRoller-1.58;
  mesh(new T.BoxGeometry(8,3,22),polymer,bridge,-320,lowerY,0,'Unterer Kettengleitbelag');
  mesh(new T.BoxGeometry(8,3,22),polymer,bridge,-320,upperY,0,'Oberer Kettenspannbelag');
  mesh(new T.BoxGeometry(11,7,16),black,bridge,-315,lowerY+4,0);
  mesh(new T.BoxGeometry(12,4,18),cast,bridge,-315,upperY-4.3,0);
  for(const z of [-6,6]){
    mesh(new T.BoxGeometry(8,12,5),cast,bridge,-311,upperY-10,z);cyl(bridge,2,14,machined,-316,upperY-11,z,6);
    const g=new T.CylinderGeometry(2.6,2.6,7,12);mesh(g,machined,bridge,-316,upperY-4,z);
  }
  for(const z of [-6,0,6])cyl(bridge,2,12,steel,-314,upperY-12,z,6);
  for(const z of [-6,6])cyl(bridge,2.2,14,machined,-315,lowerY+5,z,6);
  bridge.userData.mountingBolts=4;bridge.userData.guideBolts=2;

  const vanos=group('M54B30 Doppel VANOS Stellkolben im Schnitt');vanos.userData.cutawayOnly=true;
  for(const z of [-23,23]){
    const shape=new T.Shape(),start=Math.PI*.36,end=TAU-start;
    for(let i=0;i<=40;i++){const a=start+(end-start)*i/40,y=17*Math.cos(a),v=17*Math.sin(a);if(i===0)shape.moveTo(y,v);else shape.lineTo(y,v);}
    for(let i=40;i>=0;i--){const a=start+(end-start)*i/40;shape.lineTo(13.7*Math.cos(a),13.7*Math.sin(a));}shape.closePath();
    mesh(extrusion(shape,25),cast,vanos,-358,camY,z);
    cyl(vanos,7.2,10,machined,-357,camY,z);cyl(vanos,4.6,24,machined,-344,camY,z);ring(vanos,7.2,.65,darkSteel,-363,camY,z);
    for(const angle of [Math.PI*.64,Math.PI,Math.PI*1.36]){const y=camY+Math.cos(angle)*18,v=z+Math.sin(angle)*18;cyl(vanos,3.6,9,cast,-364,y,v);cyl(vanos,2,10,steel,-369,y,v,6);}
    cyl(vanos,5.4,13,black,-359,camY-30,z);ring(vanos,6.2,.8,machined,-365,camY-30,z);
  }
  mesh(new T.BoxGeometry(17,11,69),cast,vanos,-354,camY-23,0,'VANOS Gehaeusebruecke');
  for(const z of [-42,42]){cyl(vanos,4.5,37,cast,-339,camY-22,z);cyl(vanos,2.5,10,machined,-361,camY-22,z,6);}
  // Merge the repeated moving fasteners once, in their shaft's local frame.
  // The returned sprocket groups themselves must never enter static batching.
  for(const {part} of sprockets){
    part.updateMatrixWorld(true);const inverse=part.matrixWorld.clone().invert(),batches=new Map<T.Material,T.Mesh[]>();
    part.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const list=batches.get(o.material)??[];list.push(o);batches.set(o.material,list);}});
    for(const [material,meshes] of batches){
      if(meshes.length<2)continue;
      const geometry=merge(meshes.map(m=>(m.geometry.clone()).applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld))));
      for(const m of meshes){m.removeFromParent();m.geometry.dispose();}mesh(geometry,material,part);
    }
  }
  // A ready-to-inspect zero-angle pose also gives camera/bounds code meaningful
  // extents before its first animation update, rather than 180 identity links.
  const matrix=new T.Matrix4(),quaternion=new T.Quaternion(),shaftAxis=new T.Vector3(1,0,0),unit=new T.Vector3(1,1,1);
  for(const c of chain){
    for(let i=0;i<c.links.count;i++){
      const u=i/c.links.count,tangent=c.curve.getTangentAt(u);quaternion.setFromAxisAngle(shaftAxis,Math.atan2(tangent.z,tangent.y));
      matrix.compose(c.curve.getPointAt(u),quaternion,unit);c.links.setMatrixAt(i,matrix);
    }
    c.links.instanceMatrix.needsUpdate=true;
  }
  root.userData={illustrative:true,primaryPitch:chain[0].links.userData.pitch,secondaryPitch:chain[1].links.userData.pitch};
  return {chain,sprockets,root,staticGroups,partNames};
}
