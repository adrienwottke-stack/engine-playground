import * as T from 'three';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {assemblyConnectors,engineRoutes} from './engine-3d-layout';
import {CYLINDER_X} from './engine-3d-model';

type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
const UP=new T.Vector3(0,1,0),TAU=Math.PI*2;
const smoothMin=(a:number,b:number,k:number)=>{const h=Math.max(0,k-Math.abs(a-b))/k;return Math.min(a,b)-h*h*k*.25;};
function capsule(x:number,y:number,z:number,a:number[],b:number[],radius:number){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  const t=T.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/(dx*dx+dy*dy+dz*dz),0,1);
  return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy,z-a[2]-t*dz)-radius;
}

function outlineDistance(x:number,y:number,points:T.Vector2[],gradient?:T.Vector2){
  let distance=Infinity,inside=false,nearestX=0,nearestY=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    if(length>1e-10){const t=T.MathUtils.clamp(((x-a.x)*dx+(y-a.y)*dy)/length,0,1),vx=x-a.x-t*dx,vy=y-a.y-t*dy,d=Math.hypot(vx,vy);if(d<distance){distance=d;nearestX=vx;nearestY=vy;}}
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  const sign=inside?-1:1;
  if(gradient)gradient.set(nearestX,nearestY).multiplyScalar(sign/Math.max(distance,1e-6));
  return sign*distance;
}

/** A smoothly joined envelope with cored entrance throats, derived from the
 * supplied photographs. Construction-time geometry, not a fluid simulation. */
