import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {engineRoutes} from './engine-3d-layout';
import type {EnginePresentation,PipeMode} from './engine-3d-model';

type MaterialFactory=(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial;
const hoseBranches=new Set(['radiator','radiator-return','expansion-vent','expansion-return']);

/** Physical shells share their centre lines with coolant flow. No independent
 * decorative tubes or approximate endpoints can drift away from the circuit. */
export function createM54CoolingPlumbing(headOffset:number,mat:MaterialFactory){
  const root=new T.Group();root.name='Geformte Kuehlerschlaeuche an gemeinsamen Anschluessen';
  const rubber=mat(0x121e23,.02,.87),coupler=mat(0x24343b,.12,.71);
  const hoses:{branch:string;curve:T.CatmullRomCurve3;radius:number;endpoints:number[][]}[]=[],shells:T.BufferGeometry[]=[],cuffs:T.BufferGeometry[]=[];
  for(const route of engineRoutes(headOffset).filter(route=>route.medium==='water'&&hoseBranches.has(route.branch??''))){
    const curve=new T.CatmullRomCurve3(route.coords.map(point=>new T.Vector3().fromArray(point)),false,'centripetal');
    const radius=route.radius+.8;shells.push(new T.TubeGeometry(curve,64,radius,14,false));
    hoses.push({branch:route.branch!,curve,radius,endpoints:[route.coords[0],route.coords.at(-1)!].map(point=>[...point])});
    for(const end of [0,1]){
      const u=end===0?Math.min(.1,7/curve.getLength()):1-Math.min(.1,7/curve.getLength()),position=curve.getPointAt(u),tangent=curve.getTangentAt(u);
      const geometry=new T.CylinderGeometry(radius+1.6,radius+1.6,13,24,1,true);
      geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),tangent));geometry.translate(position.x,position.y,position.z);cuffs.push(geometry);
    }
  }
  const shellGeometry=mergeGeometries(shells)!;shells.forEach(shell=>shell.dispose());
  const shell=new T.Mesh(shellGeometry,rubber);shell.name='Zusammengefasste geformte Kuehlerschlaeuche';root.add(shell);
  const geometry=mergeGeometries(cuffs)!;cuffs.forEach(cuff=>cuff.dispose());
  const fittings=new T.Mesh(geometry,coupler);fittings.name='An den vorhandenen Stutzen sitzende Schlauchenden';root.add(fittings);
  root.userData={layout:'shared-coolant-routes',branches:hoses.map(hose=>hose.branch),revision:'formed-hoses-r6'};
  return {root,hoses,materials:[rubber,coupler]};
}

export function setCoolingPlumbingPresentation(plumbing:ReturnType<typeof createM54CoolingPlumbing>,presentation:EnginePresentation,mode:PipeMode){
  plumbing.root.visible=presentation!=='flow'&&mode!=='off';
  const inspection=presentation==='cutaway';
  for(const material of plumbing.materials){
    if(material.transparent!==inspection){material.transparent=inspection;material.needsUpdate=true;}
    material.opacity=inspection?.22:1;material.depthWrite=!inspection;
  }
}
