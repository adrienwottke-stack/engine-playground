import * as T from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {CYLINDER_X} from './engine-3d-model';
import {createEngineMaterial} from './engine-material-profiles';
import {castingEase,castRibWithRoot,clipCastingAtZ} from './engine-casting-blends';

type BlockInputs={deck:number;boreScale:number;cutaway?:boolean;materials:{machined:T.Material;steel:T.Material;black:T.Material}};
const TAU=Math.PI*2;
function rounded(x:number,y:number,w:number,h:number,r:number){
  const s=new T.Shape();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);s.closePath();return s;
}
function hole(shape:T.Shape,x:number,y:number,r:number){const p=new T.Path();p.absarc(x,y,r,0,TAU,true);shape.holes.push(p);}
function slot(shape:T.Shape,x:number,y:number,w:number,h:number){const p=rounded(x,y,w,h,Math.min(w,h)*.42);shape.holes.push(new T.Path(p.getPoints(10).reverse()));}
function alongX(shape:T.Shape,length:number){const g=new T.ExtrudeGeometry(shape,{depth:length,steps:1,bevelEnabled:false,curveSegments:24});g.applyMatrix4(new T.Matrix4().set(0,0,1,-length/2,1,0,0,0,0,1,0,0,0,0,0,1));return g;}
function upward(shape:T.Shape,base:number,height:number,steps=1){const g=new T.ExtrudeGeometry(shape,{depth:height,steps,bevelEnabled:false,curveSegments:32});g.rotateX(Math.PI/2);g.translate(0,base+height,0);return g;}

/** Photo-informed bare M54B30 block. Fixed cylinder centres and deck datum
 * retain the existing mechanism contract; outer cast dimensions are authored. */
