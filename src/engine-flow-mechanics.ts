import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CYLINDER_X} from './engine-3d-model';
import type {Config} from './model';
import {PISTON_SPEC} from './piston-spec';

/** Authored cutaway detail, sharing the existing wrist-pin/crank datums. No
 * scanned forging, OEM tolerance or rotating-balance validation is implied. */
export function createFlowMechanics(cfg:Config,materials:{metal:T.Material;dark:T.Material},own:<G extends T.BufferGeometry>(g:G)=>G){
  const root=new T.Group();root.name='Freigestellter Kurbeltrieb · Ringpakete und Hubzapfen';
  const r=cfg.engine.boreMm/2-1,rodLength=cfg.engine.rodMm,crankRadius=cfg.engine.strokeMm/2,crown=PISTON_SPEC.compressionHeightMm;
  const merge=(pieces:T.BufferGeometry[])=>{const flat=pieces.map(p=>p.index?p.toNonIndexed():p),g=own(mergeGeometries(flat)!);flat.forEach((p,i)=>{if(p!==pieces[i])p.dispose();});pieces.forEach(p=>p.dispose());return g;};
  const batch=(geometry:T.BufferGeometry,material:T.Material,count:number,name:string)=>{const mesh=new T.InstancedMesh(geometry,material,count);mesh.name=name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);root.add(mesh);return mesh;};
  const ring=(radius:number,tube:number,y:number)=>{const g=new T.TorusGeometry(radius,tube,6,48);g.rotateX(Math.PI/2);g.translate(0,y,0);return g;};
  const journal=(radius:number,length:number)=>{const g=new T.CylinderGeometry(radius,radius,length,32);g.rotateZ(Math.PI/2);return g;};
  const eye=(outer:number,inner:number,width:number)=>{
    const shape=new T.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
    const g=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.6,bevelThickness:.5,curveSegments:24});g.translate(0,0,-width/2);g.rotateY(Math.PI/2);return g;
  };
  // The ring belt has actual reliefs; the two skirt panels leave the pin axis
  // open instead of hiding a wrist pin inside a solid cylinder.
  const profile=[[0,crown-.8],[r*.62,crown-.8],[r*.92,crown],[r,crown-.6],[r,28.5],[r-1,28.5],[r-1,26.5],[r,26.5],[r,24.5],[r-1.1,24.5],[r-1.1,22.5],[r,22.5],[r,19.5],[r-1.2,19.5],[r-1.2,15.5],[r,15.5],[r,12],[r-4,12],[r-4,crown-6],[0,crown-6]].map(([x,y])=>new T.Vector2(x,y));
  const belt=new T.LatheGeometry(profile,48),skirts=[0,Math.PI].map(theta=>{const g=new T.CylinderGeometry(r*.98,r*.95,30,24,1,true,theta-.72,1.44);g.translate(0,-3,0);return g;});
  const pistons=batch(merge([belt,...skirts]),materials.metal,6,'Sechs Kolben · Kronen, Ringnuten und offene Schürzen');
  const rings=batch(merge([ring(r-.5,.7,27.5),ring(r-.5,.7,23.5),ring(r-.6,.55,18.7),ring(r-.6,.55,16.3)]),materials.dark,6,'Kompressionsringe und zweiteiliger Ölabstreifring');
  const wristPins=batch(own(eye(11,7.5,60)),materials.metal,6,'Sechs hohle Kolbenbolzen');
  const beamLength=rodLength-36;
  const web=new T.BoxGeometry(5,beamLength,9),flanges=[-5.5,5.5].map(z=>{const g=new T.BoxGeometry(13,beamLength,2.4);g.translate(0,0,z);return g;});
  const smallEye=eye(15.5,11,13);smallEye.translate(0,rodLength/2,0);const bigEye=eye(24,18,20);bigEye.translate(0,-rodLength/2,0);
  const bolts=[-1,1].map(sign=>{const g=journal(3.2,22);g.translate(0,-rodLength/2-17,sign*15.5);return g;});
  const rods=batch(merge([web,...flanges,smallEye,bigEye,...bolts]),materials.metal,6,'Sechs I-Pleuel · beide Lageraugen und Deckelschrauben');
  const crankPins=batch(own(journal(17.5,34)),materials.metal,6,'Sechs native Hubzapfen');
  const cheekShape=new T.Shape();cheekShape.moveTo(-25,-46);cheekShape.bezierCurveTo(-45,-44,-49,-24,-27,-5);cheekShape.lineTo(-20,crankRadius-5);cheekShape.bezierCurveTo(-20,crankRadius+24,20,crankRadius+24,20,crankRadius-5);cheekShape.lineTo(27,-5);cheekShape.bezierCurveTo(49,-24,45,-44,25,-46);cheekShape.lineTo(-25,-46);
  const cheek=new T.ExtrudeGeometry(cheekShape,{depth:9,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:1.5,bevelThickness:1,curveSegments:16});cheek.translate(0,0,-4.5);cheek.rotateY(Math.PI/2);
  const halves=[-21,21].map(x=>cheek.clone().translate(x,0,0));cheek.dispose();
  const cheeks=batch(merge(halves),materials.dark,6,'Zwölf Kurbelwangen und Gegengewichte');
  const mainPieces:T.BufferGeometry[]=[journal(11,650)];
  for(let i=0;i<7;i++){const g=journal(17,24);g.translate(-300+i*100,0,0);mainPieces.push(g);}
  const flange=eye(37,15,12);flange.translate(327,0,0);mainPieces.push(flange);
  for(let i=0;i<6;i++){const g=journal(3.5,15);const a=i*Math.PI/3;g.translate(328,27*Math.cos(a),27*Math.sin(a));mainPieces.push(g);}
  const shaft=new T.Mesh(merge(mainPieces),materials.metal);shaft.name='Kurbelwelle · sieben Hauptlager und Abtriebsflansch';root.add(shaft);
  const topRim=ring(cfg.engine.boreMm/2+1,1.1,0),lowerRim=ring(cfg.engine.boreMm/2+1,.7,-105);
  const boreRims=batch(merge([topRim,lowerRim]),materials.dark,6,'Sechs Laufbahnkonturen · oben und unten');
  const instances=[pistons,rings,wristPins,rods,crankPins,cheeks,boreRims];
  const matrix=new T.Matrix4(),q=new T.Quaternion(),center=new T.Vector3(),axis=new T.Vector3(),size=new T.Vector3(1,1,1),Y=new T.Vector3(0,1,0),X=new T.Vector3(1,0,0);
  function cylinder(index:number,piston:T.Vector3,pin:T.Vector3,rotation:number,deck:number){
    matrix.compose(piston,q.identity(),size.set(1,1,1));pistons.setMatrixAt(index,matrix);rings.setMatrixAt(index,matrix);wristPins.setMatrixAt(index,matrix);
    center.copy(piston).add(pin).multiplyScalar(.5);axis.copy(piston).sub(pin).normalize();q.setFromUnitVectors(Y,axis);matrix.compose(center,q,size);rods.setMatrixAt(index,matrix);
    matrix.compose(pin,q.identity(),size);crankPins.setMatrixAt(index,matrix);
    center.set(CYLINDER_X[index],0,0);q.setFromAxisAngle(X,rotation);matrix.compose(center,q,size);cheeks.setMatrixAt(index,matrix);
    center.set(CYLINDER_X[index],deck,0);matrix.compose(center,q.identity(),size);boreRims.setMatrixAt(index,matrix);
  }
  return{root,cylinder,finish(driveAngle:number){shaft.rotation.x=driveAngle;for(const mesh of instances)mesh.instanceMatrix.needsUpdate=true;},disposeInstances(){instances.forEach(m=>m.dispose());},diagnostics:{pistons:6,compressionRings:12,oilRingRails:12,rodEyes:12,crankPins:6,crankCheeks:12,mainJournals:7,draws:8}};
}
