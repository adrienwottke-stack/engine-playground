import {mod,pistonGeometry,TAU,type Config} from './model';
import type {ViewState} from './drawing';

export interface ValveCurves { samples:number[][][] }
/** Repeated HTTP snapshots serialize static curves anew; keep their identity
 * until their contents change so renderers retain the prepared cam buffers. */
export function reuseValveCurves(current:ValveCurves|undefined,incoming:ValveCurves):ValveCurves{
  if(current===incoming)return current;
  if(!current||current.samples.length!==incoming.samples.length)return incoming;
  for(let cylinder=0;cylinder<incoming.samples.length;cylinder++){
    const a=current.samples[cylinder],b=incoming.samples[cylinder];if(a.length!==b.length)return incoming;
    for(let sample=0;sample<b.length;sample++){
      if(a[sample].length!==b[sample].length)return incoming;
      for(let valve=0;valve<b[sample].length;valve++)if(a[sample][valve]!==b[sample][valve])return incoming;
    }
  }
  return current;
}
type PhaseState = ViewState & {
  valveCurves?:ValveCurves;
  cycles?:{cylinder:number;samples:(number[]|null)[]}[];
};

/** Native cam profiles, indexed by the same global 720 degree angle as the crank. */
export function valveSample(s:PhaseState|null,angle:number,cylinder:number){
  const curve=s?.valveCurves?.samples[cylinder-1];
  if(!curve?.length)return null;
  const position=mod(angle,TAU*2)/(TAU*2)*curve.length;
  const index=Math.floor(position),fraction=position-index;
  const a=curve[index],b=curve[(index+1)%curve.length];
  if(!a||!b||a.length<2||b.length<2)return null;
  return {
    intakeLiftMm:Math.max(0,a[0]+(b[0]-a[0])*fraction),
    exhaustLiftMm:Math.max(0,a[1]+(b[1]-a[1])*fraction)
  };
}

export function shaftGeometry(angle:number,cylinder:number,cfg:Config,s:ViewState|null){
  const fallback=pistonGeometry(angle,cylinder,cfg.engine.strokeMm,cfg.engine.rodMm);
  if(s?.tdcRad===undefined||!s.journalAngles)return fallback;
  const theta=s.tdcRad-angle+(s.journalAngles[cylinder-1]??0),r=cfg.engine.strokeMm/2,l=cfg.engine.rodMm;
  const crankX=r*Math.cos(theta),crankY=-r*Math.sin(theta),pistonY=crankY-Math.sqrt(l*l-crankX*crankX);
  return {...fallback,crankX,crankY,pistonY,travel:pistonY+l+r};
}
export function cycleSample(s:PhaseState|null,angle:number,cylinder:number,slow:boolean){
  const valves=valveSample(s,angle,cylinder);
  if(!slow){const current=s?.cylinders?.[cylinder-1];return current?{...current,...valves}:null;}
  const cycle=s?.cycles?.find(item=>item.cylinder===cylinder)??(s?.cycle?.cylinder===cylinder?s.cycle:undefined);
  if(!cycle?.samples.length)return null;
  const index=Math.floor(mod(angle,TAU*2)/(TAU*2)*cycle.samples.length),row=cycle.samples[index];
  return row?{pressureKpa:row[0],gasTemperatureK:row[1],intakeLiftMm:row[2],exhaustLiftMm:row[3],intakeMolS:row[4],exhaustMolS:row[5],burning:!!row[6],fuelFraction:0,...valves}:null;
}