function manifoldGeometry(bank:number,ho:number,material:T.Material){
  const n=assemblyConnectors(ho),center=bank===0?-150:150,resolution=52;
  const bounds=[150,90,100],origin=[center,210+ho,140];
  const surface=new MarchingCubes(resolution,material,false,false,50000);surface.isolation=0;
  const xs=CYLINDER_X.slice(bank*3,bank*3+3);
  // Trace the fan-like silhouette in the plane away from the head. Its two
  // deep U recesses are part of the boundary, not dark markings on a solid bar.
  const shape=new T.Shape();shape.moveTo(-124,0);
  shape.bezierCurveTo(-139,25,-145,65,-126,96);
  shape.bezierCurveTo(-106,125,-45,132,7,128);
  shape.bezierCurveTo(77,130,127,114,136,82);
  shape.bezierCurveTo(146,49,137,18,122,0);
  shape.lineTo(80,0);shape.lineTo(71,45);
  shape.bezierCurveTo(69,60,63,69,51,69);shape.bezierCurveTo(36,69,31,60,29,45);
  shape.lineTo(22,0);shape.lineTo(-22,0);shape.lineTo(-30,43);
  shape.bezierCurveTo(-32,60,-38,67,-51,67);shape.bezierCurveTo(-65,67,-72,58,-73,43);
  shape.lineTo(-82,0);shape.closePath();const outline=shape.getPoints(12);
  const planar=new Float32Array(resolution*resolution);
  for(let z=0;z<resolution;z++)for(let x=0;x<resolution;x++)planar[z*resolution+x]=outlineDistance((x/resolution*2-1)*bounds[0],(z/resolution*2-1)*bounds[2]+origin[2]-84,outline);
  const distanceAt=(px:number,py:number,pz:number,contour=outlineDistance(px-center,pz-84,outline))=>{
    const planeY=225+ho-(pz-84)*.23;
    // Rounded stamped shell with broad faces, perpendicular to the mounting
    // plate. This replaces the three tubular elbows and the lower ellipse.
    const halfDepth=9+11*(1-Math.exp(-Math.max(0,-contour)/13));
    let distance=-smoothMin(-contour-3,-(Math.abs(py-planeY)-halfDepth),8);
    for(const portX of xs){
      const shoulder=18.5+2*T.MathUtils.smoothstep(pz,90,119);
      // A wider blend only where each cast neck grows into the common fan.
      // Keep the rail/collar region itself and the deep U recesses unchanged.
      const blend=7+4*T.MathUtils.smoothstep(pz,101,119)*(1-T.MathUtils.smoothstep(pz,130,151));
      distance=smoothMin(distance,capsule(px,py,pz,[portX,226+ho,77],[portX,221+ho,112],shoulder),blend);
    }
    const c=n.exhaustCollectors[bank];
    distance=smoothMin(distance,capsule(px,py,pz,[c[0],199+ho,c[2]],c,22.5),13);
    // Six seated necks leave the flange, without the old spherical caps
    // swelling backwards into the head. Relax the radial boundary smoothly
    // into the existing fan; the collector and catalyst axis are untouched.
    if(pz<123){
      const t=T.MathUtils.smoothstep(pz,85.5,122),rx=17.4+10*t,ry=(18+10*t)*(1-.3*t)-.6;
      const seatY=226+ho-(pz-90)*.14;
      const neck=Math.min(...xs.map(x=>(Math.hypot((px-x)/rx,(py-seatY)/ry)-1)*18))-28*T.MathUtils.smoothstep(pz,109,123);
      distance=Math.max(distance,neck);
    }
    if(distance<5){
      let bore=Infinity;
      // Core only the entrance throats here; the complete media network lives
      // in engineRoutes and is exposed in cutaway/flow presentation.
      for(const portX of xs){
        bore=Math.min(bore,capsule(px,py,pz,[portX,226+ho,58],[portX,222+ho,106],13.5));
      }
      bore=Math.min(bore,capsule(px,py,pz,c,n.catalystInlets[bank],19));
      distance=Math.max(distance,-bore);
    }
    // End the sampled casting on a flat section. A precision revolved neck
    // below supplies the full round wall down to the catalyst, without the
    // almost-zero-thickness rim left by two intersecting spherical caps.
    return Math.max(distance,176+ho-py,100-pz);
  };
  for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const px=(x/resolution*2-1)*bounds[0]+origin[0],py=(y/resolution*2-1)*bounds[1]+origin[1],pz=(z/resolution*2-1)*bounds[2]+origin[2];
    surface.field[z*resolution*resolution+y*resolution+x]=-distanceAt(px,py,pz,planar[z*resolution+x]);
  }
  surface.update();
  const geometry=new T.BufferGeometry(),count=surface.geometry.drawRange.count;
  if(count>=surface.geometry.getAttribute('position').count)throw new Error('Krümmeroberfläche überschreitet den Geometriepuffer.');
  for(const name of ['position','normal']){
    const attribute=surface.geometry.getAttribute(name);
    geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(attribute.array.slice(0,count*3)),3));
  }
  geometry.scale(...bounds as [number,number,number]);geometry.translate(...origin as [number,number,number]);
  // MarchingCubes interpolates cached grid normals. Around the cast shoulders
  // those coarse derivatives can disagree with interpolated vertex positions.
  // Reproject only that small transition band once. Keep the filtered grid
  // normals: raw polygon-distance gradients introduce visible shading bands.
  // No denser global grid or additional triangles are needed.
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),epsilon=.3;
  const refined=new Map<string,{position:T.Vector3;normal:T.Vector3}>(),contourGradient=new T.Vector2(),collector=n.exhaustCollectors[bank];
  for(let i=0;i<positions.count;i++){
    let x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const neckBand=T.MathUtils.smoothstep(z,105,113)*(1-T.MathUtils.smoothstep(z,132,151));
    const collectorBand=(1-T.MathUtils.smoothstep(Math.hypot(x-collector[0],z-collector[2]),36,52))*(1-T.MathUtils.smoothstep(y,201+ho,211+ho));
    const weight=T.MathUtils.smoothstep(y,184+ho,192+ho)*Math.max(neckBand,collectorBand);
    if(weight===0)continue;
    const key=`${x},${y},${z}`,cached=refined.get(key);
    if(cached){positions.setXYZ(i,...cached.position.toArray());normals.setXYZ(i,...cached.normal.toArray());continue;}
    const ox=x,oz=z,contour=outlineDistance(x-center,z-84,outline,contourGradient),gx=contourGradient.x,gz=contourGradient.y;
    // The exact nearest boundary supplies a local tangent. Reuse it for the
    // tiny finite differences instead of rescanning the complete outline.
    const localDistance=(px:number,py:number,pz:number)=>distanceAt(px,py,pz,contour+(px-ox)*gx+(pz-oz)*gz);
    const gradient=(px:number,py:number,pz:number)=>new T.Vector3(
      localDistance(px+epsilon,py,pz)-localDistance(px-epsilon,py,pz),
      localDistance(px,py+epsilon,pz)-localDistance(px,py-epsilon,pz),
      localDistance(px,py,pz+epsilon)-localDistance(px,py,pz-epsilon),
    ).multiplyScalar(1/(2*epsilon));
    const g=gradient(x,y,z),squared=g.lengthSq();
    if(squared<.05)continue;
    const correction=T.MathUtils.clamp(localDistance(x,y,z)/squared,-1,1)*weight;
    x-=g.x*correction;y-=g.y*correction;z-=g.z*correction;
    positions.setXYZ(i,x,y,z);
    const normal=new T.Vector3().fromBufferAttribute(normals,i).normalize();
    normals.setXYZ(i,normal.x,normal.y,normal.z);refined.set(key,{position:new T.Vector3(x,y,z),normal});
  }
  surface.geometry.dispose();return castColors(geometry);
}

