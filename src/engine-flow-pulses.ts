import {Vector4} from 'three';
import {mod,TAU} from './model';
import type {ViewState} from './drawing';

export const FLOW_PULSE_TRAVEL_PER_CYCLE=2600;
/** Travel distance and packet width are authored visual scales in mm per720°,
 * not measured gas speed, pressure waves, fuel timing or a CFD solution. */
export function writeNativeFlowPulses(target:Vector4[],state:ViewState|null,angle:number,medium:'air'|'exhaust',heatTarget?:number[]){
  const phase=mod(angle,TAU*2)/(TAU*2),running=(state?.rpm??0)>5;
  for(let i=0;i<6;i++){
    const out=target[i];out.set(0,1,0,0);if(heatTarget)heatTarget[i]=0;if(!running)continue;
    const cycle=state?.cycles?.find(c=>c.cylinder===i+1)??(state?.cycle?.cylinder===i+1?state.cycle:undefined);if(!cycle)continue;
    const samples=cycle.samples,count=samples.length,column=medium==='air'?4:5;if(count<2)continue;
    // Scan existing records without allocating a queue or assuming immutable
    // cycle arrays. The nearest recorded onset also works across720° and scrub.
    const current=Math.floor(phase*count);
    for(let step=0;step<count;step++){
      const index=mod(current-step,count),value=samples[index]?.[column]??0,before=samples[mod(index-1,count)]?.[column]??0;
      if(!(value>1e-6)||before>1e-6)continue;
      let width=1,peak=value;while(width<count&&(samples[(index+width)%count]?.[column]??0)>1e-6){peak=Math.max(peak,samples[(index+width)%count]![column]);width++;}
      const start=index/count,age=mod(phase-start,1);
      if(heatTarget)heatTarget[i]=Math.max(0,Math.min(1,((samples[index]?.[1]??400)-400)/1900));
      out.set(age*FLOW_PULSE_TRAVEL_PER_CYCLE,Math.max(44,Math.min(155,width/count*FLOW_PULSE_TRAVEL_PER_CYCLE*.28)),Math.min(1,Math.sqrt(peak)*1.4),start);break;
    }
  }
}
