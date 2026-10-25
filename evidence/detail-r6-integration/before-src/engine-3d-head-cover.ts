import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CYLINDER_X} from './engine-3d-model';

type CoverMaterials={black:T.Material;rubber:T.Material;steel:T.Material;machined:T.Material;cast:T.Material};
const TAU=2*Math.PI;
function rounded(x:number,y:number,w:number,h:number,r:number){const s=new T.Shape();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;}
function hole(s:T.Shape,x:number,y:number,r:number){const p=new T.Path();p.absarc(x,y,r,0,TAU,true);s.holes.push(p);}
function up(s:T.Shape,y:number,h:number,bevel=0){const g=new T.ExtrudeGeometry(s,{depth:h,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:18});g.rotateX(Math.PI/2);g.translate(0,y+h,0);return g;}

/** Photo-authored early M54 cover and separate OE-style coil trim. The model's
 * fixed cam/cylinder datums are contractual; outside dimensions are illustrative. */
export function createM54HeadCover(headOffset:number,m:CoverMaterials){
  const ho=headOffset,root=new T.Group(),valveCover=new T.Group(),coilCover=new T.Group();
  root.name='M54B30 geformte Kopfabdeckung';valveCover.name='M54B30 hohler Ventildeckel';coilCover.name='M54B30 obere Zündspulenabdeckung';root.add(valveCover,coilCover);
  const mesh=(g:T.BufferGeometry,material:T.Material,parent=valveCover,x=0,y=0,z=0,name='')=>{const p=new T.Mesh(g,material);p.position.set(x,y,z);p.name=name;parent.add(p);return p;};
  const cyl=(r:number,h:number,material:T.Material,x:number,y:number,z:number,axis:'x'|'y'='y',parent=valveCover)=>{const p=mesh(new T.CylinderGeometry(r,r,h,28),material,parent,x,y,z);if(axis==='x')p.rotation.z=Math.PI/2;return p;};
  // Each bank is a bent thin skin. Its inner edge stops above the cam sweep;
  // no solid prism or deep vertical wall fills the moving valvetrain space.
  const left=[[256,-80],[301,-80],[319,-63],[323,-40],[309,-17],[306,-18],[320,-40],[316,-62],[300,-76],[256,-76]];
  const right=[[256,68],[298,68],[315,53],[316,34],[309,14],[306,15],[313,35],[312,51],[297,64],[256,64]];
  const stations=[-347,-330,-300,-275,-240,-180,-100,0,100,200,270,302,315];
  for(const section of [left,right]){
    const vertices:number[]=[],indices:number[]=[];
    for(const x of stations){const front=T.MathUtils.clamp((-x-240)/100,0,1),rear=T.MathUtils.clamp((x-230)/85,0,1);for(const [y,z] of section)vertices.push(x,y+ho+front*3-rear*2,z*(1+front*.08-rear*.035));}
    const n=section.length;
    for(let k=0;k<stations.length-1;k++)for(let j=0;j<n;j++){const a=k*n+j,b=k*n+(j+1)%n,c=(k+1)*n+j,d=(k+1)*n+(j+1)%n;indices.push(...(section===left?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();mesh(g,m.black);
  }
  // Recessed central bridge with six genuine plug-well openings.
  const valley=rounded(-273,-18,562,35,7);for(const x of CYLINDER_X)hole(valley,x,0,14);
  mesh(up(valley,305+ho,3),m.black);
  for(const x of CYLINDER_X){const annulus=new T.Shape();annulus.absarc(x,0,17,0,TAU,false);hole(annulus,x,0,14);mesh(up(annulus,308+ho,3),m.black);}
  // Broad rounded front hood over the timing area; open underneath.
  mesh(up(rounded(-350,-84,79,158,18),322+ho,4,1.6),m.black);
  for(const x of [-349,314]){const profile=rounded(251+ho,-76,x<0?72:63,145,15);const g=new T.ExtrudeGeometry(profile,{depth:4,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:2,curveSegments:16});g.applyMatrix4(new T.Matrix4().set(0,0,1,x-2,1,0,0,0,0,1,0,0,0,0,0,1));mesh(g,m.black);}
  const footprint=()=>{const s=new T.Shape();s.moveTo(-351,-66);s.quadraticCurveTo(-351,-88,-327,-88);s.lineTo(-278,-88);s.lineTo(-256,-78);s.lineTo(293,-75);s.quadraticCurveTo(320,-75,320,-48);s.lineTo(320,44);s.quadraticCurveTo(320,72,294,72);s.lineTo(-262,72);s.lineTo(-280,80);s.lineTo(-327,80);s.quadraticCurveTo(-351,80,-351,55);s.closePath();const inner=rounded(-344,-71,655,134,18);s.holes.push(new T.Path(inner.getPoints(18).reverse()));return s;};
  mesh(up(footprint(),254+ho,2),m.rubber);mesh(up(footprint(),256+ho,3),m.black);
  for(const [x,z] of [[-323,-82],[-220,-74],[-55,-74],[115,-73],[293,-61],[-325,74],[-218,67],[-55,67],[113,67],[291,60]]){cyl(6.5,3,m.rubber,x,260+ho,z);cyl(3.7,4,m.steel,x,263+ho,z);}
  // Distinct shallow upper trim panel, with a real oil-access opening.
  const trim=rounded(-274,-59,580,118,15);hole(trim,-165,-38,20);
  for(const x of [-100,208])hole(trim,x,14,5);
  mesh(up(trim,329+ho,3,1),m.black,coilCover);
  for(const z of [25,31,37,43])mesh(up(rounded(-224,z,475,1.8,.8),333.2+ho,.65),m.machined,coilCover);
  // Raised lettering sits on the trim panel, following the original appearance.
  const b=new T.Shape();b.moveTo(-37,-13);b.lineTo(-37,10);b.lineTo(-27,10);b.quadraticCurveTo(-16,10,-19,1);b.quadraticCurveTo(-14,-13,-27,-13);b.closePath();
  b.holes.push(new T.Path(rounded(-33,1,8,5,1).getPoints(8).reverse()),new T.Path(rounded(-33,-9,9,6,1).getPoints(8).reverse()));
  const letter=(points:number[][])=>{const s=new T.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();return s;};
  const mm=letter([[-12,-13],[-12,10],[-7,10],[0,-4],[7,10],[12,10],[12,-13],[8,-13],[8,3],[2,-9],[-2,-9],[-8,3],[-8,-13]]);
  const w=letter([[17,10],[22,10],[26,-5],[30,8],[34,8],[38,-5],[42,10],[47,10],[40,-13],[36,-13],[32,0],[28,-13],[24,-13]]);
  for(const s of [b,mm,w])mesh(up(s,333+ho,.8),m.machined,coilCover);
  // Oil cap belongs to the valve cover and stays when the decorative trim lifts.
  const neck=new T.Shape();neck.absarc(-165,-38,19,0,TAU,false);hole(neck,-165,-38,15);
  mesh(up(neck,319+ho,11),m.black);cyl(17.5,5,m.black,-165,332+ho,-38);
  mesh(new T.BoxGeometry(25,3,6),m.black,valveCover,-165,336+ho,-38);
  for(const x of [-100,208])cyl(5.3,1.8,m.black,x,334+ho,14,'y',coilCover);
  // Upper front face is ahead of the two fixed chain planes (-333/-320).
  const vanos=rounded(246+ho,-62,69,124,20);const vg=new T.ExtrudeGeometry(vanos,{depth:7,bevelEnabled:true,bevelSize:2,bevelThickness:2,bevelSegments:3,curveSegments:16});vg.applyMatrix4(new T.Matrix4().set(0,0,1,-352,1,0,0,0,0,1,0,0,0,0,0,1));mesh(vg,m.cast);
  for(const z of [-23,23]){cyl(19,22,m.cast,-361,279+ho,z,'x');cyl(13,4,m.machined,-373,279+ho,z,'x');}
  // Batch only within the separately removable shells.
  for(const group of [valveCover,coilCover]){const batches=new Map<T.Material,T.Mesh[]>();for(const p of group.children)if(p instanceof T.Mesh){const list=batches.get(p.material as T.Material)??[];list.push(p);batches.set(p.material as T.Material,list);}for(const [material,parts] of batches){if(parts.length<2)continue;const geometries=parts.map(p=>{p.updateMatrix();return(p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone()).applyMatrix4(p.matrix);});const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());for(const p of parts){p.geometry.dispose();p.removeFromParent();}mesh(merged,material,group);}}
  root.userData={illustrative:true,reference:'BMW 11121432928 original-part photographs and 11127526445 trim',oilFiller:[-165,332+ho,-38],camCentres:[[-23,279+ho],[23,279+ho]],chainPlanes:[-333,-320],minimumInnerRoofY:304+ho};
  return {root,valveCover,coilCover,groups:[root,valveCover,coilCover]};
}
