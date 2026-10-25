import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {assemblyConnectors} from './engine-3d-layout';
import {CYLINDER_X} from './engine-3d-model';
import {createM54Casting} from './engine-3d-casting';
import {createExhaustTips} from './engine-3d-exhaust-tips';
import {createM54ExhaustManifolds} from './engine-3d-exhaust-manifold';
import {createM54Intake,type M54IntakeSelection} from './engine-3d-intake';
import {createM54AccessoryDrive,animateM54AccessoryDrive} from './engine-3d-accessory-drive';
import {createM54TimingDrive,type TimingChain,type TimingSprocket} from './engine-3d-timing';
import {cloneEngineMaterialWithSurface} from './engine-material-surfaces';
import {createM54Flywheel} from './engine-3d-flywheel';
import {createM54CoolingPlumbing} from './engine-3d-cooling';
export {timingChainPath} from './engine-3d-timing';

const TAU=Math.PI*2;
type Axis='x'|'y'|'z';
type Inputs={extras:T.Group;housing:T.Group;head:T.Group;deck:number;headOffset:number;boreScale:number;mat:(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;confirmedSelection?:M54IntakeSelection};
export type WorkshopAssembly={chain:TimingChain[];sprockets:TimingSprocket[];timingDrive:ReturnType<typeof createM54TimingDrive>;accessoryDrive:ReturnType<typeof createM54AccessoryDrive>;coolingPlumbing:ReturnType<typeof createM54CoolingPlumbing>;radiator:T.Group;fan:T.Group;pulley:T.Group;throttle:T.Group;partNames:string[];closedHousing:T.Group;intakeVariant:ReturnType<typeof createM54Intake>['variant']};

/** An open annular extrusion: the machined lips are real geometry, not a
 * depth-buffer override. Its section is in YZ, with the inspection opening at +Z. */
function shellAlongX(radius:number,wall:number,length:number,gap=Math.PI*.58){
  const shape=new T.Shape(),start=gap/2,end=TAU-gap/2,steps=44;
  for(let i=0;i<=steps;i++){
    const a=start+(end-start)*i/steps,y=radius*Math.sin(a),z=radius*Math.cos(a);
    if(i===0)shape.moveTo(y,z);else shape.lineTo(y,z);
  }
  for(let i=steps;i>=0;i--){const a=start+(end-start)*i/steps;shape.lineTo((radius-wall)*Math.sin(a),(radius-wall)*Math.cos(a));}
  shape.closePath();
  const g=new T.ExtrudeGeometry(shape,{depth:length,steps:1,bevelEnabled:false,curveSegments:24});
  g.applyMatrix4(new T.Matrix4().set(0,0,1,-length/2,1,0,0,0,0,1,0,0,0,0,0,1));return g;
}
export function buildWorkshopAssembly(o:Inputs):WorkshopAssembly{
  const {extras,housing,head,deck,headOffset:ho,boreScale,mat}=o,n=assemblyConnectors(ho),partNames:string[]=[],staticGroups:T.Group[]=[];
  const cast=mat(0x74858c,.45,.65),machined=mat(0xbdc9cb,.72,.34),steel=mat(0x9ba9aa,.75,.38),black=mat(0x24343b,.24,.58),rubber=mat(0x121e23,.03,.83),brass=mat(0xa38a58,.55,.45),ceramic=mat(0xc4b493,.1,.75),cut=mat(0xbd9173,.28,.55);
  const ghost=new T.MeshStandardMaterial({color:0xa8c4c8,roughness:.4,metalness:.1,opacity:.13,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const fluid=new T.MeshBasicMaterial({color:0x81b5ca,transparent:true,opacity:.18,depthWrite:false});
  const group=(name:string,parent:T.Group)=>{const g=new T.Group();g.name=name;parent.add(g);partNames.push(name);staticGroups.push(g);return g;};
  const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x=0,y=0,z=0)=>{const p=new T.Mesh(g,m);p.position.set(x,y,z);parent.add(p);return p;};
  const box=(p:T.Object3D,w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,p,x,y,z);
  const cyl=(p:T.Object3D,r:number,h:number,m:T.Material,x=0,y=0,z=0,axis:Axis='y',segments=24)=>{const a=mesh(new T.CylinderGeometry(r,r,h,segments),m,p,x,y,z);if(axis==='x')a.rotation.z=Math.PI/2;if(axis==='z')a.rotation.x=Math.PI/2;return a;};
  const ring=(p:T.Object3D,r:number,t:number,m:T.Material,x:number,y:number,z:number,axis:Axis='x')=>{const a=mesh(new T.TorusGeometry(r,t,6,32),m,p,x,y,z);if(axis==='x')a.rotation.y=Math.PI/2;else if(axis==='y')a.rotation.x=Math.PI/2;return a;};
  const along=(p:T.Object3D,from:number[],to:number[],r:number,m:T.Material)=>{const start=new T.Vector3(...from),end=new T.Vector3(...to),d=end.clone().sub(start);const a=cyl(p,r,d.length(),m);a.position.copy(start.add(end).multiplyScalar(.5));a.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return a;};
  const shell=(p:T.Object3D,r:number,w:number,l:number,m:T.Material,x:number,y:number,z:number,gap?:number)=>mesh(shellAlongX(r,w,l,gap),m,p,x,y,z);

  const casting=createM54Casting({deck,headOffset:ho,boreScale,materials:{cast,machined,steel,black,rubber,brass,cut}}),closedHousing=casting.closed;
  housing.add(casting.cutBlock,casting.cutHead,closedHousing);extras.add(casting.portMounts);
  staticGroups.push(...casting.groups);partNames.push(...casting.groups.map(g=>g.name));
  const headHardware=group('Nockenwellenlager und Zuendkerzen',head);
  for(const x of CYLINDER_X){
    // Spark plug and exposed electrode. It stays clear of both valve pairs.
    cyl(headHardware,4,15,ceramic,x,229,0);cyl(headHardware,5.2,5,steel,x,220,0,'y',6);cyl(headHardware,1.3,9,steel,x,210,0);
  }
  const camMetal=machined;
  for(const z of [-23,23])cyl(headHardware,7,610,camMetal,0,279,z,'x');
  for(let i=0;i<7;i++)for(const z of [-23,23]){
    box(headHardware,12,11,19,cast,-300+i*100,279,z);cyl(headHardware,2.2,16,steel,-300+i*100,289,z,'y',6);
  }

  // Cast sump: shallow front section, dropped rear reservoir, ribs, flange,
  // drain plug and a small fixed inspection window rather than a plain box.
  const pan=group('Gegossene Oelwanne',extras),outline=new T.Shape();
  outline.moveTo(-308,-53);outline.lineTo(308,-53);outline.lineTo(300,-93);outline.quadraticCurveTo(297,-103,285,-103);outline.lineTo(83,-103);outline.quadraticCurveTo(64,-103,58,-88);outline.lineTo(40,-78);outline.lineTo(-286,-78);outline.quadraticCurveTo(-306,-78,-308,-63);outline.closePath();
  // Thin side castings and a dropped floor leave the sump hollow and open at
  // its flange. A solid extrusion here would intersect the crank counterweights.
  for(const z of [-69,65])mesh(new T.ExtrudeGeometry(outline,{depth:4,bevelEnabled:true,bevelThickness:.8,bevelSize:.8,bevelSegments:1,curveSegments:16}),cast,pan,0,0,z);
  const bottom=[[-308,-63],[-286,-78],[40,-78],[58,-88],[83,-103],[285,-103],[300,-93],[308,-53]];
  for(let i=1;i<bottom.length;i++){
    const a=bottom[i-1],b=bottom[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),plate=box(pan,length,4,134,cast,(a[0]+b[0])/2,(a[1]+b[1])/2,0);plate.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]);
  }
  box(pan,5,13,134,cast,-306,-59,0);
  // The near wall is cut low enough to inspect the rotating crank assembly.
  for(const z of [-70,70])box(pan,623,5,8,machined,0,-51,z);
  for(let x=-278;x<300;x+=38){box(pan,4,Math.max(5,x>65?34:13),3,cast,x,x>65?-77:-66,70);for(const z of [-70,70])cyl(pan,2.7,4,steel,x,-46,z,'y',6);}
  cyl(pan,5,5,brass,282,-105,-33,'y',6);

  // Intake is owned by the parallel intake session; exhaust below stays separate.
  const intakeModel=createM54Intake(ho,mat,o.confirmedSelection),throttle=intakeModel.throttle;
  extras.add(intakeModel.details,throttle);closedHousing.add(intakeModel.closed);housing.add(intakeModel.cut);
  staticGroups.push(...intakeModel.groups);partNames.push(...intakeModel.groups.map(g=>g.name));
  const injectors=group('Kraftstoffleiste Injektoren',extras);
  for(const x of CYLINDER_X){
    along(injectors,[x-7,258+ho,-130],[x,223+ho,-95],4.5,black);along(injectors,[x-3,239+ho,-112],[x,223+ho,-95],3.2,brass);
    box(injectors,9,9,10,rubber,x-10,251+ho,-124);box(injectors,10,5,8,steel,x-7,260+ho,-130);
  }

  const exhaust=group('Abgasnachbehandlung',extras);
  const manifolds=createM54ExhaustManifolds(ho,mat);
  closedHousing.add(manifolds.closed);extras.add(manifolds.details);housing.add(manifolds.cut);
  staticGroups.push(...manifolds.groups);partNames.push(...manifolds.groups.map(g=>g.name));
  const capGeometry=(ry:number,rz:number)=>{
    const shape=new T.Shape();shape.absellipse(0,0,ry,rz,0,TAU,false);
    for(const z of [-37,37]){const h=new T.Path();h.absarc(0,z,20.7,0,TAU,true);shape.holes.push(h);}
    const g=new T.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:false,curveSegments:24});g.applyMatrix4(new T.Matrix4().set(0,0,1,-1.25,1,0,0,0,0,1,0,0,0,0,0,1));return g;
  };
  for(const [center,length,ry,rz] of [[n.middleSilencer,110,36,67],[n.rearSilencer,150,47,79]] as const){
    const [x,y,z]=center,can=shell(exhaust,ry,2.5,length,steel,x,y,z,Math.PI*.7);can.scale.z=rz/ry;
    const outer=shell(closedHousing,ry,2.5,length,steel,x,y,z,0);outer.scale.z=rz/ry;
    for(const side of [-1,1]){
      const rim=ring(exhaust,ry,1.5,machined,x+side*length/2,y,z);rim.scale.x=rz/ry;
      const cap=mesh(capGeometry(ry,rz),steel,exhaust,x+side*length/2,y,z);cap.name='Zweiflutiger Schalldaempfer mit echten Anschlussbohrungen';
    }
    for(const dx of [-length*.23,length*.23])mesh(capGeometry(ry-3,rz-3),black,exhaust,x+dx,y,z);
    for(const bank of [-37,37])for(let dx=-length*.38;dx<length*.4;dx+=9)for(let i=0;i<4;i++){
      const a=Math.PI*.4+i/4*Math.PI*1.2;cyl(exhaust,.9,3,black,x+dx,y+Math.sin(a)*21,z+bank+Math.cos(a)*21,'y',5);
    }
    for(const dx of [-length*.31,length*.31]){const strap=shell(exhaust,ry+1.4,2,5,black,x+dx,y,z,Math.PI*.7);strap.scale.z=rz/ry;}
  }
  const tips=createExhaustTips(n.tails,mat);extras.add(tips);staticGroups.push(tips);partNames.push(tips.name);

  // Radiator, fan shroud, pump/thermostat and expansion tank share the hose nodes.
  const cooling=group('Kuehler Pumpe Thermostat Ausgleich',extras),rx=-470;
  const radiator=group('Kuehler und Luefter zur Antriebseinsicht',extras);
  for(const y of [28,202])box(radiator,25,18,203,black,rx,y,-6);
  for(const z of [-109,98])box(radiator,26,188,7,cast,rx,115,z);
  for(let z=-96;z<=88;z+=9)box(radiator,11,160,2.5,steel,rx,115,z);
  for(let y=39;y<196;y+=5)box(radiator,14,.8,195,black,rx,y,-6);
  for(const connector of [n.radiatorUpper,n.radiatorLower])cyl(radiator,12,24,machined,connector[0]+10,connector[1],connector[2],'x');
  const shroudProfile=new T.Shape();shroudProfile.moveTo(-82,-106);shroudProfile.lineTo(82,-106);shroudProfile.quadraticCurveTo(91,-106,91,-97);shroudProfile.lineTo(91,97);shroudProfile.quadraticCurveTo(91,106,82,106);shroudProfile.lineTo(-82,106);shroudProfile.quadraticCurveTo(-91,106,-91,97);shroudProfile.lineTo(-91,-97);shroudProfile.quadraticCurveTo(-91,-106,-82,-106);shroudProfile.closePath();
  const fanHole=new T.Path();fanHole.absarc(0,0,80,0,TAU,true);shroudProfile.holes.push(fanHole);
  const shroudGeometry=new T.ExtrudeGeometry(shroudProfile,{depth:14,bevelEnabled:false,curveSegments:32});shroudGeometry.applyMatrix4(new T.Matrix4().set(0,0,1,-459,1,0,0,115,0,1,0,-6,0,0,0,1));mesh(shroudGeometry,black,radiator);
  const fan=new T.Group();fan.name='Kuehlerluefter';fan.position.set(-443,115,-6);radiator.add(fan);
  ring(radiator,79,4,black,-444,115,-6);cyl(fan,17,16,black,0,0,0,'x');cyl(fan,8,18,steel,0,0,0,'x');
  const bladeShape=new T.Shape();bladeShape.moveTo(14,-7);bladeShape.quadraticCurveTo(43,-29,71,-25);bladeShape.quadraticCurveTo(78,-8,69,-1);bladeShape.quadraticCurveTo(42,5,17,10);bladeShape.closePath();
  const bladeGeometry=new T.ExtrudeGeometry(bladeShape,{depth:2.5,bevelEnabled:true,bevelSize:.8,bevelThickness:.8,bevelSegments:1});
  bladeGeometry.applyMatrix4(new T.Matrix4().set(0,0,1,-1.2,1,0,0,0,0,1,0,0,0,0,0,1));
  bladeGeometry.scale(1,.94,.94);
  const blades:T.BufferGeometry[]=[];for(let i=0;i<7;i++)blades.push(bladeGeometry.clone().applyMatrix4(new T.Matrix4().makeRotationX(i/7*TAU)));
  mesh(mergeGeometries(blades)!,black,fan);bladeGeometry.dispose();blades.forEach(g=>g.dispose());
  // The stationary motor and spider sit entirely behind the rotating blade
  // plane. Axial posts anchor their corners in the radiator frame.
  cyl(radiator,15,17,black,-428,115,-6,'x');cyl(radiator,5,25,steel,-434,115,-6,'x');
  for(const sy of [-1,1])for(const sz of [-1,1]){
    along(radiator,[-429,115,-6],[-430,115+sy*73,-6+sz*73],3,black);
    cyl(radiator,4,23,black,-442,115+sy*73,-6+sz*73,'x');cyl(radiator,3,26,steel,-442,115+sy*73,-6+sz*73,'x',6);
  }
  const [px,py,pz]=n.pump;
  cyl(cooling,24,22,cast,px,py,pz,'x');cyl(cooling,15,25,machined,px,py,pz,'x');
  for(const a of [0,Math.PI*2/3,Math.PI*4/3])cyl(cooling,3,25,steel,px,py+Math.sin(a)*25,pz+Math.cos(a)*25,'x',6);
  const accessoryDrive=createM54AccessoryDrive(n.pump,mat),pulley=accessoryDrive.pulley;
  extras.add(accessoryDrive.root);staticGroups.push(...accessoryDrive.staticGroups);partNames.push(...accessoryDrive.partNames);
  cyl(cooling,17,28,cast,n.thermostat[0],n.thermostat[1],n.thermostat[2],'x');ring(cooling,17,2,machined,n.thermostat[0]-14,n.thermostat[1],n.thermostat[2]);
  for(const a of [0,TAU/3,TAU*2/3])cyl(cooling,2.6,31,steel,n.thermostat[0],n.thermostat[1]+Math.sin(a)*19,n.thermostat[2]+Math.cos(a)*19,'x',6);
  const tank=group('Ausgleichsbehaelter',extras);cyl(tank,20,74,ghost,-447,178,-204);cyl(tank,17,30,fluid,-447,155,-204);cyl(tank,15,10,black,-447,218,-204);cyl(tank,17,6,black,-447,225,-204,'y',10);
  ring(tank,20,2,black,-447,141,-204,'y');ring(tank,20,2,black,-447,215,-204,'y');box(tank,8,44,8,black,-447,177,-222);
  const coolingPlumbing=createM54CoolingPlumbing(ho,mat);extras.add(coolingPlumbing.root);partNames.push(coolingPlumbing.root.name);

  const timingDrive=createM54TimingDrive(ho,mat),chain=timingDrive.chain,sprockets=timingDrive.sprockets;
  extras.add(timingDrive.root);staticGroups.push(...timingDrive.staticGroups);partNames.push(...timingDrive.partNames);
  // Oil-filter tower, cap and cast mounting foot on the intake side.
  const accessories=group('M54B30 Oelfiltergehaeuse Motortraeger',extras);
  cyl(accessories,21,56,cast,-248,154,-107);cyl(accessories,23,9,black,-248,186,-107,'y',12);cyl(accessories,12,5,black,-248,193,-107,'y',6);
  box(accessories,43,27,31,cast,-248,115,-91);along(accessories,[-248,122,-90],[-281,88,-70],9,cast);

  // Batch all stationary surfaces per material and functional group. Dozens of
  // ribs, fins and fasteners stay cheap without merging the moving components.
  for(const parent of [...staticGroups,fan,pulley]){
    const batches=new Map<T.Material,T.Mesh[]>();
    for(const child of parent.children)if(child instanceof T.Mesh&&!(child instanceof T.InstancedMesh)&&!Array.isArray(child.material)){
      const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);
    }
    for(const [material,meshes] of batches){
      if(meshes.length<2)continue;
      const geometries=meshes.map(p=>{p.updateMatrix();const g=p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone();return g.applyMatrix4(p.matrix);});
      // Implicit cast shells have no UV chart; their R5 surface is triplanar.
      // Match the primitive collars' vertex layout without altering their UVs.
      if(geometries.some(g=>g.hasAttribute('uv')))for(const geometry of geometries)if(!geometry.hasAttribute('uv'))geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
      const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!combined)continue;
      for(const p of meshes){p.removeFromParent();p.geometry.dispose();}mesh(combined,material,parent);
    }
  }
  // Inspection opacity belongs only to the radiator, never to the shared
  // block/pump materials. These clones stay attached and share no ownership.
  const radiatorMaterials=new Map<T.Material,T.Material>();
  radiator.traverse(part=>{if(part instanceof T.Mesh){
    const clone=(material:T.Material)=>{let owned=radiatorMaterials.get(material);if(!owned){owned=cloneEngineMaterialWithSurface(material);radiatorMaterials.set(material,owned);}return owned;};
    part.material=Array.isArray(part.material)?part.material.map(clone):clone(part.material);
  }});
  return {chain,sprockets,timingDrive,accessoryDrive,coolingPlumbing,radiator,fan,pulley,throttle,partNames,closedHousing,intakeVariant:intakeModel.variant};
}

