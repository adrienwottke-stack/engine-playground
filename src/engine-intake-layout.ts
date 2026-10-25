import {CYLINDER_X} from './engine-3d-model';

export type IntakeRoute={medium:'air';coords:number[][];radius:number;cylinder?:number;branch:string;internal:boolean;flowFactor:number;intakeGroup?:0|1;bidirectional?:boolean};
export type IntakePassage={id:string;coords:number[][];width:number;height:number;section:'round'|'moulded'|'port';axis?:'x'|'z';capStart?:boolean;capEnd?:boolean;group?:0|1;cylinder?:number;rootWidth?:number};

/** Photo-informed display coordinates, not measured OEM coordinates. Shared by
 * shell, section and flow; fixed head centres remain the installation boundary. */
export function m54IntakeNodes(headOffset=0){
  const h=(x:number,y:number,z:number)=>[x,y+headOffset,z],axis=[0,.8,-.6],throttle=h(-12,91,-250),axial=(distance:number)=>throttle.map((v,i)=>v+axis[i]*distance);
  const runnerNodes=CYLINDER_X.map(x=>h(x,151,-224));
  const runners=CYLINDER_X.map((x,i)=>{
    const sign=Math.sign(x),fan=x*1.055+(Math.abs(x)<100?sign*22:0);
    return [runnerNodes[i],h(fan,161,-262),h(fan,211,-276),h(x*1.025,246,-226),h(x,249,-154),h(x,234,-103),h(x,226,-78)];
  });
  const resonance=h(0,142,-296),throttleOutlet=axial(24),throttleInlet=axial(-24);
  const feed=[throttleOutlet,axial(39),h(-10,139,-289),resonance];
  const feeds=[-1,1].map(sign=>[h(sign*240,142,-296),h(sign*275,126,-280),h(sign*279,133,-250),h(sign*265,151,-224),h(sign*250,151,-224)]);
  const galleries=[[-286,-250,-150,-50,-18],[18,50,150,250,286]].map(xs=>xs.map(x=>h(x,151,-224)));
  const coupling=[h(-50,151,-224),h(0,151,-224),h(50,151,-224)];
  const maf=h(-352,143,-295),boot=[h(-314,143,-295),h(-234,111,-326),h(-123,64,-321),h(-46,47,-260),axial(-42),throttleInlet];
  const idleTap=boot[2],idleInlet=h(-66,66,-286),idleValve=h(-39,103,-258),idleDistribution=CYLINDER_X.map(x=>h(x,239,-96));
  return {headOffset,throttle,throttleAxis:axis,throttleInlet,throttleOutlet,plenumFeed:resonance,plenumFront:h(-280,122,-296),plenumRear:h(280,122,-296),disa:h(0,151,-329),disaPivot:h(0,151,-224),
    intakeMouth:h(-551,83,-295),airboxLower:h(-470,90,-295),airboxUpper:h(-450,130,-295),airboxOutlet:h(-390,143,-295),maf,intakeBoot:boot,
    intakePorts:CYLINDER_X.map(x=>h(x,226,-78)),injection:CYLINDER_X.map(x=>h(x,223,-95)),
    intakeHeadPaths:CYLINDER_X.map(x=>[-17,17].map(dx=>[h(x,223,-49),h(x+dx*.55,218,-35),h(x+dx,207,-23)])),
    resonance,runnerNodes,runners,feeds,galleries,coupling,feed,idleTap,idleInlet,idleValve,idleDistribution};
}

export function m54IntakePassages(headOffset=0,extraDepth=0):IntakePassage[]{
  const n=m54IntakeNodes(headOffset),h=(x:number,y:number,z:number)=>[x,y+headOffset,z];
  const out:IntakePassage[]=[
    {id:'resonance',coords:[-286,-264,-144,0,144,264,286].map(x=>h(x,142,-296-extraDepth/2)),width:27,height:30+extraDepth/2,section:'moulded',axis:'x',capStart:true,capEnd:true},
    ...n.galleries.map((coords,group)=>({id:`gallery-${group}`,coords,width:30,height:31,section:'moulded' as const,axis:'x' as const,capStart:true,capEnd:true,group:group as 0|1})),
    {id:'inlet',coords:n.feed,width:34,height:34,section:'round'},
    {id:'coupling',coords:n.coupling,width:23,height:25,section:'moulded',axis:'x'},
  ];
  n.feeds.forEach((coords,group)=>out.push({id:`resonance-feed-${group}`,coords,width:26,height:27,section:'moulded',group:group as 0|1}));
  n.runners.forEach((coords,i)=>out.push({id:`runner-${i+1}`,coords,width:29,height:23,rootWidth:36,section:'port',cylinder:i+1,group:i<3?0:1}));
  return out;
}

/** True branch graph: both groups remain fed with DISA closed. The coupling is
 * additional; it never disconnects half the engine or rewrites a native state. */
export function m54IntakeRoutes(headOffset=0,disaOpen=false):IntakeRoute[]{
  const n=m54IntakeNodes(headOffset),routes:IntakeRoute[]=[],add=(coords:number[][],radius:number,branch:string,cylinder?:number,intakeGroup?:0|1)=>routes.push({medium:'air',coords,radius,branch,cylinder,intakeGroup,internal:true,flowFactor:1});
  add([n.intakeMouth,n.airboxLower,n.airboxUpper,n.airboxOutlet,n.maf,...n.intakeBoot,n.throttle,...n.feed],24,'main');
  for(const group of [0,1] as const){const sign=group===0?-1:1,order=group===0?[0,1,2]:[5,4,3];add([n.resonance,...[96,192].map(x=>[sign*x,n.resonance[1],n.resonance[2]]),...n.feeds[group],...order.slice(1).map(i=>n.runnerNodes[i])],23,`intake-${group===0?'front':'rear'}`,undefined,group);}
  for(let i=0;i<6;i++){
    add([...n.runners[i].slice(0,-1),n.injection[i],n.intakePorts[i],n.intakeHeadPaths[i][0][0]],14,'runner',i+1,i<3?0:1);
    for(let v=0;v<2;v++){add(n.intakeHeadPaths[i][v],9,v===0?'head-intake-left':'head-intake-right',i+1,i<3?0:1);routes.at(-1)!.flowFactor=.5;}
  }
  const rail=n.idleDistribution;
  add([n.idleTap,n.idleInlet,n.idleValve,rail[2]],7,'idle-supply');
  for(let i=0;i<6;i++)add([rail[2],...rail.slice(Math.min(i,2),Math.max(i,2)+1).sort((a,b)=>i<2?b[0]-a[0]:a[0]-b[0]),[CYLINDER_X[i],225+headOffset,-65],n.intakeHeadPaths[i][0][0]],2.7,'idle',i+1,i<3?0:1);
  if(disaOpen){add(n.coupling,17,'disa-coupling');routes.at(-1)!.bidirectional=true;}
  // Remove repeated junction controls, never create a zero-length path segment.
  for(const route of routes)route.coords=route.coords.filter((p,i,a)=>!i||p.some((v,j)=>v!==a[i-1][j]));
  return routes;
}
