import {m54IntakeNodes,m54IntakeRoutes} from './engine-intake-layout';
import {CYLINDER_X,type Medium} from './engine-3d-model';

export type RouteSpec={medium:Medium;coords:number[][];radius:number;cylinder?:number;branch?:string;closed?:boolean;internal?:boolean;flowFactor?:number;intakeGroup?:0|1;bidirectional?:boolean};

/** One connector catalogue is used by the plumbing, casings and inspection tests.
 * Dimensions are an authored cutaway, not a scanned BMW part or a coolant CFD mesh. */
export function assemblyConnectors(headOffset=0){
  const h=(x:number,y:number,z:number)=>[x,y+headOffset,z];
  const exhaustHeadPaths=CYLINDER_X.map(x=>[-17,17].map(dx=>[h(x+dx,207,23),h(x+dx*.55,218,35),h(x,223,49)]));
  const tails=[[1012,-61,190],[1012,-61,264]];
  // Keep each cast outlet, neck and catalyst on one vertical axis.
  const exhaustCollectors=[h(-160,166,178),h(160,166,178)];
  const catalystInlets=[h(-160,153,178),h(160,153,178)],catalystOutlets=[h(-160,17,178),h(160,17,178)];
  const catalysts=catalystInlets.map((point,i)=>point.map((v,j)=>(v+catalystOutlets[i][j])/2));
  const exhaustDownpipes=[
    [catalystOutlets[0],[-160,-26,178],[-124,-61,190],[330,-61,190],[445,-61,190]],
    [catalystOutlets[1],[160,-26,204],[225,-61,264],[350,-61,264],[445,-61,264]],
  ];
  return {
    ...m54IntakeNodes(headOffset),exhaustPorts:CYLINDER_X.map(x=>h(x,226,78)),exhaustHeadPaths,
    exhaustCollectors,catalysts,catalystInlets,catalystOutlets,exhaustDownpipes,
    // The two exhaust banks remain separate through paired silencer chambers.
    exhaustBankNodes:[[445,-61,190],[445,-61,264]],middleSilencers:[[475,-61,190],[475,-61,264]],rearSilencers:[[878,-61,190],[878,-61,264]],tails,
    exhaustMerge:[445,-61,227],middleSilencer:[475,-61,227],rearSilencer:[878,-61,227],tail:tails[0],
    pump:[-344,63,-30],thermostat:h(-326,194,-45),radiatorUpper:[-470,202,-78],radiatorLower:[-470,28,66],
    expansionTop:[-447,218,-204],expansionBottom:[-447,139,-204],sump:[0,-70,0],
    bounds:{min:[-560,-146,-380],max:[1039,342+headOffset,313]},
  };
}

