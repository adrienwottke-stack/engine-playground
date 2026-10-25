import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type MaterialFactory = (color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
type Pair = readonly [number,number];
type ContactSide = 1|-1;
export interface AccessoryPulleySpec {id:string;center:Pair;radius:number;side:ContactSide}
type BeltLine = {kind:'line';start:Pair;end:Pair;length:number};
type BeltArc = {kind:'arc';pulley:string;center:Pair;radius:number;startAngle:number;sweep:number;length:number;start:Pair;end:Pair};
export type AccessoryBeltSegment = BeltLine|BeltArc;
const TAU=Math.PI*2;
const mod=(value:number,period:number)=>(value%period+period)%period;

/** Exact oriented common tangents. Negative side means a smooth back-side
 * roller; the inner ribs remain on the same face along the entire belt. */
export function accessoryBeltPath(x:number,pulleys:readonly AccessoryPulleySpec[]){
  if(!Number.isFinite(x)||pulleys.length<2)throw new Error('Ein Riemen braucht eine Ebene und mindestens zwei Scheiben.');
  for(const p of pulleys)if(!p.id||!p.center.every(Number.isFinite)||!(p.radius>0)||!Number.isFinite(p.radius)||Math.abs(p.side)!==1)throw new Error('Ungueltige Riemenscheibe.');
  const tangents=pulleys.map((a,i)=>{
    const b=pulleys[(i+1)%pulleys.length],dy=b.center[0]-a.center[0],dz=b.center[1]-a.center[1],distance=Math.hypot(dy,dz);
    if(distance<=a.radius+b.radius)throw new Error('Ueberlappende Riemenscheiben.');
    const k=(a.side*a.radius-b.side*b.radius)/distance,q=Math.sqrt(1-k*k);
    const ny=k*dy/distance+q*dz/distance,nz=k*dz/distance-q*dy/distance;
    return {start:[a.center[0]+a.side*a.radius*ny,a.center[1]+a.side*a.radius*nz] as Pair,end:[b.center[0]+b.side*b.radius*ny,b.center[1]+b.side*b.radius*nz] as Pair};
  });
  const segments:AccessoryBeltSegment[]=[];
  for(let i=0;i<pulleys.length;i++){
    const p=pulleys[i],start=tangents[mod(i-1,pulleys.length)].end,end=tangents[i].start;
    const startAngle=Math.atan2(start[1]-p.center[1],start[0]-p.center[0]),endAngle=Math.atan2(end[1]-p.center[1],end[0]-p.center[0]);
    const sweep=p.side*mod(p.side*(endAngle-startAngle),TAU);
    segments.push({kind:'arc',pulley:p.id,center:p.center,radius:p.radius,startAngle,sweep,length:Math.abs(sweep)*p.radius,start,end});
    const next=tangents[i].end;
    segments.push({kind:'line',start:end,end:next,length:Math.hypot(next[0]-end[0],next[1]-end[1])});
  }
  const length=segments.reduce((sum,s)=>sum+s.length,0);
  const sample=(distance:number)=>{
    let remaining=mod(distance,length),segment=segments[segments.length-1];
    for(const part of segments){segment=part;if(remaining<=part.length)break;remaining-=part.length;}
    const f=Math.max(0,Math.min(1,remaining/segment.length));
    let y:number,z:number,ty:number,tz:number;
    if(segment.kind==='line'){
      const dy=segment.end[0]-segment.start[0],dz=segment.end[1]-segment.start[1];
      y=segment.start[0]+dy*f;z=segment.start[1]+dz*f;ty=dy/segment.length;tz=dz/segment.length;
    }else{
      const angle=segment.startAngle+segment.sweep*f,direction=Math.sign(segment.sweep);
      y=segment.center[0]+segment.radius*Math.cos(angle);z=segment.center[1]+segment.radius*Math.sin(angle);
      ty=-Math.sin(angle)*direction;tz=Math.cos(angle)*direction;
    }
    return {point:new T.Vector3(x,y,z),tangent:new T.Vector3(0,ty,tz),normal:new T.Vector3(0,tz,-ty)};
  };
  return {x,pulleys,segments,length,sample};
}

/** A closed flat extrusion with six/four longitudinal V ribs, not a tube. */
function beltGeometry(path:ReturnType<typeof accessoryBeltPath>,width:number,thickness:number,ribs:number){
  const half=width/2,section:Pair[]=[[-half,thickness/2],[half,thickness/2],[half,-thickness/2+.28]];
  for(let i=ribs-1;i>=0;i--){section.push([-half+width*(i+.5)/ribs,-thickness/2-.28],[-half+width*i/ribs,-thickness/2+.28]);}
  const steps=Math.ceil(path.length/2.4),positions:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){
    const {point,normal}=path.sample(i/steps*path.length);
    for(const [axial,offset] of section)positions.push(point.x+axial,point.y+normal.y*offset,point.z+normal.z*offset);
  }
  for(let i=0;i<steps;i++)for(let j=0;j<section.length;j++){
    const a=i*section.length+j,b=i*section.length+(j+1)%section.length,c=a+section.length,d=b+section.length;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.userData={section:'flat-longitudinal-v-ribs',width,thickness,ribs,pitchLength:path.length};return geometry;
}

function batchMeshes(group:T.Group){
  const batches=new Map<T.Material,T.Mesh[]>();
  for(const child of group.children)if(child instanceof T.Mesh&&!Array.isArray(child.material)){const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);}
  for(const [material,meshes] of batches){
    if(meshes.length<2)continue;
    const pieces=meshes.map(mesh=>{mesh.updateMatrix();return (mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrix);});
    const geometry=mergeGeometries(pieces);pieces.forEach(piece=>piece.dispose());
    if(!geometry)throw new Error('Nebenaggregat-Geometrie konnte nicht gebuendelt werden.');
    for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
    const combined=new T.Mesh(geometry,material);combined.name=group.name+' · gebuendelte Oberflaeche';group.add(combined);
  }
}

