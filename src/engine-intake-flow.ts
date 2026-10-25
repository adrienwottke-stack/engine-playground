import * as T from 'three';
import type {Config} from './model';
import type {ViewState} from './drawing';

type Spec={medium:string;branch?:string;cylinder?:number;coords:number[][];intakeGroup?:0|1;bidirectional?:boolean};
const key=(p:number[])=>p.map(v=>v.toFixed(6)).join(':');

/** Distances through a branched graph, never inferred by searching a single
 * main tube for every runner. No native pressure or DISA signal is invented. */
export function intakeFlowMetadata(routes:Spec[]){
  const air=routes.filter(r=>r.medium==='air'&&!r.branch?.startsWith('idle')&&r.branch!=='disa-coupling'),graph=new Map<string,{to:string;distance:number}[]>(),lengths=new Map<Spec,number>();
  for(const route of air){
    const curve=new T.CatmullRomCurve3(route.coords.map(p=>new T.Vector3(...p)),false,'centripetal'),samples=curve.getLengths();lengths.set(route,samples.at(-1)!);
    const distanceAt=(t:number)=>{const u=t*(samples.length-1),i=Math.min(samples.length-2,Math.floor(u));return T.MathUtils.lerp(samples[i],samples[i+1],u-i);};
    for(let i=1;i<route.coords.length;i++){const a=key(route.coords[i-1]),b=key(route.coords[i]),distance=distanceAt(i/(route.coords.length-1))-distanceAt((i-1)/(route.coords.length-1));const edges=graph.get(a)??[];edges.push({to:b,distance});graph.set(a,edges);if(route.bidirectional){const back=graph.get(b)??[];back.push({to:a,distance});graph.set(b,back);}}
  }
  const main=air.find(r=>r.branch==='main'),distances=new Map<string,number>();
  if(main){distances.set(key(main.coords[0]),0);const queue=[key(main.coords[0])];while(queue.length){queue.sort((a,b)=>distances.get(b)!-distances.get(a)!);const a=queue.pop()!,distance=distances.get(a)!;for(const edge of graph.get(a)??[]){const next=distance+edge.distance;if(next<(distances.get(edge.to)??Infinity)){distances.set(edge.to,next);queue.push(edge.to);}}}}
  const offset=(route:Spec,cylinder:number)=>{
    if(route.branch?.startsWith('idle')||route.branch==='disa-coupling')return -1e6;
    if(route.cylinder&&route.cylinder!==cylinder)return -1e6;
    const group=route.intakeGroup??(route.branch==='intake-front'?0:route.branch==='intake-rear'?1:undefined);
    if(group!==undefined&&(cylinder<=3?0:1)!==group)return -1e6;
    return distances.get(key(route.coords[0]))??-1e6;
  };
  return{offset,length:(route:Spec)=>lengths.get(route)??0,distances};
}

/** Group totals come from existing per-cylinder native samples. Idle/DISA
 * transport has no measured native channel here, so it remains unanimated. */
export function intakeRouteRate(route:{branch?:string;cylinder?:number},state:ViewState|null,cfg:Config,angle:number,sample:(medium:'air',cylinder:number|undefined,branch:string,state:ViewState|null,cfg:Config,angle:number)=>number){
  const branch=route.branch??'main';if(branch.startsWith('idle')||branch==='disa-coupling')return 0;
  const group=branch==='intake-front'?[1,2,3]:branch==='intake-rear'?[4,5,6]:null;
  return group?group.reduce((sum,cylinder)=>sum+sample('air',cylinder,'runner',state,cfg,angle),0):sample('air',route.cylinder,branch,state,cfg,angle);
}