function castColors(geometry:T.BufferGeometry){
  const positions=geometry.getAttribute('position'),count=positions.count,colors=new Float32Array(count*3);
  const grey=new T.Color(0x3f3b38),brown=new T.Color(0x59473c),color=new T.Color();
  for(let i=0;i<count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const grain=Math.sin(x*1.27+y*.93+z*2.31)*Math.sin(x*2.17-y*1.39+z*.87);
    const heat=.22+.17*Math.sin(x*.025+z*.033);
    color.copy(grey).lerp(brown,heat).multiplyScalar(1+grain*.07);color.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  return geometry;
}

function manifoldWithNeckGeometry(bank:number,ho:number,material:T.Material){
  const inlet=assemblyConnectors(ho).catalystInlets[bank],base=inlet[1];
  // Both surfaces have real wall thickness and meet the catalyst's 20.5 mm
  // outer radius on the very same lower circle. The flared top sits within the
  // casting, so the join is smooth from below as well as from the front.
  const profile=[
    [20.5,0],[21.2,2],[23,6],[24.4,11],[24.7,20],[25,26],[26,31],[28,37],[30.5,42],[32,46],
    [30,46],[28.5,42],[26,37],[24,31],[23,26],[22.7,20],[22.4,11],[21,6],[19.2,2],[18.5,0],[20.5,0],
  ];
  const collar=new T.LatheGeometry(profile.map(([radius,y])=>new T.Vector2(radius,base+y)),64);
  collar.deleteAttribute('uv');collar.translate(inlet[0],0,inlet[2]);castColors(collar);
  const flat=collar.toNonIndexed(),body=manifoldGeometry(bank,ho,material),combined=mergeGeometries([body,flat]);
  body.dispose();collar.dispose();flat.dispose();
  if(!combined)throw new Error('Krümmer und Katstutzen konnten nicht verbunden werden.');
  return combined;
}

function mountingXs(xs:number[]){return [xs[0]-27,(xs[0]+xs[1])/2,(xs[1]+xs[2])/2,xs[2]+27];}
const MOUNTING_ROWS=[-14,22];

function flangeGeometry(xs:number[],y:number,z:number){
  // One radiused mounting rail per bank. Eight supported fastening lands match
  // the sixteen head-side nuts in the E39 530i parts diagram; photo proportions,
  // not measured OEM hole coordinates. The six gas centres stay unchanged.
  const outline=new T.Shape(),left=xs[0]-38,right=xs[2]+38,bolts=mountingXs(xs);
  outline.moveTo(left,y-13);outline.quadraticCurveTo(left,y-22,bolts[0],y-22);
  for(let i=0;i<3;i++){
    outline.bezierCurveTo(bolts[i]+14,y-22,xs[i]-16,y-20,xs[i],y-20);
    outline.bezierCurveTo(xs[i]+16,y-20,bolts[i+1]-14,y-22,bolts[i+1],y-22);
  }
  outline.quadraticCurveTo(right,y-22,right,y-13);outline.lineTo(right,y+19);
  outline.quadraticCurveTo(right,y+32,bolts[3],y+32);
  for(let i=2;i>=0;i--){
    outline.bezierCurveTo(bolts[i+1]-14,y+32,xs[i]+16,y+24,xs[i],y+24);
    outline.bezierCurveTo(xs[i]-16,y+24,bolts[i]+14,y+32,bolts[i],y+32);
  }
  outline.quadraticCurveTo(left,y+32,left,y+19);outline.closePath();
  for(const x of xs){
    const port=new T.Path();port.absellipse(x,y,14.8,16,0,TAU,true);outline.holes.push(port);
  }
  for(const x of bolts)for(const dy of MOUNTING_ROWS){const hole=new T.Path();hole.absarc(x,y+dy,3.4,0,TAU,true);outline.holes.push(hole);}
  return new T.ExtrudeGeometry(outline,{depth:9,bevelEnabled:true,bevelThickness:.8,bevelSize:.8,bevelSegments:3,curveSegments:24}).translate(0,0,z);
}

function portCollarGeometry(x:number,y:number){
  // A precision cast socket leaves the rail and becomes an oval shoulder
  // inside the common fan. Its rear overlaps the flange; its forward rim is
  // buried in the shell, rather than leaving a second exposed metal ring.
  const zs=Array.from({length:17},(_,i)=>85.5+i/16*36.5);
  const outer=zs.map(z=>[18+10*T.MathUtils.smoothstep(z,85.5,122),z]);
  const inner=zs.map((z,i)=>[outer[i][0]-3.3+.8*i/16,z]).reverse();
  const profile=[...outer,...inner,outer[0]];
  const geometry=new T.LatheGeometry(profile.map(([r,z])=>new T.Vector2(r,z)),48);
  geometry.rotateX(Math.PI/2);
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const z=p.getZ(i),flatten=1-.3*T.MathUtils.smoothstep(z,85.5,122);
    p.setXYZ(i,p.getX(i)+x,p.getY(i)*flatten+y-(z-90)*.14,z);
  }
  geometry.computeVertexNormals();return castColors(geometry);
}

