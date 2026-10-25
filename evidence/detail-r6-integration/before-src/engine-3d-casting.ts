import * as T from 'three';
import {CYLINDER_X} from './engine-3d-model';
import {assemblyConnectors} from './engine-3d-layout';
import {createM54Block} from './engine-3d-block';
import {createM54HeadCover} from './engine-3d-head-cover';

const TAU=Math.PI*2;
type Materials={cast:T.Material;machined:T.Material;steel:T.Material;black:T.Material;rubber:T.Material;brass:T.Material;cut:T.Material};
type CastingInputs={deck:number;headOffset:number;boreScale:number;materials:Materials};
export type EngineCasting={cutBlock:T.Group;cutHead:T.Group;portMounts:T.Group;closed:T.Group;groups:T.Group[]};

function roundedRect(x:number,y:number,w:number,h:number,r:number){
  const s=new T.Shape();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;
}
/** Extrude an authored YZ section along the cylinder row. */
function sectionAlongX(shape:T.Shape,length:number){
  const g=new T.ExtrudeGeometry(shape,{depth:length,steps:1,bevelEnabled:false,curveSegments:16});
  g.applyMatrix4(new T.Matrix4().set(0,0,1,-length/2,1,0,0,0,0,1,0,0,0,0,0,1));return g;
}
function upExtrusion(shape:T.Shape,height:number){const g=new T.ExtrudeGeometry(shape,{depth:height,steps:1,bevelEnabled:false,curveSegments:32});g.rotateX(Math.PI/2);g.translate(0,height,0);return g;}
function circularHole(shape:T.Shape,x:number,y:number,r:number){const h=new T.Path();h.absarc(x,y,r,0,TAU,true);shape.holes.push(h);}

/** Reference-informed M54B30 castings. The block is a connected scalloped
 * volume with true bores; the cut variant removes its front wall around them.
 * This is authored illustration geometry, not a dimensional OEM replacement. */
