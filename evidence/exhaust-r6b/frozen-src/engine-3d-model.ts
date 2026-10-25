import {shaftGeometry,cycleSample,valveSample,type ValveCurves} from './native-view';
import {mod,TAU} from './model';
import type {ViewState} from './drawing';
import type {Config} from './model';
import {PISTON_SPEC} from './piston-spec';

export const CYLINDER_X=[-250,-150,-50,50,150,250];
export type Medium='air'|'fuel'|'exhaust'|'water'|'oil';
export type PipeMode='solid'|'transparent'|'flow'|'off';
export type EnginePresentation='closed'|'cutaway'|'flow';
export function presentationVisibility(presentation:EnginePresentation){
  return {mechanical:presentation==='cutaway',extras:presentation!=='flow',housing:presentation!=='flow',closedHousing:presentation==='closed',cutHousing:presentation==='cutaway',media:presentation!=='closed',pipes:presentation!=='flow',combustion:presentation!=='closed',floor:presentation!=='flow'};
}
export const MEDIA:{id:Medium;name:string;color:number}[]=[
  {id:'air',name:'Luft',color:0x377fff},{id:'fuel',name:'Benzin',color:0xecc575},
  {id:'exhaust',name:'Abgas',color:0xeda179},{id:'water',name:'Wasser',color:0x75b8e1},{id:'oil',name:'Öl',color:0xc9b579}
];
export function pipeVisibility(mode:PipeMode){return {pipe:mode==='solid'||mode==='transparent',flow:mode!=='off',opacity:mode==='transparent'?.16:1};}
export function mechanismPose(angle:number,cylinder:number,cfg:Config,state:ViewState|null){
  const g=shaftGeometry(angle,cylinder,cfg,state),x=CYLINDER_X[cylinder-1];
  return {piston:[x,-g.pistonY,0] as const,pin:[x,-g.crankY,g.crankX] as const,rotation:Math.atan2(g.crankX,-g.crankY)};
}
/** Illustration dimensions share the native wrist-pin, rod and crank datum. */
export function assemblyDimensions(cfg:Config){
  const crankRadius=cfg.engine.strokeMm/2,deck=cfg.engine.rodMm+crankRadius+PISTON_SPEC.compressionHeightMm+PISTON_SPEC.illustrativeCrownClearanceMm;
  return {deck,headOffset:deck-205,boreScale:cfg.engine.boreMm/84,crankRadius};
}
/** The head seat stays fixed; the retainer moves down and compresses the spring. */
export function valveSpringPose(lift:number){
  const travel=Number.isFinite(lift)?Math.max(0,Math.min(32,lift)):0;
  const bottom=215,top=249-travel;
  return {bottom,top,center:(bottom+top)/2,length:top-bottom};
}
/** Radial lift illustration; build once per curve set, rotate by crank angle / 2. */
export function camProfileRadius(curves:ValveCurves|null|undefined,cylinder:number,type:0|1,phi:number){
  const lift=valveSample(curves?{valveCurves:curves}:null,2*(Math.PI-phi),cylinder);
  return 12+(type===0?lift?.intakeLiftMm??0:lift?.exhaustLiftMm??0);
}
/** Native gas signs / thermal branch flow. Oil is a direction illustration only. */
export function flowActivity(medium:Medium,cylinder:number|undefined,branch:string,state:ViewState|null,cfg:Config,angle:number){
  if(!state)return 0;
  if(medium==='water'){
    if(state.thermalHalted)return 0;
    // The M52 workshop shows a mechanically driven pump. Thermal-only callers
    // can omit RPM; a connected motor at rest must not show pumped circulation.
    if(state.rpm!==undefined&&state.rpm<5)return 0;
    const total=cfg.cooling.flowLMin,rad=Math.max(0,Math.min(total,state.radiatorFlowLMin??0));
    if(branch==='expansion-vent'||branch==='expansion-return')return 0;
    return branch.startsWith('radiator')?rad:branch==='bypass'?total-rad:total;
  }
  if(medium==='oil')return (state.rpm??0)>5?1:0;
  if((state.rpm??0)<5)return 0;
  const cylinders=cylinder?[cylinder]:medium==='exhaust'&&branch.endsWith('-front')?[1,2,3]:medium==='exhaust'&&branch.endsWith('-rear')?[4,5,6]:[1,2,3,4,5,6];
  const samples=cylinders.map(id=>cycleSample(state,angle,id,true));
  if(medium==='fuel')return state.ignition?samples.reduce((sum,s)=>sum+Math.max(0,s?.intakeMolS??0),0):0;
  return samples.reduce((sum,s)=>sum+(medium==='air'?(s?.intakeMolS??0):(s?.exhaustMolS??0)),0);
}

/** The flame front is indexed into the same recorded native 720° cycle as the
 * piston and valves. No independent cylinder offsets or synthetic firing order. */
export function combustionAppearance(state:ViewState|null,angle:number,cylinder:number){
  const sample=cycleSample(state,angle,cylinder,true),running=(state?.rpm??0)>5;
  const burning=running&&state?.ignition!==false&&!!sample?.burning;
  const cycle=state?.cycles?.find(item=>item.cylinder===cylinder)??(state?.cycle?.cylinder===cylinder?state.cycle:undefined);
  let progress=0;
  if(burning&&cycle?.samples.length){
    const rows=cycle.samples,count=rows.length,position=mod(angle,TAU*2)/(TAU*2)*count,index=Math.floor(position);
    let before=0,after=0;
    while(before<count-1&&rows[mod(index-before-1,count)]?.[6])before++;
    while(after<count-before-1&&rows[(index+after+1)%count]?.[6])after++;
    progress=Math.max(.02,Math.min(1,(before+(position-index))/(before+after+1)));
  }
  const heat=sample?Math.max(0,Math.min(1,(sample.gasTemperatureK-400)/1900)):0;
  const pressure=sample?Math.max(0,Math.min(1,(sample.pressureKpa-100)/4200)):0;
  const intake=running?Math.max(0,sample?.intakeMolS??0):0,exhaust=running?Math.max(0,sample?.exhaustMolS??0):0;
  let afterNativeBurn=false;
  if(!burning&&cycle?.samples.length){
    const rows=cycle.samples,count=rows.length,index=Math.floor(mod(angle,TAU*2)/(TAU*2)*count);
    // Hot compression must not be labeled combustion expansion. Look backward
    // only through the recorded native cycle until burn or an open gas valve.
    for(let step=1;step<count;step++){
      const row=rows[mod(index-step,count)];if(!row)break;
      if(row[6]){afterNativeBurn=true;break;}
      if(row[2]>.05||row[3]>.05||row[4]>1e-6||row[5]>1e-6)break;
    }
  }
  const stage: 'idle'|'intake'|'compression'|'kernel'|'front'|'expansion'|'exhaust'=burning?(progress<.16?'kernel':'front'):exhaust>1e-6?'exhaust':intake>1e-6?'intake':running&&heat>.15&&afterNativeBurn?'expansion':running&&!!sample?'compression':'idle';
  return {available:!!sample,burning,progress,heat,pressure,intake,exhaust,stage};
}