const chainPosition=new T.Vector3(),chainTangent=new T.Vector3(),chainRotation=new T.Quaternion(),chainMatrix=new T.Matrix4(),unit=new T.Vector3(1,1,1),xAxis=new T.Vector3(1,0,0);
export function animateWorkshopAssembly(a:WorkshopAssembly,angle:number,throttle:number,rpm:number){
  for(const sprocket of a.sprockets)sprocket.part.rotation.x=angle*sprocket.ratio;
  for(const chain of a.chain){
    const offset=angle*chain.pitchRadius/chain.length;
    for(let i=0;i<chain.links.count;i++){
      const u=((i/chain.links.count+offset)%1+1)%1;chain.curve.getPointAt(u,chainPosition);chain.curve.getTangentAt(u,chainTangent);
      chainRotation.setFromAxisAngle(xAxis,Math.atan2(chainTangent.z,chainTangent.y));chainMatrix.compose(chainPosition,chainRotation,unit);chain.links.setMatrixAt(i,chainMatrix);
    }
    chain.links.instanceMatrix.needsUpdate=true;
  }
  animateM54AccessoryDrive(a.accessoryDrive,angle);a.fan.rotation.x=angle*.72;
  // A small idle opening grows to nearly edge-on at full throttle.
  a.throttle.rotation.y=.08+Math.max(0,Math.min(1,throttle))*1.43;
  a.fan.userData.rpm=rpm*.72;
}

/** Authored flywheel with ring teeth, recessed friction face and real bolt
 * pattern. All repeated teeth and bolt heads are merged into two draw calls. */
export function createWorkshopFlywheel(mat:(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial){
  return createM54Flywheel(mat);
}
