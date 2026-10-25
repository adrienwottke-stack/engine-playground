import test from 'node:test';
import assert from 'node:assert/strict';
import {CatmullRomCurve3,Vector3} from 'three';
import {engineRoutes,assemblyConnectors,type RouteSpec} from '../src/engine-3d-layout';
import {CYLINDER_X,type Medium} from '../src/engine-3d-model';

const offsets=[110+60/2+28-205,0,170+105/2+28-205];
const curve=(r:RouteSpec)=>new CatmullRomCurve3(r.coords.map(p=>new Vector3(...p)),r.closed??false,'centripetal');
const key=(p:number[])=>p.map(v=>Math.abs(v)<1e-9?'0':v.toFixed(8)).join(':');
const near=(a:Vector3,b:number[],message:string)=>assert.ok(a.distanceTo(new Vector3(...b))<1e-8,message);

/** Endpoints use the very same arc-length evaluation as particles. */
function end(route:RouteSpec,side:0|1){return curve(route).getPointAt(side).toArray();}
function joins(route:RouteSpec,node:number[]){
  const index=route.coords.findIndex(p=>key(p)===key(node));
  assert.notEqual(index,-1,`${route.medium}/${route.branch} has a shared junction`);
  // A control point must be on the actual interpolated centerline, not beside it.
  near(curve(route).getPoint(index/(route.coords.length-1)),node,'junction lies on rendered centerline');
}
function canReach(routes:RouteSpec[],medium:Medium,from:number[],to:number[]){
  const graph=new Map<string,Set<string>>();
  for(const r of routes.filter(r=>r.medium===medium))for(let i=1;i<r.coords.length;i++){
    const a=key(r.coords[i-1]),b=key(r.coords[i]);
    const next=graph.get(a)??new Set<string>();next.add(b);graph.set(a,next);
  }
  const todo=[key(from)],seen=new Set<string>();
  while(todo.length){const p=todo.pop()!;if(p===key(to))return true;if(seen.has(p))continue;seen.add(p);todo.push(...graph.get(p)??[]);}
  return false;
}

test('rendered pipe paths stay finite and have no zero-length segments at geometry extremes',()=>{
  for(const offset of offsets){
    const routes=engineRoutes(offset);assert.ok(routes.length<100,'paired head channels stay within the batched route budget');
    for(const r of routes){
      assert.ok(r.radius>0);assert.ok(r.coords.length>=2);
      for(let i=1;i<r.coords.length;i++)assert.notEqual(key(r.coords[i]),key(r.coords[i-1]));
      const path=curve(r);assert.ok(path.getLength()>0);
      near(path.getPointAt(0),r.coords[0],'path starts at its connector');
      near(path.getPointAt(1),r.coords.at(-1)!,'path ends at its connector');
      for(let i=0;i<=200;i++)assert.ok(path.getPointAt(i/200).toArray().every(Number.isFinite));
    }
  }
});

test('every injector terminates in its intake runner and both join their actual manifolds',()=>{
  for(const offset of offsets){
    const routes=engineRoutes(offset),nodes=assemblyConnectors(offset),airMain=routes.find(r=>r.medium==='air'&&!r.cylinder)!,fuelMain=routes.find(r=>r.medium==='fuel'&&!r.cylinder)!;
    for(let cylinder=1;cylinder<=6;cylinder++){
      const intake=routes.find(r=>r.medium==='air'&&r.cylinder===cylinder&&r.branch==='runner')!,fuel=routes.find(r=>r.medium==='fuel'&&r.cylinder===cylinder)!;
      const feed=routes.find(r=>r.medium==='air'&&!r.cylinder&&r.coords.some(p=>key(p)===key(end(intake,0))));
      assert.ok(feed,'each runner starts on a real branch of the intake graph');
      joins(feed,end(intake,0));
      assert.ok(canReach(routes,'air',end(airMain,0),end(intake,0)),'air reaches every runner through the branched manifold');
      joins(fuelMain,end(fuel,0));joins(intake,end(fuel,1));
      joins(intake,nodes.intakePorts[cylinder-1]);near(curve(intake).getPointAt(1),nodes.intakeHeadPaths[cylinder-1][0][0],'runner reaches the real fork in the head');
      const branches=routes.filter(r=>r.medium==='air'&&r.cylinder===cylinder&&r.branch?.startsWith('head-intake-'));
      assert.equal(branches.length,2);assert.equal(branches.reduce((sum,b)=>sum+(b.flowFactor??1),0),1);
      for(let i=0;i<2;i++){near(curve(branches[i]).getPointAt(0),end(intake,1),'paired inlet starts at head fork');near(curve(branches[i]).getPointAt(1),[CYLINDER_X[cylinder-1]+(i?17:-17),207+offset,-23],'inlet ends at its own valve seat');}
      for(let u=0;u<=1;u+=.01){const p=curve(intake).getPointAt(u);assert.ok(p.z<0);assert.ok(p.y+22<=279+offset,'curved runner exterior clears the camshaft plane');}
    }
  }
});