export function createM54AccessoryDrive(pumpCenter:readonly number[],mat:MaterialFactory){
  if(pumpCenter.length!==3||!pumpCenter.every(Number.isFinite))throw new Error('Die Wasserpumpe braucht einen gueltigen Anschluss.');
  const [px,py,pz]=pumpCenter,mainX=px-54,acX=mainX-22;
  const root=new T.Group();root.name='M54 Nebenaggregatetrieb mit getrenntem Klimariemen';
  const mounts=new T.Group();mounts.name='Verschraubte Aggregate und Riemenhalter';root.add(mounts);
  const belts=new T.Group();belts.name='Haupt und Klimariemen mit flachem Rippenquerschnitt';root.add(belts);
  const partNames:string[]=[root.name,mounts.name,belts.name];
  const cast=mat(0x74858c,.45,.67),metal=mat(0xb8c1c2,.76,.36),steel=mat(0x657476,.7,.42),dark=mat(0x202c30,.18,.68),rubber=mat(0x121e23,.02,.94),paint=mat(0x9bafa2,.05,.77);
  const mesh=(geometry:T.BufferGeometry,material:T.Material,parent:T.Object3D,x=0,y=0,z=0)=>{const part=new T.Mesh(geometry,material);part.position.set(x,y,z);parent.add(part);return part;};
  const cylinder=(parent:T.Object3D,r:number,length:number,material:T.Material,x:number,y:number,z:number,segments=32)=>{const geometry=new T.CylinderGeometry(r,r,length,segments);geometry.rotateZ(Math.PI/2);return mesh(geometry,material,parent,x,y,z);};
  const ring=(parent:T.Object3D,r:number,t:number,material:T.Material,x:number,y=0,z=0)=>{const geometry=new T.TorusGeometry(r,t,6,40);geometry.rotateY(Math.PI/2);return mesh(geometry,material,parent,x,y,z);};
  const mountsData:{name:string;from:number[];to:number[]}[]=[];
  const bracket=(name:string,from:number[],to:number[],width=10)=>{
    const a=new T.Vector3(...from as [number,number,number]),b=new T.Vector3(...to as [number,number,number]),delta=b.clone().sub(a);
    const part=mesh(new T.BoxGeometry(width,8,delta.length()),cast,mounts);part.position.copy(a.add(b).multiplyScalar(.5));part.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),delta.normalize());
    part.name=name;mountsData.push({name,from:[...from],to:[...to]});partNames.push(name);
    for(const p of [from,to])cylinder(mounts,3.3,5,steel,p[0]-3,p[1],p[2],6);
  };
  const shaft=(name:string,x0:number,x1:number,y:number,z:number,r=6)=>{const part=cylinder(mounts,r,Math.abs(x1-x0),steel,(x0+x1)/2,y,z);part.name=name;partNames.push(name);return {name,from:[x0,y,z],to:[x1,y,z],radius:r};};
  const pumpShaft=shaft('Wasserpumpenwelle zum festen Pumpenkoerper',px,mainX,py,pz,7);
  shaft('Kurbelwellenstumpf in der Motorfront',px+12,acX,0,0,10);
  const mainSpecs:AccessoryPulleySpec[]=[
    {id:'crank',center:[0,0],radius:35,side:1},
    {id:'power-steering',center:[-50,-126],radius:29,side:1},
    {id:'alternator',center:[56,-139],radius:25,side:1},
    {id:'idler',center:[84,-94],radius:11,side:-1},
    {id:'water-pump',center:[py,pz],radius:24,side:1},
    {id:'main-tensioner',center:[22,-69],radius:13,side:-1},
  ];
  const acSpecs:AccessoryPulleySpec[]=[
    {id:'crank-ac',center:[0,0],radius:32,side:1},
    {id:'compressor',center:[-24,115],radius:25,side:1},
    {id:'ac-tensioner',center:[-36,56],radius:11,side:-1},
  ];
  const wheels:{id:string;part:T.Group;radius:number;ratio:number;belt:'main'|'ac';side:ContactSide}[]=[];
  const wheelNames:Record<string,string>={crank:'Kurbelriemenscheibe und Schwingungsdaempfer','crank-ac':'Zweite Kurbelriemenspur fuer Klima','water-pump':'Riemenrad der Wasserpumpe',alternator:'Lichtmaschinenriemenrad','power-steering':'Servopumpenriemenrad',idler:'Umlenkrolle am Lichtmaschinenhalter','main-tensioner':'Hauptspannerrolle',compressor:'Klimakompressor Magnetkupplung','ac-tensioner':'Klimaspannerrolle'};
  const makeWheel=(spec:AccessoryPulleySpec,x:number,width:number,ribs:number,belt:'main'|'ac',driverRadius:number)=>{
    const wheel=new T.Group();wheel.name=wheelNames[spec.id]??spec.id;
    wheel.position.set(x,...spec.center);root.add(wheel);partNames.push(wheel.name);
    const pitch=width/ribs,profile=[new T.Vector2(0,-width/2-1),new T.Vector2(spec.radius+.65,-width/2-1),new T.Vector2(spec.radius-.8,-width/2)];
    if(spec.side===1)for(let i=0;i<ribs;i++)profile.push(new T.Vector2(spec.radius-1.35,-width/2+pitch*(i+.5)),new T.Vector2(spec.radius-.8,-width/2+pitch*(i+1)));
    else profile.push(new T.Vector2(spec.radius-.8,width/2));
    profile.push(new T.Vector2(spec.radius+.65,width/2+1),new T.Vector2(0,width/2+1));
    const rim=new T.LatheGeometry(profile,40);rim.rotateZ(Math.PI/2);mesh(rim,spec.side===1?dark:steel,wheel);
    const face=spec.id==='water-pump'||spec.id==='power-steering'?dark:spec.id==='crank'?steel:metal;
    cylinder(wheel,spec.radius*.68,2,face,-width/2-1.2,0,0);
    cylinder(wheel,Math.max(4,spec.radius*.22),width+4,steel,0,0,0,6);
    if(spec.side===1){
      const count=spec.id.startsWith('crank')?6:spec.id==='water-pump'?4:3;
      for(let i=0;i<count;i++){const a=i/count*TAU;cylinder(wheel,2,3,steel,-width/2-2,Math.cos(a)*spec.radius*.47,Math.sin(a)*spec.radius*.47,6);}
      ring(wheel,spec.radius*.78,.6,steel,-width/2-1.6);
    }else cylinder(wheel,4,3,dark,-width/2-2,0,0);
    if(spec.id==='crank'){
      cylinder(wheel,35.5,14,dark,width/2+8,0,0);ring(wheel,32,2,rubber,width/2+16);ring(wheel,29,1,steel,width/2+18);
    }
    if(spec.id==='alternator')for(let i=0;i<8;i++){
      const a=i/8*TAU,blade=mesh(new T.BoxGeometry(3,2,12),steel,wheel,width/2+3,Math.cos(a)*15,Math.sin(a)*15);blade.rotation.x=a+.35;
    }
    batchMeshes(wheel);wheel.userData.accessoryPulley={id:spec.id,pitchRadius:spec.radius,belt,side:spec.side};
    wheels.push({id:spec.id,part:wheel,radius:spec.radius,ratio:spec.side*driverRadius/spec.radius,belt,side:spec.side});return wheel;
  };
  for(const spec of mainSpecs)makeWheel(spec,mainX,15.6,6,'main',35);
  for(const spec of acSpecs)makeWheel(spec,acX,10.4,4,'ac',32);

  // Stationary housings, short shafts and paired supports end in the motor front.
  const alternatorX=mainX+34;
  cylinder(mounts,29,48,cast,alternatorX,56,-139);cylinder(mounts,24,53,dark,alternatorX,56,-139);
  for(const x of [-20,20])ring(mounts,29,2,metal,alternatorX+x,56,-139);
  for(let i=0;i<12;i++){const a=i/12*TAU,fin=mesh(new T.BoxGeometry(37,3,5),cast,mounts,alternatorX,56+Math.cos(a)*28,-139+Math.sin(a)*28);fin.rotation.x=a;}
  shaft('Kurze Lichtmaschinenwelle',alternatorX-24,mainX,56,-139,5);
  bracket('Oberer Lichtmaschinenhalter',[px+8,76,-66],[alternatorX+17,76,-120],12);
  bracket('Unterer Lichtmaschinenhalter',[px+8,26,-63],[alternatorX+17,36,-120],12);
  cylinder(mounts,21,40,cast,mainX+33,-50,-126);shaft('Servopumpenwelle',mainX+15,mainX,-50,-126,6);
  bracket('Servopumpentraeger oben',[px+8,-24,-67],[mainX+42,-34,-111],12);
  bracket('Servopumpentraeger unten',[px+8,-72,-67],[mainX+42,-65,-111],12);
  cylinder(mounts,29,62,cast,acX+46,-24,115);ring(mounts,28,2,metal,acX+18,-24,115);ring(mounts,28,2,metal,acX+73,-24,115);
  for(const y of [-45,-3])bracket('Klimakompressor Halteohr '+y,[px+8,y,64],[acX+66,y,99],12);
  shaft('Klimakompressorwelle',acX+15,acX,-24,115,7);
  const rollers=[{name:'Umlenkrolle',y:84,z:-94,x:mainX,anchor:[px+8,84,-57]},{name:'Hauptspanner',y:22,z:-69,x:mainX,anchor:[px+8,48,-57]},{name:'Klimaspanner',y:-36,z:56,x:acX,anchor:[px+8,-10,45]}];
  for(const roller of rollers){
    const rear=roller.x+24;
    cylinder(mounts,11,13,cast,rear,roller.y,roller.z);
    shaft(roller.name+' Lagerachse',rear,roller.x,roller.y,roller.z,5);
    bracket(roller.name+' festes Gusshalteglied',roller.anchor,[rear,roller.y,roller.z],11);
    if(roller.name!=='Umlenkrolle')cylinder(mounts,9,10,dark,rear+8,roller.anchor[1],roller.anchor[2]);
  }

  const beltData:{id:'main'|'ac';path:ReturnType<typeof accessoryBeltPath>;mesh:T.Mesh;width:number;thickness:number;ribs:number;driverRadius:number;marks:{part:T.Mesh;offset:number}[]}[]=[];
  for(const spec of [{id:'main' as const,x:mainX,width:15.6,ribs:6,pulleys:mainSpecs,driverRadius:35},{id:'ac' as const,x:acX,width:10.4,ribs:4,pulleys:acSpecs,driverRadius:32}]){
    const path=accessoryBeltPath(spec.x,spec.pulleys),thickness=1.5;
    const band=mesh(beltGeometry(path,spec.width,thickness,spec.ribs),rubber,belts);band.name=spec.id==='main'?'Sechsrippiger Hauptantriebsriemen':'Separater vierrippiger Klimariemen';partNames.push(band.name);
    const marks=[0,4.5,9].map(offset=>{const part=mesh(new T.BoxGeometry(spec.width*.6,.14,2),paint,root);part.name=spec.id+' dezente wandernde Riemenmarke';return {part,offset};});
    beltData.push({id:spec.id,path,mesh:band,width:spec.width,thickness,ribs:spec.ribs,driverRadius:spec.driverRadius,marks});
  }
  // The caller may batch these groups only. Rotating wheels and the travelling
  // marks stay separate even though all motion uses the same crank angle.
  batchMeshes(mounts);
  const drive={root,staticGroups:[mounts,belts],pulley:wheels.find(w=>w.id==='water-pump')!.part,partNames,wheels,belts:beltData,pumpShaft,mounts:mountsData,planes:{main:mainX,ac:acX},reference:'M52/M54 topology; authored compact dimensions, not OEM pulley ratios'};
  animateM54AccessoryDrive(drive,0);return drive;
}

/** No time integration: one source crank angle also supports pauses, reverse
 * inspection and seeking without drift or an independently running belt. */
export function animateM54AccessoryDrive(drive:ReturnType<typeof createM54AccessoryDrive>,angle:number):void{
  if(!Number.isFinite(angle))throw new Error('Ungueltiger Kurbelwinkel fuer den Nebenaggregatetrieb.');
  for(const wheel of drive.wheels)wheel.part.rotation.x=angle*wheel.ratio;
  for(const belt of drive.belts)for(const mark of belt.marks){
    const {point,normal}=belt.path.sample(angle*belt.driverRadius+mark.offset);
    mark.part.position.copy(point).addScaledVector(normal,belt.thickness/2+.09);
    mark.part.rotation.x=Math.atan2(normal.z,normal.y);
  }
}
