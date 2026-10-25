import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {assemblyConnectors,engineRoutes} from './engine-3d-layout';
import {CYLINDER_X} from './engine-3d-model';
import type {TuningSelection} from '../native/tuning-settings.mjs';

export type M54IntakeSelection=Partial<Pick<TuningSelection,'intake'|'throttleBody'|'runners'|'filter'>>;
/** Display proportions only; the native tuning contract owns physical effects. */
export function m54IntakeVariant(selection:M54IntakeSelection={}){
  const intake=selection.intake==='sport'||selection.intake==='race'?selection.intake:'standard';
  return {intake,extraDepth:intake==='sport'?16:intake==='race'?30:0,
    unsupportedKeys:(['throttleBody','runners','filter'] as const).filter(key=>selection[key]&&selection[key]!=='standard')};
}

type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
const TAU=Math.PI*2,Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1);

/** Photo-referenced M54B30 intake, BMW 11617525753 / ST036. Dimensions are
 * authored display proportions. No native DISA state or resonance is invented. */
export function createM54Intake(headOffset:number,mat:MaterialFactory,selection:M54IntakeSelection={}){
  const variant=m54IntakeVariant(selection),extraDepth=variant.extraDepth;
  const n=assemblyConnectors(headOffset),closed=new T.Group(),cut=new T.Group(),details=new T.Group(),throttle=new T.Group(),disaFlap=new T.Group();
  closed.name='M54B30 geschlossene Ansauggehaeuse';cut.name='M54B30 Ansaugung im Schnitt';details.name='M54B30 DISA Ansaugbruecke Filter Drosselklappe';
  throttle.name='Animierte Drosselklappe';disaFlap.name='DISA Prinzipklappe ohne natives Stellsignal';disaFlap.userData.illustrative=true;
  const polymer=mat(0x1c2226,.06,.88),mould=mat(0x2c3438,.07,.83),rubber=mat(0x181e21,.02,.95),metal=mat(0x939fa4,.66,.4),gasket=mat(0x79513b,.05,.85),filter=mat(0xb2a788,.02,.97),blade=mat(0xa99b70,.55,.48);
  const mesh=(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,position:number[]=[],name='')=>{const part=new T.Mesh(g,m);if(position.length)part.position.fromArray(position);part.name=name;parent.add(part);return part;};
  const box=(parent:T.Object3D,w:number,h:number,d:number,position:number[],material=polymer,radius=3,name='')=>mesh(parent,new RoundedBoxGeometry(w,h,d,3,radius),material,position,name);
  const cylinder=(parent:T.Object3D,r:number,h:number,position:number[],material:T.Material,axis: 'x'|'y'|'z'='y',open=false,segments=32,name='')=>{const p=mesh(parent,new T.CylinderGeometry(r,r,h,segments,1,open),material,position,name);if(axis==='x')p.rotation.z=Math.PI/2;if(axis==='z')p.rotation.x=Math.PI/2;return p;};
  const ring=(parent:T.Object3D,r:number,t:number,position:number[],material:T.Material,axis:'x'|'y'|'z'='x')=>{const p=mesh(parent,new T.TorusGeometry(r,t,8,40),material,position);if(axis==='x')p.rotation.y=Math.PI/2;if(axis==='y')p.rotation.x=Math.PI/2;return p;};
  const h=(x:number,y:number,z:number)=>[x,y+headOffset,z];
  const tube=(parent:T.Object3D,coords:number[][]|T.Curve<T.Vector3>,radius:number,material:T.Material,name:string,cutaway=false,taper=false,radialAspect=.96,axialLoft=false)=>{
    const curve=Array.isArray(coords)?new T.CatmullRomCurve3(coords.map(p=>new T.Vector3(...p)),false,'centripetal'):coords,g=new T.TubeGeometry(curve,64,radius,24,false),positions=g.getAttribute('position'),frames=curve.computeFrenetFrames(64,false);
    for(let i=0;i<=64;i++){
      const t=i/64,center=curve.getPointAt(t);
      // A moulded root spreads into the collector, narrows over the bend and
      // finishes at the fixed head spigot. Keep the shared flow centreline.
      const r=axialLoft?T.MathUtils.lerp(radius,21,T.MathUtils.smoothstep(t,0,1)):taper?T.MathUtils.lerp(34,23,T.MathUtils.smoothstep(t,0,.46))-(23-17)*T.MathUtils.smoothstep(t,.72,1):radius;
      for(let j=0;j<=24;j++){
        const angle=(cutaway?.65:0)+j/24*(cutaway?TAU-1.3:TAU);
        const p=axialLoft?center.clone().add(new T.Vector3(-Math.cos(angle)*r,Math.sin(angle)*r,0)):center.clone().addScaledVector(frames.normals[i],-Math.cos(angle)*r).addScaledVector(frames.binormals[i],Math.sin(angle)*r*radialAspect);positions.setXYZ(i*25+j,p.x,p.y,p.z);
      }
    }
    g.computeVertexNormals();const p=mesh(parent,g,material,[],name);if(cutaway)material.side=T.DoubleSide;return p;
  };

  // One moulded shell: broader chamber bellies alternate with slimmer bridges;
  // its rounded ends and lower lobes belong to the main surface, not added balls.
  closed.userData.intakeVariant=variant.intake;
  // x, vertical centre, half-height, front, back. Model proportions from photos;
  // these are not volume calculations or a dimensioned BMW surface reconstruction.
  const profiles=[[-296,178,10,-218,-190],[-290,179,25,-231,-174],[-274,181,34,-237,-164],[-240,179,41,-239,-161],[-192,174,46,-240,-161],[-144,178,42,-242,-161],[-96,181,39,-243,-161],[-43,181,39,-243,-161],[0,175,45,-243,-161],[48,178,42,-243,-161],[96,181,39,-242,-161],[144,177,43,-240,-161],[192,173,47,-239,-161],[240,177,42,-237,-161],[274,179,34,-232,-164],[290,179,24,-226,-174],[296,178,10,-214,-190]];
  const profile=(x:number)=>{
    const i=Math.min(profiles.length-2,Math.max(0,profiles.findIndex((p,j)=>j<profiles.length-1&&x>=p[0]&&x<=profiles[j+1][0]))),a=profiles[i],b=profiles[i+1],u=T.MathUtils.smoothstep(x,a[0],b[0]);
    return [x,...a.slice(1).map((v,j)=>T.MathUtils.lerp(v,b[j+1],u))];
  };
  const shellPoint=(x:number,angle:number,inset=0)=>{
    const [,cy,hy,front,back]=profile(x),cz=(front+back-extraDepth)/2,hz=(back-front+extraDepth)/2;
    const rounded=(v:number)=>Math.abs(v)<1e-12?0:Math.sign(v)*Math.pow(Math.abs(v),.25);
    return new T.Vector3(x,cy+headOffset+(hy-inset)*rounded(Math.cos(angle)),cz+(hz-inset)*rounded(Math.sin(angle)));
  };
  const collectorSurface=(section=false)=>{
    const g=new T.BufferGeometry(),vertices:number[]=[],indices:number[]=[],longitudinal=96,radial=48,start=section?Math.PI/2:0,sweep=section?Math.PI:TAU,stride=radial+1,layer=(longitudinal+1)*stride;
    // Real 3-unit walls; opening the same shell exposes the authored underside.
    for(const inset of [0,3])for(let i=0;i<=longitudinal;i++)for(let j=0;j<=radial;j++){
      const p=shellPoint(-296+i/longitudinal*592,start+j/radial*sweep,inset);
      if(inset&&i===0)p.x+=3;if(inset&&i===longitudinal)p.x-=3;vertices.push(...p.toArray());
    }
    const quad=(a:number,b:number,c:number,d:number,reverse=false)=>indices.push(...(reverse?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
    for(let i=0;i<longitudinal;i++)for(let j=0;j<radial;j++){
      const a=i*stride+j,b=a+stride;quad(a,b,a+1,b+1,true);quad(a+layer,b+layer,a+1+layer,b+1+layer);
    }
    // Closed end walls: the inner end face is recessed by the wall thickness,
    // rather than leaving the central opening of an annular end rim exposed.
    for(const i of [0,longitudinal])for(const side of [0,1]){
      const x=i===0?-296:296,[,cy,,front,back]=profile(x),center=vertices.length/3;
      vertices.push(x+(side?(i===0?3:-3):0),cy+headOffset,(front+back-extraDepth)/2);
      for(let j=0;j<radial;j++){const a=side*layer+i*stride+j;indices.push(...((i===0)!==Boolean(side)?[center,a+1,a]:[center,a,a+1]));}
    }
    if(section)for(const j of [0,radial])for(let i=0;i<longitudinal;i++){const a=i*stride+j,b=a+stride;quad(a,b,a+layer,b+layer,j===radial);}
    g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    // Match Three's primitive attribute contract for the central material batch.
    const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]+296)/592,(vertices[i+1]-125-headOffset)/100);
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    if(!section){const normals=g.getAttribute('normal');for(const side of [0,1])for(let i=0;i<=longitudinal;i++){const a=side*layer+i*stride,b=a+radial,n=new T.Vector3().fromBufferAttribute(normals,a).add(new T.Vector3().fromBufferAttribute(normals,b)).normalize();normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);}}
    return g;
  };
  const shell=mesh(closed,collectorSurface(),polymer,[],'Breiter Kunststoffsammler');shell.userData.wallThickness=3;
  mesh(cut,collectorSurface(true),polymer,[],'Sammlerboden im Schnitt');
  // Parting line follows the shoulder contour around both rounded end faces.
  const seamAngle=Math.acos(-.43),seamPoints:T.Vector3[]=[];
  for(let i=0;i<=80;i++)seamPoints.push(shellPoint(-296+i/80*592,seamAngle));
  for(let i=1;i<=12;i++)seamPoints.push(shellPoint(296,T.MathUtils.lerp(seamAngle,TAU-seamAngle,i/12)));
  for(let i=1;i<=80;i++)seamPoints.push(shellPoint(296-i/80*592,TAU-seamAngle));
  for(let i=1;i<12;i++)seamPoints.push(shellPoint(-296,T.MathUtils.lerp(TAU-seamAngle,seamAngle,i/12)));
  tube(details,new T.CatmullRomCurve3(seamPoints,true,'centripetal'),1.25,mould,'Umlaufende geformte Schalenteilung');
  for(const x of CYLINDER_X){
    const route=engineRoutes(headOffset).find(r=>r.medium==='air'&&r.cylinder===CYLINDER_X.indexOf(x)+1&&r.branch==='runner')!;
    tube(closed,route.coords.slice(0,-1),22,polymer,`Geformtes Saugrohr Zylinder ${route.cylinder}`,false,true);
    tube(cut,route.coords.slice(0,-1),22,polymer,`Geöffnetes Saugrohr Zylinder ${route.cylinder}`,true,true);
    // Oval, open collars meet the flange instead of leaving a round pipe
    // apparently pressed onto a separate rectangular tile.
    const collar=new T.Shape();collar.absellipse(0,0,20,21,0,TAU,false);
    const aperture=new T.Path();aperture.absellipse(0,0,15.5,17,0,TAU,true);collar.holes.push(aperture);
    mesh(details,new T.ExtrudeGeometry(collar,{depth:15,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:3,curveSegments:32}),polymer,h(x,226,-100),'Ovaler Kopfanschlusskragen');
    ring(details,17.3,1.3,h(x,226,-81),gasket,'z');
    const face=new T.Shape();
    face.moveTo(-21,-20);face.lineTo(21,-20);face.lineTo(21,20);face.lineTo(-21,20);face.closePath();
    const bore=new T.Path();bore.absellipse(0,0,15.5,17,0,TAU,true);face.holes.push(bore);
    mesh(details,new T.ExtrudeGeometry(face,{depth:5,bevelEnabled:false,curveSegments:24}),polymer,h(x,226,-85),'Offener Saugrohrflansch');
    box(details,12,18,11,h(x+30,244,-85),polymer,4,'Angegossene Befestigungsnase');
    cylinder(details,6,5,h(x+30,246,-91),mould,'z',false,24,'Kopfanschluss Schraubensitz');
    cylinder(details,3.2,6,h(x+30,246,-94),metal,'z',false,12);
  }
  box(details,572,8,10,h(0,252,-85),polymer,3,'Durchgehende Kopf-Montageschiene');

  // One side-mounted vacuum DISA unit, not the N52's two electric actuators.
  const disa=new T.Group();disa.name='M54B30 DISA Resonanzklappe';closed.add(disa);
  disa.position.z=-extraDepth;
  box(disa,86,67,9,h(-43,184,-241),polymer,12,'Angeformter DISA Montagesockel');
  box(disa,77,61,7,h(-43,184,-247),polymer,11,'DISA Flanschplatte');
  cylinder(disa,29,7,h(-43,184,-248),polymer,'z',false,40,'DISA runder Dichtsitz');
  cylinder(disa,22,22,h(-91,184,-263),rubber,'z',false,40,'Seitlich versetzte Unterdruckdose');
  cylinder(disa,19,3,h(-91,184,-276),mould,'z',false,40);
  cylinder(disa,11,23,h(-75,165,-261),polymer,'z',false,24,'DISA Magnetventil');
  box(disa,43,36,18,h(-3,185,-258),polymer,5,'DISA Anschlussgehäuse');
  box(disa,15,16,13,h(20,185,-264),rubber,2,'DISA Steckanschluss');
  cylinder(disa,2,39,h(-69,184,-263),mould,'x',false,12,'DISA Betätigungsstange');
  for(const [dx,dy] of [[-33,-20],[33,20]])cylinder(disa,3,8,h(-43+dx,184+dy,-253),metal,'z',false,12);
  disaFlap.position.fromArray(h(-43,184,-202-extraDepth/2));cut.add(disaFlap);
  box(disaFlap,3,43,57+extraDepth,[0,0,0],polymer,1,'DISA Klappenblatt');cylinder(disaFlap,2,73+extraDepth,[0,0,0],metal,'z');
  for(const z of [-234-extraDepth,-170])box(cut,3,58,9,h(-43,184,z),mould,1,'Resonanzkanal-Rahmen');
  for(const y of [160,208])box(cut,3,5,64+extraDepth,h(-43,y,-202-extraDepth/2),mould,1,'DISA Einsteckrahmen');
  ring(cut,28,1.2,h(-43,184,-246-extraDepth),gasket,'z');

  // Electronic throttle below the collector. Its flap keeps the existing
  // public moving group and is driven only by the renderer's real throttle.
  const t=n.throttle;throttle.position.fromArray(t);
  mesh(throttle,new T.CircleGeometry(27,48),blade,[], 'Drosselklappenblatt').material.side=T.DoubleSide;
  cylinder(throttle,1.8,61,[0,0,0],metal,'y');
  cylinder(details,31,64,t,metal,'z',true,48,'Elektronisches Drosselgehäuse');
  ring(details,31,1.7,[t[0],t[1],t[2]-31],metal,'z');ring(details,31,1.5,[t[0],t[1],t[2]+31],metal,'z');
  box(details,34,42,46,[t[0]-42,t[1],t[2]],rubber,6,'EDK Stellmotor');
  for(const dx of [-26,26])for(const dy of [-26,26])cylinder(details,3.2,8,[t[0]+dx,t[1]+dy,t[2]+23],metal,'z',false,12,'Drosselflansch Schraubenkopf');
  const throttleFlange=new T.Shape();throttleFlange.moveTo(-37,-35);throttleFlange.lineTo(37,-35);throttleFlange.lineTo(37,35);throttleFlange.lineTo(-37,35);throttleFlange.closePath();
  const throttleBore=new T.Path();throttleBore.absarc(0,0,30,0,TAU,true);throttleFlange.holes.push(throttleBore);
  mesh(details,new T.ExtrudeGeometry(throttleFlange,{depth:7,bevelEnabled:true,bevelSize:2,bevelThickness:1,bevelSegments:3,curveSegments:40}),polymer,[t[0],t[1],t[2]+25],'Offener Drossel-Montageflansch');
  // The outlet is already under the collector belly. Loft a short moulded
  // shoulder into that shell instead of folding a full-diameter tube through
  // an impossibly tight bend. Parallel XY sections and monotone Z avoid folds;
  // the first centreline tangent and mating circle match the throttle's +Z.
  const outlet=new T.Vector3(t[0],t[1],t[2]+32);
  const land=outlet.clone().addScaledVector(Z,2),feed=new T.CurvePath<T.Vector3>();
  feed.add(new T.LineCurve3(outlet,land));
  feed.add(new T.CubicBezierCurve3(land,land.clone().addScaledVector(Z,6),new T.Vector3(t[0],t[1]+30,t[2]+44),new T.Vector3(t[0],t[1]+30,t[2]+48)));
  tube(closed,feed,30,polymer,'Unterer Sammleranschluss',false,false,1,true);
  tube(cut,feed,30,polymer,'Unterer Sammleranschluss im Schnitt',true,false,1,true);

  // Rectangular panel-filter housing and MAF, followed by a genuinely bent
  // rubber boot. Vehicle packaging is a plausible workshop arrangement.
  for(const parent of [closed,cut]){
    box(parent,144,5,134,h(-462,53,-295),polymer,2,'Luftfilterkasten Boden');
    box(parent,144,124,5,h(-462,115,-230),polymer,2,'Luftfilterkasten Rückwand');
  }
  box(closed,145,8,136,h(-462,176,-295),polymer,3,'Luftfilterdeckel');box(closed,144,124,5,h(-462,115,-360),polymer,2,'Luftfilterkasten Außenwand');
  for(const [x,portY] of [[-534,83],[-390,143]]){
    const face=new T.Shape();face.moveTo(-63,-67);face.lineTo(63,-67);face.lineTo(63,67);face.lineTo(-63,67);face.closePath();
    const bore=new T.Path();bore.absarc(portY-115,0,29,0,TAU,true);face.holes.push(bore);
    const g=new T.ExtrudeGeometry(face,{depth:4,bevelEnabled:false,curveSegments:28});g.applyMatrix4(new T.Matrix4().set(0,0,1,x,1,0,0,115+headOffset,0,1,0,-295,0,0,0,1));mesh(details,g,polymer,[],'Gelochter Luftfilterkasten-Anschluss');
  }
  cylinder(details,29,19,h(-544,83,-295),polymer,'x',true);ring(details,29,1.2,n.intakeMouth,mould);
  for(const z of [-353,-237])box(details,147,3,3,h(-462,160,z),mould,1,'Luftfilterkasten Deckelnaht');
  for(const x of [-505,-419])box(details,10,19,5,h(x,161,-365),metal,1,'Filterkasten Halteklammer');
  for(let x=-524;x<=-400;x+=7)box(cut,3,15,116,h(x,116,-295),filter,.6,'Papierfilter-Lamelle');
  cylinder(details,29,40,n.maf,mould,'x',true,40,'Heißfilm-Luftmassenmesser');box(details,25,19,21,[n.maf[0],n.maf[1]+33,n.maf[2]],rubber,3,'LMM Elektronik');
  // Separate the rigid MAF and the rubber bellows. The old boot passed right
  // through the MAF, covering its housing and the filter outlet connection.
  cylinder(details,29,18,[n.airboxOutlet[0]+11,n.maf[1],n.maf[2]],polymer,'x',true,40,'Luftfilter-Auslassstutzen');
  cylinder(details,29,10,[n.maf[0]-25,n.maf[1],n.maf[2]],rubber,'x',true,40,'LMM Einlassmuffe');
  const boot=[n.airboxOutlet,n.maf,...n.intakeBoot];const bellows=tube(details,boot,28,rubber,'Gebogener Ansaugfaltenbalg');
  for(const x of [n.maf[0]-21,n.maf[0]+23])ring(details,29,1.2,[x,n.maf[1],n.maf[2]],metal,'x');
  const bootCurve=new T.CatmullRomCurve3(boot.map(p=>new T.Vector3(...p)),false,'centripetal');
  const firstBootRing=Array.from({length:65},(_,i)=>i).find(i=>bootCurve.getPointAt(i/64).x>=n.maf[0]+16)!;
  // Trim indices (not only drawRange) so the assembly's geometry merge keeps
  // the exposed rigid MAF. Retain the same sampled centreline and bend frames.
  const bootIndex=bellows.geometry.getIndex()!;
  bellows.geometry.setIndex(Array.from(bootIndex.array.slice(firstBootRing*24*6)));
  bellows.userData.firstBootRing=firstBootRing;
  cylinder(details,29,8,[n.maf[0]+20,n.maf[1],n.maf[2]],rubber,'x',true,40,'LMM Auslassmuffe');
  for(let i=0;i<15;i++){const u=.35+i/14*.56,p=bootCurve.getPointAt(u),tangent=bootCurve.getTangentAt(u);const rib=ring(details,29,1.5,p.toArray(),rubber,'z');rib.quaternion.setFromUnitVectors(Z,tangent);}
  for(const u of [.99]){const p=bootCurve.getPointAt(u),tangent=bootCurve.getTangentAt(u),clamp=ring(details,29,1.2,p.toArray(),metal,'z');clamp.quaternion.setFromUnitVectors(Z,tangent);}
  const idle=[h(-233,147,-279),h(-219,172,-267),h(-198,174,-245)];tube(details,idle,8,rubber,'Abzweig zur Leerlaufluft');
  return {closed,cut,details,throttle,disaFlap,disa,variant,groups:[closed,cut,details,disa]};
}