test('six bolted head ports feed two close-coupled cats and remain separate to two outlets',()=>{
  for(const offset of offsets){
    const routes=engineRoutes(offset),nodes=assemblyConnectors(offset),collectors=routes.filter(r=>r.medium==='exhaust'&&r.branch?.startsWith('collector-')),tails=routes.filter(r=>r.medium==='exhaust'&&r.branch?.startsWith('tail-'));
    assert.equal(collectors.length,2);assert.equal(tails.length,2);
    for(let cylinder=1;cylinder<=6;cylinder++){
      const bank=cylinder<=3?0:1,runner=routes.find(r=>r.medium==='exhaust'&&r.cylinder===cylinder&&r.branch==='header')!,collector=collectors[bank],tail=tails[bank];
      joins(runner,nodes.exhaustPorts[cylinder-1]);
      near(curve(runner).getPointAt(1),end(collector,0),'runner meets its group collector');
      assert.ok(canReach(routes,'exhaust',end(runner,0),end(tail,1)));
      assert.equal(canReach(routes,'exhaust',end(runner,0),end(tails[1-bank],1)),false,'the two downstream exhaust banks do not merge');
      const ports=routes.filter(r=>r.medium==='exhaust'&&r.cylinder===cylinder&&r.branch?.startsWith('head-exhaust-'));
      assert.equal(ports.length,2);assert.equal(ports.reduce((sum,r)=>sum+(r.flowFactor??1),0),1);
      for(let i=0;i<2;i++){near(curve(ports[i]).getPointAt(0),[CYLINDER_X[cylinder-1]+(i?17:-17),207+offset,23],'exhaust starts at its own valve seat');near(curve(ports[i]).getPointAt(1),end(runner,0),'two exhaust ports join the real header');}
      for(let u=0;u<=1;u+=.01)assert.ok(curve(runner).getPointAt(u).z>0,'exhaust stays opposite intake');
    }
    for(let i=0;i<2;i++){
      const middle=routes.find(r=>r.medium==='exhaust'&&r.branch===`main-${i?'rear':'front'}`)!;
      joins(collectors[i],nodes.catalysts[i]);near(curve(collectors[i]).getPointAt(1),end(middle,0),'downpipe connects the same bank main pipe');near(curve(middle).getPointAt(1),end(tails[i],0),'bank main pipe reaches its own tail');
      near(new Vector3(...nodes.catalysts[i]),nodes.catalystInlets[i].map((v,j)=>(v+nodes.catalystOutlets[i][j])/2),'cat centre follows its inlet/outlet axis');
      for(const axis of [0,2])for(const node of [nodes.catalystInlets[i],nodes.catalysts[i],nodes.catalystOutlets[i]])assert.equal(node[axis],nodes.exhaustCollectors[i][axis],'manifold outlet, neck and cat stay on a straight vertical axis');
      assert.ok(nodes.exhaustCollectors[i][1]-nodes.catalysts[i][1]<85,'cat sits directly below its collector');near(curve(tails[i]).getPointAt(1),nodes.tails[i],'outlet joins its rolled tail tip');
    }
    for(const first of [1,4])for(let u=0;u<1;u+=.01){
      const group=[0,1,2].map(i=>curve(routes.find(r=>r.medium==='exhaust'&&r.cylinder===first+i&&r.branch==='header')!).getPoint(u));
      assert.ok(group[0].x<=group[1].x+1e-8&&group[1].x<=group[2].x+1e-8,'runners retain their order until their common collector');
    }
  }
});

