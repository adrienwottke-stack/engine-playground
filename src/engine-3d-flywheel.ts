import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
const TAU=Math.PI*2;

/** LuK 415 0122 10 photo-informed two-mass silhouette. Dimensions and tooth
 * count are authored for this model, not an OEM drawing or inertia model. */
export function createM54Flywheel(mat:MaterialFactory){
  const root=new T.Group();root.name='Schwungrad mit Starterzahnkranz';
  const body=mat(0x657476,.72,.48),face=mat(0xbdc9cb,.8,.34),gear=mat(0x778184,.76,.42),fastener=mat(0x344248,.64,.48);
  const add=(geometry:T.BufferGeometry,material:T.Material,name:string)=>{
    const part=new T.Mesh(geometry,material);part.name=name;root.add(part);return part;
  };
  const circleHole=(shape:T.Shape,r:number,y=0,z=0)=>{const hole=new T.Path();hole.absarc(y,z,r,0,TAU,true);shape.holes.push(hole);};
  const plate=(outer:number,depth:number,start:number,slots=false)=>{
    const shape=new T.Shape();shape.absarc(0,0,outer,0,TAU,false);circleHole(shape,17);
    for(let i=0;i<8;i++){const a=i/8*TAU;circleHole(shape,5,Math.sin(a)*33,Math.cos(a)*33);}
    if(slots){
      for(let i=0;i<6;i++){
        const a=i/6*TAU,hole=new T.Path(),lo=a-.23,hi=a+.23;
        hole.absarc(0,0,58,lo,hi,false);hole.lineTo(Math.cos(hi)*48,Math.sin(hi)*48);hole.absarc(0,0,48,hi,lo,true);hole.closePath();shape.holes.push(hole);
        circleHole(shape,2.5,Math.sin(a)*125,Math.cos(a)*125);
      }
    }
    const geometry=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:2,curveSegments:64});
    geometry.applyMatrix4(new T.Matrix4().set(0,0,1,start,1,0,0,0,0,1,0,0,0,0,0,1));return geometry;
  };
  const primary=add(plate(136,15,-10),body,'Schwungmasse');primary.userData.role='primary-housing';
  const secondary=add(plate(133,11,8,true),face,'Schwungmasse');secondary.userData.role='secondary-friction-plate';
  const hub=add(plate(44,6,3),gear,'Schwungmasse');hub.userData.role='crank-mounting-hub';
  const profile=[[129,3.5],[133,3.5],[133,8.5],[129,8.5],[129,3.5]].map(([r,x])=>new T.Vector2(r,x));
  const shoulder=new T.LatheGeometry(profile,96);shoulder.rotateZ(-Math.PI/2);add(shoulder,body,'Absatz zwischen Primaer und Sekundaermasse');
  // Trapezoidal teeth grow out of one continuous annulus rather than cubes.
  const outline=new T.Shape(),teeth=120;
  for(let i=0;i<teeth;i++)for(const [fraction,r] of [[0,138.5],[.22,138.5],[.36,143.5],[.65,143.5],[.79,138.5]] as const){
    const a=(i+fraction)/teeth*TAU,y=Math.sin(a)*r,z=Math.cos(a)*r;
    if(i===0&&fraction===0)outline.moveTo(y,z);else outline.lineTo(y,z);
  }
  outline.closePath();circleHole(outline,131.5);
  const ring=new T.ExtrudeGeometry(outline,{depth:9,bevelEnabled:true,bevelThickness:.22,bevelSize:.22,bevelSegments:1,curveSegments:64});
  ring.applyMatrix4(new T.Matrix4().set(0,0,1,-9,1,0,0,0,0,1,0,0,0,0,0,1));
  add(ring,gear,'Durchgehender trapezverzahnter Starterkranz');
  const hardware:T.BufferGeometry[]=[];
  for(let i=0;i<8;i++){
    const a=i/8*TAU,bolt=new T.CylinderGeometry(3.65,3.65,3.4,6);bolt.rotateZ(Math.PI/2);bolt.translate(10.5,Math.sin(a)*33,Math.cos(a)*33);hardware.push(bolt);
  }
  for(let i=0;i<3;i++){
    const a=(i/3+.055)*TAU,pin=new T.CylinderGeometry(2.3,2.3,5,16);pin.rotateZ(Math.PI/2);pin.translate(22,Math.sin(a)*125,Math.cos(a)*125);hardware.push(pin);
  }
  const combined=mergeGeometries(hardware)!;hardware.forEach(g=>g.dispose());add(combined,fastener,'Acht versenkte Kurbelwellenschrauben und Kupplungspassstifte');
  root.userData={reference:'LuK 415 0122 10 / BMW 21217512474',dimensions:'photo-informed authored approximation',frictionDiameter:240,outerRadius:143.72,teeth};
  return root;
}