/** Curves run through the same physical connector centres as the outer parts. */
export function engineRoutes(headOffset=0):RouteSpec[]{
  const routes:RouteSpec[]=[],n=assemblyConnectors(headOffset);
  const add=(medium:Medium,coords:number[][],radius:number,cylinder?:number,branch='main',internal=false,flowFactor=1)=>routes.push({medium,coords,radius,cylinder,branch,internal,flowFactor});
  const head=(x:number,y:number,z:number)=>[x,y+headOffset,z];

  routes.push(...m54IntakeRoutes(headOffset));
  const fuelNodes=CYLINDER_X.map(x=>head(x-7,258,-130));
  add('fuel',[[-365,115,-130],head(-349,258,-130),head(-280,258,-130),...fuelNodes,head(285,258,-130)],4.5);
  for(let i=0;i<CYLINDER_X.length;i++){
    const x=CYLINDER_X[i];
    add('fuel',[fuelNodes[i],head(x-7,243,-117),n.injection[i]],2,i+1,'injector',true);
  }

  // Photo-referenced compact three-port manifolds, with their real media paths
  // inside the wider, joined exterior shell rather than exposed thin headers.
  for(let i=0;i<CYLINDER_X.length;i++){
    const x=CYLINDER_X[i],collector=n.exhaustCollectors[i<3?0:1];
    for(let v=0;v<2;v++)add('exhaust',n.exhaustHeadPaths[i][v],9,i+1,v===0?'head-exhaust-left':'head-exhaust-right',true,.5);
    const center=i<3?-150:150;
    add('exhaust',[n.exhaustHeadPaths[i][0].at(-1)!,n.exhaustPorts[i],head(x,220,108),head(x,213,135),head(x,205,173),head(center+(x-center)*.56,201,186),head(collector[0]+(x-center)*.2,192,174),collector],13,i+1,'header',true);
  }
  // Close-coupled M54-style cats sit immediately below each 3-into-1 collector.
  for(let i=0;i<2;i++){
    const collector=n.exhaustCollectors[i],cat=n.catalysts[i],z=n.exhaustBankNodes[i][2],suffix=i===0?'front':'rear';
    add('exhaust',[collector,n.catalystInlets[i],cat,...n.exhaustDownpipes[i]],19,undefined,`collector-${suffix}`);
    const tailInlet=[n.rearSilencers[i][0]+75,-61,z];
    add('exhaust',[n.exhaustBankNodes[i],n.middleSilencers[i],[629,-61,z],n.rearSilencers[i],tailInlet],20,undefined,`main-${suffix}`);
    // The hollow finisher supplies this shell. Keep the flow centreline without
    // an overlapping bright tube through the dark inner wall.
    add('exhaust',[tailInlet,n.tails[i]],20,undefined,`tail-${suffix}`,true);
  }

  // Embedded lateral jacket passages replace free-standing loops through the bores.
  const pump=n.pump,thermostat=n.thermostat;
  const waterIn=CYLINDER_X.map(x=>[x,82,-52]),waterOut=CYLINDER_X.map(x=>head(x,194,-52));
  add('water',[pump,[-294,82,-52],...waterIn],6,undefined,'main',true);
  for(let i=0;i<CYLINDER_X.length;i++){
    const x=CYLINDER_X[i];
    add('water',[waterIn[i],[x,110,-53],head(x,155,-53),waterOut[i]],5,undefined,'jacket',true);
  }
  add('water',[...[...waterOut].reverse(),head(-294,194,-52),thermostat],6,undefined,'main',true);
  // Formed exterior hoses follow their actual fittings and clear both belt
  // planes. Their media live inside the separately authored rubber shells.
  add('water',[thermostat,head(-352,194,-51),head(-388,211,-95),[-435,202,-78],n.radiatorUpper],10,undefined,'radiator',true);
  add('water',[n.radiatorUpper,[-470,202,66],n.radiatorLower],5,undefined,'radiator-core',true);
  add('water',[n.radiatorLower,[-446,28,66],[-425,16,117],[-391,20,117],[-358,57,42],[-344,63,-8],pump],10,undefined,'radiator-return',true);
  // The short bypass belongs to the engine housing, not a loose external loop.
  add('water',[thermostat,head(-350,160,-28),[-350,95,-28],pump],6,undefined,'bypass',true);
  add('water',[thermostat,head(-354,219,-91),[-405,229,-173],n.expansionTop],2,undefined,'expansion-vent',true);
  add('water',[n.expansionBottom,[-447,121,-204],[-426,102,-211],[-371,86,-198],[-350,77,-104],pump],3,undefined,'expansion-return',true);

  // Oil is a circulation illustration, with one pickup and both camshaft returns.
  const sump=n.sump,oilFeed=[-295,6,-64],oilTop=head(-295,279,0);
  const oilNodes=CYLINDER_X.map(x=>[x,6,-64]);
  add('oil',[sump,[-265,-70,-45],[-295,-39,-64],oilFeed],3,undefined,'pickup',true);
  add('oil',[oilFeed,...oilNodes],3,undefined,'gallery',true);
  for(let i=0;i<CYLINDER_X.length;i++){
    const x=CYLINDER_X[i];
    add('oil',[oilNodes[i],[x,6,-36],[x,0,0]],2.2,undefined,'bearing',true);
  }
  add('oil',[oilFeed,[-310,80,-64],head(-310,225,-64),oilTop],3,undefined,'head-feed',true);
  for(const z of [-23,23]){
    const start=head(-295,279,z),end=head(295,279,z);
    add('oil',[oilTop,start],2.2,undefined,'head-split',true);
    add('oil',[start,...CYLINDER_X.map(x=>head(x,279,z)),end],2.2,undefined,'cam-gallery',true);
    add('oil',[end,head(310,230,z<0?-50:50),[315,40,z<0?-64:64],[280,-53,z<0?-40:40],sump],2.2,undefined,'return',true);
  }
  return routes;
}
