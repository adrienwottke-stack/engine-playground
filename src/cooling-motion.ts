import {shaftGeometry} from './native-view';
import {mod,type Config} from './model';
import type {ViewState} from './drawing';

// Same native journal offsets, TDC and slider-crank geometry as the mechanics view.
export function coolingCylinderPose(angle:number,cylinder:number,cfg:Config,state:ViewState|null){
 const g=shaftGeometry(angle,cylinder,cfg,state),scale=.43,axis=52+(cylinder-1)*42;
 const wristY=157+g.pistonY*scale;
 return {axis,wristY,pistonTop:wristY-14,pinX:axis+g.crankX*scale,pinY:157+g.crankY*scale};
}
export type FluidPoint=[number,number];
// Stable spacing along a path: changing flow changes velocity, not particle identity.
export function fluidMarkers(points:FluidPoint[],phase:number,spacing=24){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);
 if(!total)return [];
 const result=[];
 for(let distance=mod(phase,spacing);distance<total;distance+=spacing){
  let d=distance,k=0;while(k<lengths.length-1&&d>=lengths[k])d-=lengths[k++];
  const a=points[k],b=points[k+1],f=lengths[k]?d/lengths[k]:0;
  result.push({x:a[0]+(b[0]-a[0])*f,y:a[1]+(b[1]-a[1])*f,angle:Math.atan2(b[1]-a[1],b[0]-a[0]),fraction:distance/total});
 }
 return result;
}