export function createM54Block({deck,boreScale,cutaway=false,materials:m}:BlockInputs){
  const root=new T.Group();root.name='M54B30 Block nach Fotoreferenz';
  const cast=createEngineMaterial(0xffffff,.45,.68,'cast-aluminium');cast.vertexColors=true;
  const iron=new T.MeshStandardMaterial({color:0x52595a,metalness:.48,roughness:.42});
  const featureNames:string[]=[];
  const mesh=(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0,name='')=>{
    if(material===cast){
      const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3),base=new T.Color(0x9b9e99),shade=new T.Color();
      for(let i=0;i<p.count;i++){const a=p.getX(i)+x,b=p.getY(i)+y,c=p.getZ(i)+z;const grain=Math.sin(a*1.71+b*2.23+c*.93)*Math.sin(a*.81-b*1.37+c*2.61);shade.copy(base).multiplyScalar(.96+grain*.045+.025*Math.sin(a*.033+b*.059));shade.toArray(colors,i*3);}
      geometry.setAttribute('color',new T.BufferAttribute(colors,3));
    }
    const part=new T.Mesh(geometry,material);part.position.set(x,y,z);part.name=name;root.add(part);if(name)featureNames.push(name);return part;
  };
  const cyl=(r:number,h:number,material:T.Material,x:number,y:number,z:number,axis:'x'|'y'|'z'='y',segments=32)=>{const p=mesh(new T.CylinderGeometry(r,r,h,segments),material,x,y,z);if(axis==='x')p.rotation.z=Math.PI/2;if(axis==='z')p.rotation.x=Math.PI/2;return p;};
  const rib=(a:number[],b:number[],width:number,depth:number)=>{
    const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start);
    const g=new T.ExtrudeGeometry(rounded(-width/2,-delta.length()/2,width,delta.length(),Math.min(width*.4,2.5)),{depth,bevelEnabled:true,bevelThickness:.7,bevelSize:.7,bevelSegments:2,curveSegments:6});g.translate(0,0,-depth/2);
    const p=mesh(g,cast);p.position.copy(start.add(end).multiplyScalar(.5));p.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return p;
  };
  const boss=(x:number,y:number,z:number,outer:number,inner:number,length:number)=>{
    const profile=[[outer,-length/2],[outer,length/2],[inner,length/2],[inner,-length/2],[outer,-length/2]];
    const g=new T.LatheGeometry(profile.map(([r,t])=>new T.Vector2(r,t)),28);g.rotateX(Math.PI/2);return mesh(g,cast,x,y,z);
  };
  const bore=42*boreScale,linerOuter=bore+2.5,wall=Math.max(77,linerOuter+30),jacket=Math.max(57,linerOuter+12);
  const fieldRadius=(y:number)=>wall+13-19*castingEase((y-35)/65);
  const skirtRadius=(y:number)=>{const t=T.MathUtils.clamp((-98+Math.sqrt(Math.max(0,98*98+56*(76-y))))/28,0,1);return wall-19+8*t-3*t*t;};
  const plan=(water:boolean)=>{
    const s=new T.Shape();s.moveTo(-314,-wall+7);s.quadraticCurveTo(-314,-wall,-306,-wall);
    for(let x=-300;x<=300;x+=5)s.lineTo(x,-wall-5.5*Math.cos((x+250)/100*TAU)-34*Math.exp(-Math.pow((x+270)/31,4)));
    s.quadraticCurveTo(314,-wall,314,-wall+8);s.lineTo(314,wall-8);s.quadraticCurveTo(314,wall,306,wall);
    for(let x=300;x>=-300;x-=5)s.lineTo(x,wall+3.8*Math.cos((x+250)/100*TAU));
    s.quadraticCurveTo(-314,wall,-314,wall-8);s.closePath();
    for(const x of CYLINDER_X){hole(s,x,0,linerOuter);if(water)for(const side of [-1,1]){
      // Paired oblique coolant windows leave the wider bolt lands seen in the
      // close-up deck photographs, instead of one straight slot per cylinder.
      for(const dx of [-19,19]){const p=rounded(-12,-4,24,8,3),path=new T.Path(p.getPoints(10).reverse().map(v=>v.rotateAround(new T.Vector2(),side*Math.sign(dx)*.32).add(new T.Vector2(x+dx,side*jacket))));s.holes.push(path);}
    }}
    slot(s,-287,-103,32,28);
    for(let x=-300;x<=300;x+=100)for(const side of [-1,1])hole(s,x,side*(wall-15),5.2);
    return s;
  };
  const barrel=upward(plan(true),91,deck-96,16),barrelPositions=barrel.getAttribute('position');
  for(let i=0;i<barrelPositions.count;i++){
    const x=barrelPositions.getX(i),y=barrelPositions.getY(i),z=barrelPositions.getZ(i),weight=T.MathUtils.clamp((Math.abs(z)-(wall-7))/4,0,1);
    const t=T.MathUtils.clamp((y-91)/(deck-96),0,1),bulge=Math.sin(t*Math.PI)*(3+12*Math.cos((x+250)/100*TAU));
    // The lower edge falls into the cast saddles at each barrel and rises
    // between them, exposing the recessed gallery behind the overhanging lip.
    const castY=y-(1-t)*(1-t)*(9+12*Math.cos((x+250)/100*TAU));
    const blend=(1-castingEase(t/.34))*castingEase((x+236)/16)*(1-castingEase((x-170)/15));
    const outer=z+Math.sign(z)*weight*bulge,target=Math.sign(z)*fieldRadius(castY);
    barrelPositions.setZ(i,outer+(target-outer)*blend*weight);
    barrelPositions.setY(i,castY);
  }
  barrel.deleteAttribute('normal');const roundedBarrel=mergeVertices(barrel,1e-4);roundedBarrel.computeVertexNormals();barrel.dispose();
  mesh(roundedBarrel,cast,0,0,0,'Geschwungener Aluminium Zylinderkasten');
  mesh(upward(plan(true),deck-5,5),m.machined,0,0,0,'Bearbeitete Deckfläche und Kühlmantelöffnungen');
  for(const x of CYLINDER_X){
    const profile=[[linerOuter,91],[linerOuter,deck-.6],[linerOuter-.5,deck],[bore,deck],[bore,91]];
    mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),56),iron,x,0,0,'Eingegossene Grauguss Laufbuchse');
  }
  // A hollow lower skirt: its outer wall steps out below the cylinder jacket,
  // while the real recesses remain behind the cast grid instead of painted lines.
  for(const side of [-1,1]){
    const s=new T.Shape();s.moveTo(94,side*(wall-7));s.lineTo(76,side*(wall-1));s.quadraticCurveTo(27,side*(wall+3),-36,side*(wall+4));s.lineTo(-47,side*(wall+7));s.lineTo(-50,side*(wall+5));s.lineTo(-50,side*(wall-8));s.lineTo(-35,side*(wall-11));s.lineTo(43,side*(wall-12));s.lineTo(91,side*(wall-18));s.closePath();
    mesh(alongX(s,628),cast,0,0,-side*18,'Zurückliegende Kurbelgehäusewand hinter tiefen Gusstaschen');
    // A broad middle casting grows into the upper barrels. The triangular
    // negative spaces have actual depth through to the recessed skirt wall.
    const saddle=rounded(-236,25,421,83,6);
    for(const x of [-218,-118,-18,82])slot(saddle,x,75,35,18);
    for(const x of [-177,-77,23,123])slot(saddle,x,40,12,20);
    const saddleGeometry=new T.ExtrudeGeometry(saddle,{depth:16,bevelEnabled:true,bevelSize:2.5,bevelThickness:2.5,bevelSegments:3,curveSegments:10});
    const saddlePositions=saddleGeometry.getAttribute('position');
    for(let i=0;i<saddlePositions.count;i++)saddlePositions.setZ(i,saddlePositions.getZ(i)-side*19*castingEase((saddlePositions.getY(i)-35)/65));
    saddleGeometry.computeVertexNormals();
    mesh(saddleGeometry,cast,0,0,side<0?-wall-13:wall-3,'Breite Gussfelder mit tiefen Galerietaschen');
    const z=side*(wall+10);
    // The B30 photograph has stepped bays, a dense front ladder and a broad
    // triangulated rear bay, rather than a cylinder-pitch rectangular grid.
    for(const y of [-36,-7,24])rib([-301,y,z],[282,y+(y===24?8:0),z],5.5,8);
    rib([-300,25,z],[104,25,z],8,12);rib([104,25,z],[296,40,z],9,12);
    const piers=[[-296,-286,80],[-255,-249,39],[-212,-205,55],[-163,-158,88],[-112,-108,57],[-61,-58,83],[0,5,57],[55,60,89],[108,113,63],[172,180,85]];
    for(const [bottom,top,height] of piers){
      const a=[bottom,-37,z],b=[top,Math.min(height,49),z];
      if(bottom===-163||bottom===55)mesh(castRibWithRoot(a,b,9,18,(_x,y)=>skirtRadius(y),5),cast,0,0,0,'Auslaufender Hauptrippenfuß');
      else rib(a,b,6,18);
    }
    for(const [x,y] of [[-286,-34],[-207,-31],[-158,50],[-108,-34],[-58,51],[5,-33],[60,52],[113,-34],[180,-30]])boss(x,y,side*(wall+15),7.1,3.1,11);
    rib([109,94,z],[298,deck-28,side*(wall+4)],12,12);
    rib([172,51,z],[299,-33,z],11,12);
    // Broad cast shoulders connect the mounting pads into the skirt.
    for(const x of [-173,156])for(const dx of [-23,23]){
      const a=[x+dx,92,side*(wall+3)],b=[x+dx*.65,35,side*(wall+15)];
      if(x===156)mesh(castRibWithRoot(a,b,14,18,(_x,y)=>fieldRadius(y),5.5),cast,0,0,0,'Weich angebundene Trägerschulter');
      else rib(a,b,14,18);
    }
    // Machined sump ledge and mounting ears are part of the block, not a pan.
    const ledge=rounded(-315,-wall-13,630,13,3);
    for(let x=-295;x<=295;x+=59)hole(ledge,x,-wall-6,2.8);
    const rail=upward(ledge,-50,5);if(side>0)rail.rotateY(Math.PI);mesh(rail,m.machined);
    for(const x of [-173,156]){
      const mounting=rounded(x-29,41,58,30,5);for(const dx of [-18,18])hole(mounting,x+dx,56,4.2);
      const g=new T.ExtrudeGeometry(mounting,{depth:13,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:2,curveSegments:12});
      mesh(g,cast,0,0,side<0?-wall-24:wall+11,'Motorträger Auflage');
    }
  }
  // Intake face, traced from the naked block photo: two sensor bosses and the
  // large oil-filter/auxiliary mounting pad at the front, with cored openings.
  for(const x of [-155,154])boss(x,deck-62,-wall-28,14,4.6,20);
  boss(-17,deck-80,-wall-6,8,3.1,10);
  // Photo view 1: irregular oil-filter support flange, three unequal galleries.
  const pad=new T.Shape();pad.moveTo(-307,137);pad.lineTo(-253,137);pad.quadraticCurveTo(-246,137,-246,128);pad.lineTo(-233,104);pad.lineTo(-227,70);pad.quadraticCurveTo(-227,61,-239,61);pad.lineTo(-277,61);pad.lineTo(-281,79);pad.lineTo(-295,79);pad.lineTo(-298,113);pad.lineTo(-307,117);pad.closePath();
  slot(pad,-296,117,40,11);slot(pad,-288,92,38,13);slot(pad,-271,70,33,12);
  for(const [x,y] of [[-300,129],[-253,129],[-289,84],[-236,69]])hole(pad,x,y,3.4);
  mesh(new T.ExtrudeGeometry(pad,{depth:15,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:2,curveSegments:20}),m.machined,0,0,-wall-47,'Anschlussflansch an der Ansaugseite');
  mesh(new T.PlaneGeometry(70,77),m.black,-269.5,99,-wall-8).rotation.y=Math.PI;
  // Four small crosshatched foundry pads are visible between the major ribs.
  for(const x of [-208,-72,66,156]){
    const y=49,surface=(height:number)=>-fieldRadius(height)-1;
    for(const slope of [-.65,.65])for(const offset of [-15,-7.5,0,7.5,15]){
      let a=-11,b=11;
      if(slope>0){a=Math.max(a,(-17-offset)/slope);b=Math.min(b,(17-offset)/slope);}else{a=Math.max(a,(17-offset)/slope);b=Math.min(b,(-17-offset)/slope);}
      if(b>a)rib([x+offset+slope*a,y+a,surface(y+a)],[x+offset+slope*b,y+b,surface(y+b)],1.1,1.8);
    }
  }
  // End faces and seven main-bearing webs retain a genuinely open crank axis.
  for(const x of [-310,310]){
    // Asymmetric end casting: flat deck, outboard round gallery, narrow waist
    // and separate crank opening. Not a symmetric rounded rectangle.
    const face=new T.Shape();
    if(x<0){face.moveTo(-49,-wall-7);face.lineTo(deck,-wall-7);face.lineTo(deck,wall-7);face.quadraticCurveTo(deck-10,wall+2,deck-30,wall+5);face.quadraticCurveTo(158,wall+44,120,wall+40);face.quadraticCurveTo(82,wall+40,69,wall+10);face.lineTo(49,wall+8);face.lineTo(29,wall-3);face.lineTo(-23,wall+1);face.lineTo(-49,wall+9);}
    else{face.moveTo(-49,-wall-12);face.lineTo(-18,-wall-9);face.quadraticCurveTo(17,-wall+3,46,-wall+25);face.lineTo(123,-wall+25);face.lineTo(131,-wall-5);face.lineTo(deck,-wall-5);face.lineTo(deck,wall-5);face.lineTo(131,wall-5);face.lineTo(123,wall-25);face.lineTo(46,wall-25);face.quadraticCurveTo(17,wall-3,-18,wall+9);face.lineTo(-49,wall+12);}
    face.closePath();hole(face,0,0,19);
    slot(face,43,-29,25,31);
    for(const y of [-28,48,deck-22])for(const z of [-wall+11,wall-11])hole(face,y,z,3.5);
    mesh(alongX(face,9),cast,x,0,0,'Stirnfläche mit Kurbelwellenöffnung');
    // Recessed side-gallery rim is part of the end casting, not an extra bolt.
    const gallery=new T.Shape();gallery.absellipse(124,wall+3,42,36,0,TAU,false,0);const opening=new T.Path();opening.absellipse(124,wall+3,34,28,0,TAU,true,0);gallery.holes.push(opening);
    if(x<0)mesh(alongX(gallery,13),cast,x,0,0,'Vorderer Stirnflansch mit Galerierand');
  }
  for(let i=0;i<7;i++){
    const frame=new T.Shape();frame.moveTo(-27,-65);frame.lineTo(12,-65);frame.quadraticCurveTo(55,-56,78,-47);frame.lineTo(78,47);frame.quadraticCurveTo(55,56,12,65);frame.lineTo(-27,65);frame.closePath();hole(frame,0,0,18);
    mesh(alongX(frame,10),cast,-300+i*100,0,0,'Hauptlagersteg');
  }
  root.userData={reference:'User reference ebay 178183100002, 16 inspected photos; dealer-assigned M54B30',featureNames,illustrative:true,boreMm:bore*2,cutaway,cutPlaneZ:cutaway?16:null};
  // All fixed casting detail shares four material batches.
  const batches=new Map<T.Material,T.Mesh[]>();
  for(const child of root.children)if(child instanceof T.Mesh){const material=child.material as T.Material;const parts=batches.get(material)??[];parts.push(child);batches.set(material,parts);}
  for(const [material,parts] of batches){
    if(parts.length<2)continue;
    const geometries=parts.map(part=>{part.updateMatrix();return (part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone()).applyMatrix4(part.matrix);});
    const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!combined)throw new Error('Blockgeometrie konnte nicht gebündelt werden.');
    parts.forEach(part=>{part.removeFromParent();part.geometry.dispose();});const batch=new T.Mesh(combined,material);batch.name=material===cast?'Aluminium Gusskontur und Rippen':'Bearbeitete Blockflächen';root.add(batch);
  }
  if(cutaway){
    // Trim actual triangles on the observer side. A material clipping plane
    // would depend on global renderer state and could silently close the view.
    for(const child of root.children)if(child instanceof T.Mesh){
      const original=child.geometry;child.geometry=clipCastingAtZ(original);original.dispose();
    }
    // Solid section faces between the cylinder arcs keep wall thickness legible.
    const span=Math.sqrt(linerOuter*linerOuter-16*16),intervals:number[][]=[];let start=-314;
    for(const x of CYLINDER_X){intervals.push([start,x-span]);start=x+span;}intervals.push([start,314]);
    const caps=intervals.filter(([a,b])=>b>a).map(([a,b])=>new T.BoxGeometry(b-a,deck-91,.7).toNonIndexed().translate((a+b)/2,(deck+91)/2,16));
    // Close the bearing-web section, keeping the real crank opening free.
    const bearingLip=Math.sqrt(18*18-16*16);
    for(let i=0;i<7;i++)for(const [a,b] of [[-27,-bearingLip],[bearingLip,78]])caps.push(new T.BoxGeometry(10,b-a,.7).toNonIndexed().translate(-300+i*100,(a+b)/2,16));
    const cutFaces=mergeGeometries(caps)!;caps.forEach(g=>g.dispose());mesh(cutFaces,m.machined,0,0,0,'Bearbeitete Schnittkanten');
    root.name='M54B30 gemeinsamer Gussblock im Schnitt';
  }
  return root;
}