export function createM54ExhaustManifolds(headOffset:number,mat:MaterialFactory){
  const n=assemblyConnectors(headOffset),closed=new T.Group(),details=new T.Group(),cut=new T.Group();
  closed.name='M54 Krümmer und Kat Außenhüllen nach Fotoreferenz';details.name='M54 Abgasflansche und Fallrohre';cut.name='M54 Katalysatoren im Schnitt';
  const cast=mat(0xffffff,.33,.9);cast.vertexColors=true;
  const steel=mat(0xffffff,.62,.57);steel.vertexColors=true;
  const flange=mat(0x635d55,.58,.67),weld=mat(0x5d5248,.52,.66),ceramic=mat(0x9b917e,.12,.86);
  const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Group,name:string)=>{const p=new T.Mesh(g,m);p.name=name;parent.add(p);return p;};
  const cylinder=(r:number,h:number,m:T.Material,parent:T.Group,position:T.Vector3,axis:T.Vector3,name:string,segments=24)=>{
    const p=mesh(new T.CylinderGeometry(r,r,h,segments),m,parent,name);p.position.copy(position);p.quaternion.setFromUnitVectors(UP,axis);return p;
  };
  const tube=(points:number[][],radius:number,m:T.Material,name:string)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal'),100,radius,24,false),m,details,name);
  for(let bank=0;bank<2;bank++){
    const bankName=bank===0?'1–3':'4–6',xs=CYLINDER_X.slice(bank*3,bank*3+3);
    mesh(manifoldWithNeckGeometry(bank,headOffset,cast),cast,closed,`Zusammenhängender Dreierkrümmer ${bankName}`);
    // ExtrudeGeometry places the rear face one bevelThickness behind z.
    // The rail now has .8 of bearing overlap at the actual z=77 head face.
    mesh(flangeGeometry(xs,226+headOffset,77),flange,details,`Dreifachflansch ${bankName}`);
    for(const x of xs)mesh(portCollarGeometry(x,226+headOffset),cast,closed,`Integrierter Anschlusskragen ${x}`);
    for(const x of mountingXs(xs))for(const dy of MOUNTING_ROWS){
      const y=226+headOffset+dy;
      // The seat starts inside the rail, followed by the hex nut and a short
      // exposed stud. Keep one material here: this round compares geometry.
      const seat=mesh(new T.LatheGeometry([[3.3,86],[6.9,86],[7.5,87.3],[7.1,89],[3.3,89],[3.3,86]].map(([r,z])=>new T.Vector2(r,z)),24),flange,details,`Aufliegender Schraubensitz ${bankName}`);
      seat.rotation.x=Math.PI/2;seat.position.set(x,y,0);
      cylinder(5.4,5,flange,details,new T.Vector3(x,y,91),new T.Vector3(0,0,1),`Sechskantmutter ${bankName}`,6);
      cylinder(2.8,10,flange,details,new T.Vector3(x,y,91),new T.Vector3(0,0,1),`Stehbolzen ${bankName}`,12);
    }
    const a=new T.Vector3(...n.catalystInlets[bank]),b=new T.Vector3(...n.catalystOutlets[bank]),axis=b.clone().sub(a).normalize(),length=a.distanceTo(b);
    const profile=[[20.5,0],[21,9],[28,20],[36,34],[38,47],[38,length-40],[34,length-25],[23,length-10],[19,length]];
    const body=new T.LatheGeometry(profile.map(([r,t])=>new T.Vector2(r,t)),64);
    const positions=body.getAttribute('position'),colors=new Float32Array(positions.count*3),color=new T.Color();
    const aged=new T.Color(0x81796a),silver=new T.Color(0xa6a39a),heat=new T.Color(0x8f725b);
    for(let i=0;i<positions.count;i++){
      const t=positions.getY(i)/length,patch=.5+.5*Math.sin(positions.getX(i)*.055+positions.getZ(i)*.07+t*8);
      color.copy(aged).lerp(silver,Math.sin(Math.PI*t)*.65).lerp(heat,patch*.15);color.toArray(colors,i*3);
    }
    body.setAttribute('color',new T.BufferAttribute(colors,3));
    const cat=mesh(body,steel,closed,`Länglicher Katalysator ${bankName}`);cat.position.copy(a);cat.quaternion.setFromUnitVectors(UP,axis);
    // Stamped cover with its own folded longitudinal edges and welded tabs.
    const coverGeometry=new T.LatheGeometry([[36.5,34],[39,47],[39,length-40],[35.5,length-25]].map(([r,t])=>new T.Vector2(r,t)),48,.1,Math.PI*1.4);
    const cover=mesh(coverGeometry,flange,closed,`Geprägtes Kat Abdeckblech ${bankName}`);cover.position.copy(a);cover.quaternion.copy(cat.quaternion);
    for(const t of [35,length-26]){
      const radius=t===35?36.5:34.5;
      const seam=mesh(new T.TorusGeometry(radius,.95,6,48),weld,closed,`Kat Schweißnaht ${bankName}`);
      seam.position.copy(a).addScaledVector(axis,t);seam.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);
    }
    for(const phi of [.1,Math.PI*1.4+.1]){
      const local=new T.Vector3(Math.sin(phi)*39,(length+9)/2,Math.cos(phi)*39).applyQuaternion(cat.quaternion).add(a);
      cylinder(1.25,length-65,weld,closed,local,axis,`Gefalzte Blechkante ${bankName}`,8);
    }
    const collectorRoute=engineRoutes(headOffset).find(r=>r.medium==='exhaust'&&r.branch===`collector-${bank?'rear':'front'}`)!;
    tube(collectorRoute.coords,20.5,flange,`Versetztes Fallrohr ${bankName}`);
    // Cut mode retains a genuinely open shell and an inset substrate.
    const open=mesh(new T.LatheGeometry(profile.map(([r,t])=>new T.Vector2(r,t)),40,Math.PI*.45,Math.PI*1.25),flange,cut,`Offene Katwand ${bankName}`);open.position.copy(a);open.quaternion.copy(cat.quaternion);open.material.side=T.DoubleSide;
    const brick=cylinder(30,length-72,ceramic,cut,a.clone().addScaledVector(axis,length*.52),axis,`Kat Monolith ${bankName}`);
    brick.geometry.dispose();brick.geometry=new T.CylinderGeometry(30,30,length-72,32,1,true,Math.PI*.45,Math.PI*1.25);
  }
  return {closed,details,cut,groups:[closed,details,cut]};
}
