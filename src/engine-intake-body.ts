import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CYLINDER_X} from './engine-3d-model';
import {m54IntakeNodes,m54IntakePassages,m54IntakeRoutes} from './engine-intake-layout';
import {intakePassageSkin,joinIntakeSkins} from './engine-intake-geometry';
import type {TuningSelection} from '../native/tuning-settings.mjs';

export type M54IntakeSelection=Partial<Pick<TuningSelection,'intake'|'throttleBody'|'runners'|'filter'>>;
export function m54IntakeVariant(selection:M54IntakeSelection={}){
  const intake=selection.intake==='sport'||selection.intake==='race'?selection.intake:'standard';
  return{intake,extraDepth:intake==='sport'?16:intake==='race'?30:0,unsupportedKeys:(['throttleBody','runners','filter'] as const).filter(key=>selection[key]&&selection[key]!=='standard')};
}
type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
const TAU=Math.PI*2,Z=new T.Vector3(0,0,1);

/** Photo-informed 11617525753 reconstruction. Hidden surfaces and proportions
 * are authored; connectivity follows BMW ST036, not an OEM CAD measurement. */
export function createM54Intake(headOffset:number,mat:MaterialFactory,selection:M54IntakeSelection={}){
  const variant=m54IntakeVariant(selection),n=m54IntakeNodes(headOffset),closed=new T.Group(),cut=new T.Group(),details=new T.Group(),throttle=new T.Group(),disa=new T.Group(),disaFlap=new T.Group();
  closed.name='M54B30 geformte Ansaugbruecke R7';cut.name='M54B30 innere Dreiergruppen R7';details.name='M54B30 Filter LMM Drossel und Portleiste';disa.name='M54B30 DISA Stellglied';throttle.name='Animierte Drosselklappe';disaFlap.name='DISA Kopplung zwischen Dreiergruppen';disaFlap.userData.illustrative=true;
  const polymer=mat(0x1c2226,.06,.88),mould=mat(0x2c3438,.07,.83),rubber=mat(0x181e21,.02,.95),metal=mat(0x939fa4,.66,.4),gasket=mat(0x79513b,.05,.85),paper=mat(0xb2a788,.02,.97),blade=mat(0xa99b70,.55,.48);
  for(const m of [polymer,mould])m.side=T.DoubleSide;
  const h=(x:number,y:number,z:number)=>[x,y+headOffset,z];
  const mesh=(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,p:number[]=[],name='')=>{const a=new T.Mesh(g,m);if(p.length)a.position.fromArray(p);a.name=name;parent.add(a);return a;};
  const box=(p:T.Object3D,w:number,height:number,d:number,at:number[],m:T.Material=polymer,r=3,name='')=>mesh(p,new RoundedBoxGeometry(w,height,d,3,r),m,at,name);
  const cylinder=(p:T.Object3D,r:number,length:number,at:number[],m:T.Material,axis:'x'|'y'|'z'='y',open=false,name='')=>{const a=mesh(p,new T.CylinderGeometry(r,r,length,32,1,open),m,at,name);if(axis==='x')a.rotation.z=Math.PI/2;if(axis==='z')a.rotation.x=Math.PI/2;return a;};
  const ring=(p:T.Object3D,r:number,wall:number,at:number[],m:T.Material,axis:'x'|'y'|'z'='z',name='')=>{const a=mesh(p,new T.TorusGeometry(r,wall,8,40),m,at,name);if(axis==='x')a.rotation.y=Math.PI/2;if(axis==='y')a.rotation.x=Math.PI/2;return a;};
  const tube=(p:T.Object3D,coords:number[][],r:number,m:T.Material,name:string)=>mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(coords.map(v=>new T.Vector3(...v)),false,'centripetal'),64,r,24,false),m,[],name);
  const plate=(p:T.Object3D,w:number,height:number,depth:number,bore:T.Path,at:number[],m:T.Material,name:string)=>{const shape=new T.Shape();shape.moveTo(-w/2+5,-height/2);shape.lineTo(w/2-5,-height/2);shape.quadraticCurveTo(w/2,-height/2,w/2,-height/2+5);shape.lineTo(w/2,height/2-5);shape.quadraticCurveTo(w/2,height/2,w/2-5,height/2);shape.lineTo(-w/2+5,height/2);shape.quadraticCurveTo(-w/2,height/2,-w/2,height/2-5);shape.lineTo(-w/2,-height/2+5);shape.quadraticCurveTo(-w/2,-height/2,-w/2+5,-height/2);shape.holes.push(bore);return mesh(p,new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24}),m,at,name);};

  const skins=m54IntakePassages(headOffset,variant.extraDepth).map(intakePassageSkin);joinIntakeSkins(skins);
  const cover=intakePassageSkin({id:'housing',coords:[-296,-276,-240,-144,0,144,240,276,296].map(x=>h(x,160,-260-variant.extraDepth/2)),width:40,height:72+variant.extraDepth/2,section:'moulded',axis:'x',capStart:true,capEnd:true});
  // The outer cover is structural. It is opened at all real passages, but is
  // never used as one large air cavity that would erase the two inner groups.
  joinIntakeSkins([cover,...skins],new Set(['housing']));mesh(closed,cover.closed,polymer,[],'Zusammenhaengende geformte Aussenschale');mesh(cut,cover.cut,polymer,[],'Aussenschale im Schnitt');
  const names:Record<string,string>={resonance:'Aeussere Resonanzverteilung',inlet:'Geformter Drosseleintritt',coupling:'DISA Verbindungskanal','gallery-0':'Hauptsammler Zylinder 1–3','gallery-1':'Hauptsammler Zylinder 4–6','resonance-feed-0':'Resonanzzufuehrung 1–3','resonance-feed-1':'Resonanzzufuehrung 4–6'};
  for(const skin of skins){const name=skin.spec.cylinder?`Geformtes Saugrohr Zylinder ${skin.spec.cylinder}`:names[skin.spec.id];mesh(closed,skin.closed,polymer,[],name);mesh(cut,skin.cut,polymer,[],name+' im Schnitt');}
  closed.userData.intakeVariant=variant.intake;
  // Structural webs stay outside the passages; they are not solid plenum fill.
  for(const side of [-1,1])box(closed,236,3,16,h(side*147,171,-261),polymer,1,'Geformte Gehaeuseschulter');
  for(const parent of [closed,cut])for(const side of [-1,1])box(parent,240,3,12,h(side*147,112,-261),polymer,1,'Untere Formtrennkante');
  const seam=[h(-282,128,-307-variant.extraDepth),h(-264,125,-325-variant.extraDepth),h(-144,122,-327-variant.extraDepth),h(0,122,-327-variant.extraDepth),h(144,122,-327-variant.extraDepth),h(264,125,-325-variant.extraDepth),h(283,133,-304-variant.extraDepth/2)];tube(details,seam,1.2,mould,'Schalenteilung entlang Resonanzgehaeuse');

  for(const x of CYLINDER_X){
    const port=new T.Path();port.moveTo(-31,-15);port.lineTo(31,-15);port.lineTo(31,5);port.quadraticCurveTo(31,18,18,18);port.lineTo(-18,18);port.quadraticCurveTo(-31,18,-31,5);port.closePath();
    plate(details,86,48,7,port,h(x,226,-86),polymer,'Offener Saugrohrflansch');
    plate(details,78,48,8,port.clone(),h(x,226,-94),polymer,'Abgeflachter Kopfanschlusskragen');
    for(const dx of [-43,43])cylinder(details,5,7,h(x+dx,227,-86),metal,'z');
  }
  box(details,596,8,9,h(0,253,-83),polymer,2,'Gemeinsame Befestigungsleiste');

  // The carrier's X tilt survives the assembly's real throttle.rotation.y.
  const t=n.throttle,tilt=-Math.atan2(n.throttleAxis[1],n.throttleAxis[2]),throat=new T.Group();throat.position.fromArray(t);throat.rotation.x=tilt;throat.name='EDK im mittigen Unterseitenflansch';details.add(throat);
  cylinder(throat,34,48,[0,0,0],metal,'z',true,'Elektronisches Drosselgehaeuse');ring(throat,34,1.6,[0,0,-24],metal);ring(throat,34,1.6,[0,0,24],metal);
  const inletHole=new T.Path();inletHole.absarc(0,0,31,0,TAU,true);plate(throat,80,77,7,inletHole,[0,0,22],polymer,'Offener Drossel-Montageflansch');
  for(const x of [-30,30])for(const y of [-28,28])cylinder(throat,3.4,8,[x,y,20],metal,'z');box(throat,37,43,43,[-47,0,0],rubber,6,'EDK Stellmotor');
  throttle.position.fromArray(t);throttle.rotation.x=tilt;mesh(throttle,new T.CircleGeometry(30,48),blade,[],'Drosselklappenblatt').material.side=T.DoubleSide;cylinder(throttle,1.8,64,[0,0,0],metal,'y');

  closed.add(disa);const front=n.disa.map((v,i)=>i===2?v-variant.extraDepth:v);
  const disaBore=new T.Path();disaBore.absellipse(0,0,29,25,0,TAU,true);plate(disa,82,65,8,disaBore,front,polymer,'DISA Flanschplatte');
  cylinder(disa,23,23,[front[0]-45,front[1],front[2]-14],rubber,'z',false,'DISA Unterdruckdose');cylinder(disa,20,3,[front[0]-45,front[1],front[2]-27],mould,'z');box(disa,39,34,22,[front[0]+28,front[1],front[2]-10],polymer,5,'DISA Anschlussgehaeuse');
  for(const [dx,dy]of[[-32,-20],[32,20]])cylinder(disa,3,9,[front[0]+dx,front[1]+dy,front[2]-2],metal,'z');
  disaFlap.position.fromArray(n.disaPivot);cut.add(disaFlap);box(disaFlap,2.5,46,50,[0,0,0],polymer,.8,'DISA Klappenblatt');cylinder(disaFlap,2,104,[0,0,-45],metal,'z');
  const closedGate=disaFlap.clone(true);closedGate.name='DISA Kopplung im geschlossenen Gehaeuse';closed.add(closedGate);
  for(const x of [-29,29])box(cut,3,50,52,h(x,151,-224),mould,1,'DISA Einsteckrahmen');
  let disaOpen=false;
  const setDisaOpen=(open:boolean)=>{disaOpen=!!open;disaFlap.rotation.z=closedGate.rotation.z=disaOpen?Math.PI/2:0;disaFlap.userData.open=disaOpen;closedGate.userData.open=disaOpen;};setDisaOpen(false);

  tube(details,[n.idleInlet,n.idleValve,n.idleDistribution[2]],8,rubber,'Leerlaufsteller-Zufuehrung');const idleUnit=cylinder(details,13,43,n.idleValve,metal,'y',false,'Leerlaufsteller');idleUnit.rotation.z=.3;tube(details,n.idleDistribution,6,polymer,'Separate Leerlauf-Verteilerschiene');
  for(let i=0;i<6;i++)tube(cut,[n.idleDistribution[i],h(CYLINDER_X[i],225,-65),n.intakeHeadPaths[i][0][0]],2.7,mould,'Turbulenzkanal '+(i+1));

  // Existing filter package. Only its lower elbow follows the corrected throat.
  for(const parent of [closed,cut]){box(parent,144,5,134,h(-462,53,-295),polymer,2,'Luftfilterkasten Boden');box(parent,144,124,5,h(-462,115,-230),polymer,2,'Luftfilterkasten Rueckwand');}
  box(closed,145,8,136,h(-462,176,-295),polymer,3,'Luftfilterdeckel');box(closed,144,124,5,h(-462,115,-360),polymer,2,'Luftfilterkasten Aussenwand');
  for(const [x,portY]of[[-534,83],[-390,143]]){const shape=new T.Shape();shape.moveTo(-63,-67);shape.lineTo(63,-67);shape.lineTo(63,67);shape.lineTo(-63,67);shape.closePath();const bore=new T.Path();bore.absarc(portY-115,0,29,0,TAU,true);shape.holes.push(bore);const g=new T.ExtrudeGeometry(shape,{depth:4,bevelEnabled:false,curveSegments:24});g.applyMatrix4(new T.Matrix4().set(0,0,1,x,1,0,0,115+headOffset,0,1,0,-295,0,0,0,1));mesh(details,g,polymer,[],'Luftfilterkasten Anschluss');}
  cylinder(details,29,19,h(-544,83,-295),polymer,'x',true);ring(details,29,1.2,n.intakeMouth,mould,'x');for(const x of [-505,-419])box(details,10,19,5,h(x,161,-365),metal,1,'Filterkasten Halteklammer');for(let x=-524;x<=-400;x+=7)box(cut,3,15,116,h(x,116,-295),paper,.6,'Papierfilter-Lamelle');
  cylinder(details,29,40,n.maf,mould,'x',true,'Heissfilm-Luftmassenmesser');box(details,25,19,21,[n.maf[0],n.maf[1]+33,n.maf[2]],rubber,3,'LMM Elektronik');cylinder(details,29,20,h(-381,143,-295),polymer,'x',true);
  const boot=[h(-332,143,-295),...n.intakeBoot],bootCurve=new T.CatmullRomCurve3(boot.map(v=>new T.Vector3(...v)),false,'centripetal');tube(details,boot,29,rubber,'Gebogener Ansaugfaltenbalg');
  for(let i=0;i<17;i++){const u=.07+i/16*.8,point=bootCurve.getPointAt(u),rib=ring(details,30,1.5,point.toArray(),rubber);rib.quaternion.setFromUnitVectors(Z,bootCurve.getTangentAt(u));}
  for(const u of [0,.995]){const point=bootCurve.getPointAt(u),clamp=ring(details,30,1.2,point.toArray(),metal);clamp.quaternion.setFromUnitVectors(Z,bootCurve.getTangentAt(u));}tube(details,[n.idleTap,n.idleInlet],8,rubber,'Abzweig Leerlaufluft vor EDK');
  return{closed,cut,details,throttle,disaFlap,disa,variant,groups:[closed,cut,details,disa],nodes:n,passages:skins,setDisaOpen,get disaOpen(){return disaOpen;},flowRoutes:(open=disaOpen)=>m54IntakeRoutes(headOffset,open)};
}