export function createM54Casting({deck,headOffset:ho,boreScale,materials:m}:CastingInputs):EngineCasting{
  const groups:T.Group[]=[],make=(name:string,parent?:T.Group)=>{const g=new T.Group();g.name=name;groups.push(g);parent?.add(g);return g;};
  const cutBlock=make('M54B30 Gussblock im Schnitt'),cutHead=make('M54B30 Kopfkanaele im Schnitt'),portMounts=make('Verschraubte Ansaug und Abgasflansche'),closed=make('M54B30 geschlossene Aussenhuelle');
  const closedBlock=make('M54B30 vollstaendiger Gussblock',closed),closedHead=make('M54B30 geschlossener Kopf Ventildeckel DoppelVANOS',closed);
  const mesh=(g:T.BufferGeometry,material:T.Material,p:T.Group,x=0,y=0,z=0)=>{const a=new T.Mesh(g,material);a.position.set(x,y,z);p.add(a);return a;};
  const box=(p:T.Group,w:number,h:number,d:number,material:T.Material,x:number,y:number,z:number)=>mesh(new T.BoxGeometry(w,h,d),material,p,x,y,z);
  const cyl=(p:T.Group,r:number,h:number,material:T.Material,x:number,y:number,z:number,axis:'x'|'y'|'z'='y',segments=24)=>{const a=mesh(new T.CylinderGeometry(r,r,h,segments),material,p,x,y,z);if(axis==='x')a.rotation.z=Math.PI/2;if(axis==='z')a.rotation.x=Math.PI/2;return a;};
  const ring=(p:T.Group,r:number,t:number,material:T.Material,x:number,y:number,z:number,axis:'x'|'y'|'z'='z')=>{const a=mesh(new T.TorusGeometry(r,t,6,28),material,p,x,y,z);if(axis==='x')a.rotation.y=Math.PI/2;if(axis==='y')a.rotation.x=Math.PI/2;return a;};
  const beam=(p:T.Group,a:number[],b:number[],width:number,depth:number,material:T.Material)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),part=box(p,width,delta.length(),depth,material,0,0,0);part.position.copy(start.add(end).multiplyScalar(.5));part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return part;};

  const bore=43.5*boreScale,wall=Math.max(70,bore+24),jacket=Math.max(54,bore+10);
  const plan=(cutaway:boolean)=>{
    const s=new T.Shape();s.moveTo(-314,-wall+7);s.quadraticCurveTo(-314,-wall,-304,-wall);
    for(let x=-300;x<=300;x+=5)s.lineTo(x,-wall-3*Math.cos((x+250)/100*TAU));
    s.quadraticCurveTo(314,-wall,314,-wall+8);
    if(!cutaway){
      s.lineTo(314,wall-8);s.quadraticCurveTo(314,wall,304,wall);
      for(let x=300;x>=-300;x-=5)s.lineTo(x,wall+3*Math.cos((x+250)/100*TAU));
      s.quadraticCurveTo(-314,wall,-314,wall-8);s.closePath();
      for(const x of CYLINDER_X)circularHole(s,x,0,bore);
    }else{
      const cutZ=16,span=Math.sqrt(Math.max(1,bore*bore-cutZ*cutZ));s.lineTo(314,cutZ);
      // Scalloped cut follows the rear half of every bore. The retained webs
      // and curved outer water-jacket wall form one real casting volume.
      for(const x of [...CYLINDER_X].reverse()){
        s.lineTo(x+span,cutZ);
        const from=Math.asin(cutZ/bore),to=-Math.PI-from;
        for(let i=1;i<=32;i++){const a=from+(to-from)*i/32;s.lineTo(x+bore*Math.cos(a),bore*Math.sin(a));}
      }
      s.lineTo(-314,cutZ);s.closePath();
    }
    for(const x of CYLINDER_X)circularHole(s,x,-jacket,6.5);
    if(!cutaway)for(const x of CYLINDER_X)circularHole(s,x,jacket,6.5);
    return s;
  };
  // Closed and cut use the same photographed block. The open variant removes
  // the observer-facing half in geometry; head ports and global mode groups stay.
  cutBlock.add(createM54Block({deck,boreScale,cutaway:true,materials:m}));
  closedBlock.add(createM54Block({deck,boreScale,materials:m}));
  // Side walls have real six-port holes. Separate flanges have bolt holes and
  // studs; inlet and outlet paths descend inside the casting to paired valves.
  const c=assemblyConnectors(ho),portY=226+ho;
  const portFace=(parent:T.Group,side:number,fullHeight:boolean)=>{
    const face=roundedRect(-314,deck+3,628,fullHeight?69:40,5);
    for(const x of CYLINDER_X)circularHole(face,x,portY,14.5);
    mesh(new T.ExtrudeGeometry(face,{depth:11,bevelEnabled:false,curveSegments:24}),m.cast,parent,0,0,side<0?-77:66);
    mesh(upExtrusion(plan(false),3),m.machined,parent,0,deck,0);
  };
  portFace(cutHead,-1,false);portFace(cutHead,1,false);portFace(closedHead,-1,true);portFace(closedHead,1,true);
  for(const parent of [cutHead,closedHead])for(const x of [-309,309])box(parent,10,72,148,m.cast,x,deck+38,0);
  for(let cylinder=0;cylinder<6;cylinder++)for(const side of [-1,1]){
    const x=CYLINDER_X[cylinder];
    // Exhaust mounting rails and their supported fasteners belong to the
    // manifold assembly. Keep the inlet flanges and both internal port paths.
    if(side<0){
      const face=roundedRect(-32,-20,64,40,7);circularHole(face,0,0,14.5);
      for(const dx of [-25,25])circularHole(face,dx,0,3.4);
      const flange=mesh(new T.ExtrudeGeometry(face,{depth:8,bevelEnabled:false,curveSegments:20}),m.black,portMounts,x,portY,-85);flange.name='Verschraubter Ansaugflansch';
      for(const dx of [-25,25]){
        cyl(portMounts,2.8,18,m.steel,x+dx,portY,-83,'z',6);cyl(portMounts,4.4,4,m.brass,x+dx,portY,-90,'z',6);
      }
    }
    const paths=side<0?c.intakeHeadPaths[cylinder]:c.exhaustHeadPaths[cylinder];
    for(const path of paths){
      const curve=new T.CatmullRomCurve3(path.map(p=>new T.Vector3(...p)),false,'centripetal');
      const tube=new T.TubeGeometry(curve,26,12,12,false),inner=new T.TubeGeometry(curve,26,9.3,12,false);
      const openTop=(g:T.BufferGeometry,invert=false)=>{
        const index=g.index!,normal=g.getAttribute('normal'),kept:number[]=[];
        for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),d=index.getX(i+2);if((normal.getY(a)+normal.getY(b)+normal.getY(d))/3<.12)kept.push(a,invert?d:b,invert?b:d);}
        if(invert)for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
        g.setIndex(kept);return g;
      };
      mesh(openTop(tube),m.cast,cutHead);mesh(openTop(inner,true),m.machined,cutHead);
    }
  }

  const headCover=createM54HeadCover(ho,m);closedHead.add(headCover.root);groups.push(...headCover.groups);
  // Existing closed-head batching can share the fixed metallic VANOS hardware.
  // Keep plastic shell, gasket and removable trim in their own physical groups.
  for(const part of [...headCover.valveCover.children])if(part instanceof T.Mesh&&[m.cast,m.machined,m.steel].includes(part.material as T.Material))closedHead.add(part);
  // Front timing enclosure follows crankcase width at the bottom and the
  // double-cam/VANOS bulge at the top. It is a complete closed cover only here.
  const timingFace=roundedRect(-32,-58,277+ho,116,24);circularHole(timingFace,0,0,18);circularHole(timingFace,63,-30,24.5);
  const frontWall=mesh(sectionAlongX(timingFace,11),m.cast,closedHead,-347.5,0,0);frontWall.name='Geschlossene Steuertrieb Frontwand';
  const timingRim=roundedRect(-32,-58,277+ho,116,24),timingInner=roundedRect(-29,-55,271+ho,110,21);
  timingRim.holes.push(new T.Path(timingInner.getPoints(24).reverse()));
  const caseRim=mesh(sectionAlongX(timingRim,27),m.cast,closedHead,-328.5,0,0);caseRim.name='Hohler Steuertrieb Gehaeuserand';
  for(const y of [30,92,160,225])for(const z of [-47,47])cyl(closedHead,3.5,15,m.steel,-357,y,z,'x',6);
  closed.visible=false;return {cutBlock,cutHead,portMounts,closed,groups};
}