test('embedded jackets connect galleries and the radiator hoses close through real core connectors',()=>{
  for(const offset of offsets){
    const routes=engineRoutes(offset),nodes=assemblyConnectors(offset),mains=routes.filter(r=>r.medium==='water'&&r.branch==='main'),jackets=routes.filter(r=>r.medium==='water'&&r.branch==='jacket'),radiator=routes.find(r=>r.medium==='water'&&r.branch==='radiator')!,core=routes.find(r=>r.medium==='water'&&r.branch==='radiator-core')!,lower=routes.find(r=>r.medium==='water'&&r.branch==='radiator-return')!,bypass=routes.find(r=>r.medium==='water'&&r.branch==='bypass')!;
    assert.equal(jackets.length,6);
    const supply=mains[0],returnGallery=mains[1],pump=end(supply,0),thermostat=end(returnGallery,1);
    for(const jacket of jackets){
      joins(supply,end(jacket,0));joins(returnGallery,end(jacket,1));
      assert.ok(canReach(routes,'water',pump,end(jacket,0)));assert.ok(canReach(routes,'water',end(jacket,1),thermostat));
      for(let u=0;u<=1;u+=.02){const p=curve(jacket).getPointAt(u);assert.ok(Math.abs(p.z)>=51.5,'water stays in the lateral casting instead of crossing the cylinder bore');assert.ok(Math.abs(p.z)+jacket.radius<64,'jacket stays inside the block side wall');}
    }
    near(curve(radiator).getPointAt(0),thermostat,'upper hose leaves thermostat');near(curve(radiator).getPointAt(1),nodes.radiatorUpper,'upper hose seats on upper radiator spigot');
    near(curve(core).getPointAt(0),nodes.radiatorUpper,'core shares upper connection');near(curve(core).getPointAt(1),nodes.radiatorLower,'core ends at lower connection');
    near(curve(lower).getPointAt(0),nodes.radiatorLower,'return hose starts on lower radiator spigot');near(curve(lower).getPointAt(1),pump,'lower hose returns to pump');
    near(curve(bypass).getPointAt(0),thermostat,'bypass leaves thermostat');near(curve(bypass).getPointAt(1),pump,'bypass returns to pump');
    assert.ok(canReach(routes,'water',thermostat,pump));
    assert.deepEqual(pump,[-344,63,-30]);
  }
});

test('oil reaches bearings and both camshaft galleries, then returns to the same sump',()=>{
  for(const offset of offsets){
    const routes=engineRoutes(offset),pickup=routes.find(r=>r.medium==='oil'&&r.branch==='pickup')!,gallery=routes.find(r=>r.medium==='oil'&&r.branch==='gallery')!,bearings=routes.filter(r=>r.medium==='oil'&&r.branch==='bearing'),cams=routes.filter(r=>r.medium==='oil'&&r.branch==='cam-gallery'),returns=routes.filter(r=>r.medium==='oil'&&r.branch==='return'),sump=end(pickup,0);
    assert.equal(bearings.length,6);assert.equal(cams.length,2);assert.equal(returns.length,2);
    for(const bearing of bearings){joins(gallery,end(bearing,0));assert.ok(canReach(routes,'oil',sump,end(bearing,1)));}
    for(const cam of cams){
      assert.ok(canReach(routes,'oil',sump,end(cam,0)));assert.ok(canReach(routes,'oil',end(cam,1),sump));
      const drain=returns.find(r=>key(end(r,0))===key(end(cam,1)))!;assert.ok(drain);near(curve(drain).getPointAt(1),sump,'cam drain returns to pickup sump');
      for(const p of cam.coords)assert.equal(p[1],279+offset,'cam gallery follows the moved head');
    }
    assert.deepEqual(sump,[0,-70,0]);
    assert.ok(cams.some(r=>r.coords.every(p=>p[2]<0))&&cams.some(r=>r.coords.every(p=>p[2]>0)));
  }
});
