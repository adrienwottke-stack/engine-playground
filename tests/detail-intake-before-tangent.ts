import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {assemblyConnectors,engineRoutes} from '../src/engine-3d-layout';
import {CYLINDER_X} from '../src/engine-3d-model';
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
  const tube=(parent:T.Object3D,coords:number[][],radius:number,material:T.Material,name:string,cutaway=false,taper=false)=>{
    const curve=new T.CatmullRomCurve3(coords.map(p=>new T.Vector3(...p)),false,'centripetal'),g=new T.TubeGeometry(curve,64,radius,24,false),positions=g.getAttribute('position'),frames=curve.computeFrenetFrames(64,false);
    for(let i=0;i<=64;i++){
      const t=i/64,center=curve.getPointAt(t);
      // A moulded root spreads into the collector, narrows over the bend and
      // finishes at the fixed head spigot. Keep the shared flow centreline.
      const r=taper?T.MathUtils.lerp(34,23,T.MathUtils.smoothstep(t,0,.46))-(23-17)*T.MathUtils.smoothstep(t,.72,1):radius;
      for(let j=0;j<=24;j++){
        const angle=(cutaway?.65:0)+j/24*(cutaway?TAU-1.3:TAU);
        const p=center.clone().addScaledVector(frames.normals[i],-Math.cos(angle)*r).addScaledVector(frames.binormals[i],Math.sin(angle)*r*.96);positions.setXYZ(i*25+j,p.x,p.y,p.z);
      }
    }
    g.computeVertexNormals();const p=mesh(parent,g,material,[],name);if(cutaway)material.side=T.DoubleSide;return p;
  };

  // Wide, flat moulded collector with three underside resonance pockets, six
  // curved runners and a perimeter joint, rather than a ribbed straight barrel.
  closed.userData.intakeVariant=variant.intake;
  box(closed,592,74,82+extraDepth,h(0,183,-202-extraDepth/2),polymer,13,'Breiter Kunststoffsammler');
  for(const x of [-192,0,192]){const pocket=mesh(closed,new T.SphereGeometry(1,28,16),polymer,h(x,148,-202),'Resonanzkammer-Unterseite');pocket.scale.set(91,23,36);}
  box(cut,592,6,82+extraDepth,h(0,148,-202-extraDepth/2),polymer,2,'Sammlerboden im Schnitt');box(cut,592,66,4,h(0,181,-163),polymer,1,'Sammlerrückwand im Schnitt');
  for(const x of [-295,295])box(cut,4,66,82+extraDepth,h(x,181,-202-extraDepth/2),polymer,1);
  // The horizontal shell seam and moulded braces are deliberately restrained.
  for(const z of [-244-extraDepth,-160])box(details,594,3,2,h(0,178,z),mould,.8,'Verschweißte Gehäusenaht');
  for(const x of [-296,296])box(details,2,3,84+extraDepth,h(x,178,-202-extraDepth/2),mould,.8,'Verschweißte Gehäusenaht');
  for(const x of [-290,290])box(details,7,76,85+extraDepth,h(x,184,-202-extraDepth/2),mould,2);
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
  // Start at the housing's outlet plane, rather than intersecting its barrel.
  const feed=[[t[0],t[1],t[2]+32],n.plenumFeed,h(-200,174,-188)];
  tube(closed,feed,30,polymer,'Unterer Sammleranschluss');
  tube(cut,feed,30,polymer,'Unterer Sammleranschluss im Schnitt',true);

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

