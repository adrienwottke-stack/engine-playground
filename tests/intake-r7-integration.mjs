/** Source adapters for this exclusive native-free fixture. Shared owners can
 * apply the generated identical source diff; this file never edits their files. */
export function intakeR7Integration(name,source){
 if(name==='engine-3d-layout.ts'&&source.includes('...m54IntakeNodes(headOffset)')&&source.includes('routes.push(...m54IntakeRoutes(headOffset))'))return source;
 if(name==='engine-flow-view.ts'&&source.includes('const intakeMetadata=intakeFlowMetadata(specs)')&&source.includes('intakeRouteRate({...route.spec,branch}'))return source;
 if(name==='engine-three.ts'&&source.includes("r.medium==='air'?intakeRouteRate(r,state,cfg,angle,flowActivity)"))return source;
 const replace=(from,to)=>{if(!source.includes(from))throw Error('R7 integration anchor missing: '+name+' '+from.slice(0,60));source=source.replace(from,to);};
 if(name==='engine-3d-layout.ts'){
  source="import {m54IntakeNodes,m54IntakeRoutes} from './engine-intake-layout';\n"+source;
  replace("flowFactor?:number}","flowFactor?:number;intakeGroup?:0|1;bidirectional?:boolean}");
  const connectorStart=source.indexOf('    intakeMouth:'),connectorEnd=source.indexOf('    exhaustCollectors,',connectorStart);if(connectorStart<0||connectorEnd<0)throw Error('R7 connector block missing');
  source=source.slice(0,connectorStart)+'    ...m54IntakeNodes(headOffset),exhaustPorts:CYLINDER_X.map(x=>h(x,226,78)),exhaustHeadPaths,\n'+source.slice(connectorEnd);
  replace('  const intakeHeadPaths=CYLINDER_X.map(x=>[-17,17].map(dx=>[h(x,223,-49),h(x+dx*.55,218,-35),h(x+dx,207,-23)]));\n','');
  const start=source.indexOf('  // Shared centres for the panel filter'),end=source.indexOf('  const fuelNodes=',start);if(start<0||end<0)throw Error('R7 air block missing');
  source=source.slice(0,start)+'  routes.push(...m54IntakeRoutes(headOffset));\n'+source.slice(end);
 }
 if(name==='engine-flow-view.ts'){
  source="import {intakeFlowMetadata,intakeRouteRate} from './engine-intake-flow';\n"+source;
  const start=source.indexOf('  const mainAir='),end=source.indexOf('  const lengths=',start);if(start<0||end<0)throw Error('R7 flow distances block missing');
  source=source.slice(0,start)+'  const intakeMetadata=intakeFlowMetadata(specs);\n'+source.slice(end);
  replace("        if(branch==='main')return 0;\n        if(spec.cylinder!==i+1)return -1e6;\n        return airJoins[i]+(branch==='runner'?0:l.runner);","        return intakeMetadata.offset(spec,i+1);");
  replace('route.rate = flowActivity(route.spec.medium, route.spec.cylinder, branch, state, config, angle) * (route.spec.flowFactor ?? 1);',"route.rate = (route.spec.medium==='air'?intakeRouteRate({...route.spec,branch},state,config,angle,flowActivity):flowActivity(route.spec.medium,route.spec.cylinder,branch,state,config,angle)) * (route.spec.flowFactor ?? 1);");
 }
 if(name==='engine-three.ts'){
  source="import {intakeRouteRate} from './engine-intake-flow';\n"+source;
  replace('r.rate=flowActivity(r.medium,r.cylinder,r.branch,state,cfg,angle)*r.flowFactor;',"r.rate=(r.medium==='air'?intakeRouteRate(r,state,cfg,angle,flowActivity):flowActivity(r.medium,r.cylinder,r.branch,state,cfg,angle))*r.flowFactor;");
 }
 return source;
}
