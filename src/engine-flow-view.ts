import {intakeFlowMetadata,intakeRouteRate} from './engine-intake-flow';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assemblyConnectors, engineRoutes, type RouteSpec } from './engine-3d-layout';
import { assemblyDimensions, CYLINDER_X, mechanismPose, flowActivity, combustionAppearance, type Medium, type PipeMode } from './engine-3d-model';
import { attachFlowAttributes, createGasVolumeMaterial, createPortSprayMaterial } from './engine-render-effects';
import { valveSample } from './native-view';
import { mod, type Config } from './model';
import { PISTON_SPEC } from './piston-spec';
import type { ViewState } from './drawing';
import {createFlowMechanics} from './engine-flow-mechanics';
import {writeNativeFlowPulses} from './engine-flow-pulses';
import {createChamberVolumeGeometry,createChamberVolumeMaterial,createValveCurtainMaterial,flowChamberState,updateChamberVolumeColours} from './engine-flow-chamber';

export const FLOW_VIEW_BACKGROUND = 0x080e15;
type Gas = 'air' | 'exhaust';
type FlowRoute = { spec: RouteSpec; index: number; length: number; phase: number; rate: number; data: T.Vector4; offsets: number[] };
/** Separate, resource-owning layer: six cylinders, existing connector coordinates,
 * native cycle/valve sampling, no runtime/lease/audio dependencies. Recreate if
 * bore/stroke/rod dimensions change, just as the main assembly is recreated. */
export function createEngineFlowView(cfg: Config) {
  const root = new T.Group(); root.name = 'M54 · freigestellter Gaswechsel R6'; root.visible = false;
  const dimensions = assemblyDimensions(cfg), nodes = assemblyConnectors(dimensions.headOffset);
  const materials = {
    air: createGasVolumeMaterial('air'), exhaust: createGasVolumeMaterial('exhaust'),curtain:createValveCurtainMaterial(),spray: createPortSprayMaterial(),
    metal: new T.MeshStandardMaterial({ color: 0x859297, metalness: .58, roughness: .43 }),
    dark: new T.MeshStandardMaterial({ color: 0x3b474d, metalness: .45, roughness: .5 }),
    direction: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .72, depthWrite: false }),
  };
  const geometries = new Set<T.BufferGeometry>();
  const own = <G extends T.BufferGeometry>(g: G) => { geometries.add(g); return g; };
  const envelope = (g: T.BufferGeometry, index: number, length: number, outlet = false) => {
    attachFlowAttributes(g, index, length);
    const uv = g.getAttribute('uv'), fade = new Float32Array(uv.count);
    for (let i = 0; i < fade.length; i++) fade[i] = outlet ? Math.pow(1 - uv.getX(i), 1.5) : 1;
    g.setAttribute('volumeFade', new T.BufferAttribute(fade, 1)); return g;
  };
  const routes: FlowRoute[] = [], batches = new Map<Gas, T.Mesh>();
  const specs = engineRoutes(dimensions.headOffset).filter(s => s.medium === 'air' || s.medium === 'exhaust');
  const curves = new Map(specs.map(s=>[s,new T.CatmullRomCurve3(s.coords.map(p=>new T.Vector3(...p)),false,'centripetal')]));
  const routeLength=(s:RouteSpec|undefined)=>s?curves.get(s)!.getLength():0;
  const intakeMetadata=intakeFlowMetadata(specs);
  const lengths=CYLINDER_X.map((_,i)=>{
    const cylinder=i+1,suffix=i<3?'front':'rear';
    return {runner:routeLength(specs.find(s=>s.medium==='air'&&s.cylinder===cylinder&&s.branch==='runner')),
      head:routeLength(specs.find(s=>s.medium==='exhaust'&&s.cylinder===cylinder&&s.branch==='head-exhaust-left')),
      header:routeLength(specs.find(s=>s.medium==='exhaust'&&s.cylinder===cylinder&&s.branch==='header')),
      collector:routeLength(specs.find(s=>s.medium==='exhaust'&&s.branch==='collector-'+suffix)),
      main:routeLength(specs.find(s=>s.medium==='exhaust'&&s.branch==='main-'+suffix)),
      tail:routeLength(specs.find(s=>s.medium==='exhaust'&&s.branch==='tail-'+suffix))};
  });
  function pulseOffsets(spec:RouteSpec){
    return CYLINDER_X.map((_,i)=>{
      const l=lengths[i],suffix=i<3?'front':'rear',branch=spec.branch!;
      if(spec.medium==='air'){
        return intakeMetadata.offset(spec,i+1);
      }
      if(spec.cylinder)return spec.cylinder===i+1?(branch.startsWith('head-')?0:l.head):-1e6;
      if(!branch.includes(suffix))return -1e6;
      return l.head+l.header+(branch.startsWith('collector-')?0:l.collector)+(branch.startsWith('main-')||branch.startsWith('collector-')?0:l.main)+(branch.endsWith('-outlet')?l.tail:0);
    });
  }
  function pulseAttributes(g:T.BufferGeometry,offsets:number[],length:number){
    const uv=g.getAttribute('uv'),a=new Float32Array(uv.count*3),b=new Float32Array(uv.count*3);
    for(let i=0;i<uv.count;i++)for(let c=0;c<6;c++){const value=offsets[c]<-10000?-1e6:offsets[c]+uv.getX(i)*length;(c<3?a:b)[i*3+c%3]=value;}
    g.setAttribute('pulseDistanceA',new T.BufferAttribute(a,3));g.setAttribute('pulseDistanceB',new T.BufferAttribute(b,3));return g;
  }
  // Use the shared path graph. The plenum and filter expand the same passage,
  // rather than adding disconnected ornamental tubes.
  for (const gas of ['air', 'exhaust'] as const) {
    const pieces: T.BufferGeometry[] = [];
    for (const spec of specs.filter(s => s.medium === gas)) {
      const curve = curves.get(spec)!;
      const index = routes.length, length = curve.getLength();
      const g = new T.TubeGeometry(curve, Math.max(18, Math.min(100, Math.ceil(length / 9))), spec.radius, 12, false);
      // Longitudinal radius changes remain one closed, connected cross-section.
      if (gas === 'air' && spec.branch === 'main') {
        const positions = g.getAttribute('position'), uv = g.getAttribute('uv');
        const point = new T.Vector3(), center = new T.Vector3(), radial = new T.Vector3();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i); center.copy(curve.getPointAt(uv.getX(i))); radial.copy(point).sub(center);
          const plenum = center.z < -180 && center.x > -295 && center.y > 163 + dimensions.headOffset;
          const filter = center.x > -500 && center.x < -395;
          if (plenum || filter) point.copy(center).add(radial.multiplyScalar(plenum ? 1.58 : 1.7));
          positions.setXYZ(i, point.x, point.y, point.z);
        }
        g.computeVertexNormals();
      }
      if(gas==='exhaust'&&spec.branch==='header'){
        const positions=g.getAttribute('position'),uv=g.getAttribute('uv'),point=new T.Vector3(),center=new T.Vector3();
        for(let j=0;j<positions.count;j++){const u=uv.getX(j);point.fromBufferAttribute(positions,j);center.copy(curve.getPointAt(u));point.sub(center).multiplyScalar(1+Math.pow(Math.sin(u*Math.PI),2)*.35).add(center);positions.setXYZ(j,point.x,point.y,point.z);}g.computeVertexNormals();
      }
      const offsets=pulseOffsets(spec);pieces.push(pulseAttributes(envelope(g, index, length),offsets,length));
      routes.push({ spec, index, length, phase: 0, rate: 0, data: materials[gas].uniforms.uData.value[index],offsets });
    }
    const merged = own(mergeGeometries(pieces)!); pieces.forEach(g => g.dispose());
    const mesh = new T.Mesh(merged, materials[gas]); mesh.name = gas === 'air' ? 'Zusammenhängende Ansaugluft' : 'Zwei zusammenhängende Abgasbänke';
    mesh.renderOrder = gas==='air'?1:3; root.add(mesh); batches.set(gas, mesh);
  }
  const chamberMaterials:T.MeshBasicMaterial[]=[];
  const chamberMeshes = CYLINDER_X.map((x, i) => {
    const geometry = own(createChamberVolumeGeometry(i));
    const material=createChamberVolumeMaterial();chamberMaterials.push(material);
    const mesh = new T.Mesh(geometry, material); mesh.position.x = x;mesh.scale.set(cfg.engine.boreMm/2-1,1,cfg.engine.boreMm/2-1);mesh.name = `Integriertes Gasvolumen ${i + 1}`; mesh.renderOrder = 2;
    root.add(mesh); return mesh;
  });
  // Continuous expanding outlet volumes, never free-floating dot trails. Their
  // shape is an illustration; no atmospheric temperature/density is fabricated.
  const outletMeshes = nodes.tails.map((tail, i) => {
    const tailSpec = specs.find(s => s.medium === 'exhaust' && s.branch === (i === 0 ? 'tail-front' : 'tail-rear'))!;
    const previous = new T.Vector3(...tailSpec.coords.at(-2)!), origin = new T.Vector3(...tail);
    const direction = origin.clone().sub(previous).normalize();
    const curve = new T.CatmullRomCurve3([origin, origin.clone().addScaledVector(direction, 90), origin.clone().addScaledVector(direction, 220).add(new T.Vector3(0, 28, 0))]);
    const index = routes.length, length = curve.getLength(), geometry = new T.TubeGeometry(curve, 28, 20, 12, false);
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), p = new T.Vector3(), center = new T.Vector3();
    for (let j = 0; j < position.count; j++) { const u = uv.getX(j); p.fromBufferAttribute(position, j); center.copy(curve.getPointAt(u)); p.sub(center).multiplyScalar(1 + u * 1.2).add(center); position.setXYZ(j, p.x, p.y, p.z); }
    // Fade the end in the shader by supplying a per-vertex outlet weight.
    const outletSpec={...tailSpec,branch:tailSpec.branch!+'-outlet'},offsets=pulseOffsets(outletSpec);
    geometry.computeVertexNormals(); own(pulseAttributes(envelope(geometry, index, length, true),offsets,length));
    const mesh = new T.Mesh(geometry, materials.exhaust); mesh.name = `Abgasvolumen Austritt ${i + 1}`; mesh.visible = false; root.add(mesh);
    routes.push({ spec:outletSpec, index, length, phase: 0, rate: 0, data: materials.exhaust.uniforms.uData.value[index],offsets });
    return mesh;
  });
  const mechanics=createFlowMechanics(cfg,materials,own);root.add(mechanics.root);
  const stem = new T.CylinderGeometry(2.1, 2.1, 33, 8); stem.translate(0, 16, 0);
  const head = new T.CylinderGeometry(11, 13, 3, 12); const valveGeometry = own(mergeGeometries([stem, head])!); stem.dispose(); head.dispose();
  const valves = new T.InstancedMesh(valveGeometry, materials.metal, 24); valves.name = '24 native Ventile'; root.add(valves);
  const curtainGeometry=own(new T.CylinderGeometry(1,.86,1,24,1,true));
  curtainGeometry.setAttribute('valveIndex',new T.InstancedBufferAttribute(Float32Array.from({length:24},(_,i)=>Math.floor(i/4)*2+Math.floor((i%4)/2)),1));
  const curtains=new T.InstancedMesh(curtainGeometry,materials.curtain,24);curtains.name='24 Ventilvorhänge · native Öffnung und Flussrichtung';curtains.frustumCulled=false;curtains.instanceMatrix.setUsage(T.DynamicDrawUsage);curtains.renderOrder=4;root.add(curtains);
  const cameraEye=new T.Vector3();
  chamberMeshes[0].onBeforeRender=(_r,_s,camera)=>{camera.getWorldPosition(cameraEye);root.worldToLocal(cameraEye);const intakeSide=cameraEye.z<0;batches.get('air')!.renderOrder=intakeSide?3:1;batches.get('exhaust')!.renderOrder=intakeSide?1:3;};
  const chamberStates:Array<ReturnType<typeof flowChamberState>>=[];
  // Small stationary arrowheads make the signed direction legible in a still
  // image. Pulses stay in the continuous volume; there are no particle trails.
  const arrowRoutes = routes.filter(r => r.spec.branch === 'runner' || r.spec.branch === 'main-front' || r.spec.branch === 'main-rear').map(route => {
    const curve = new T.CatmullRomCurve3(route.spec.coords.map(p => new T.Vector3(...p)), false, 'centripetal');
    return { route, center: curve.getPointAt(.56), tangent: curve.getTangentAt(.56) };
  });
  const arrows = new T.InstancedMesh(own(new T.ConeGeometry(5, 14, 8)), materials.direction, arrowRoutes.length); arrows.name = 'Native Flussrichtung'; arrows.frustumCulled = false; arrows.instanceMatrix.setUsage(T.DynamicDrawUsage);
  arrowRoutes.forEach(({ route }, i) => arrows.setColorAt(i, new T.Color(route.spec.medium === 'air' ? 0x71dfd0 : 0x9daee2))); root.add(arrows);
  const sprayTargets = nodes.injection.map((nozzle, i) => {
    // Entire spray remains upstream of the paired inlet passages; z=-55 is
    // outside the bore. The existing injector body already ends at nozzle.
    const end = [CYLINDER_X[i], 219 + dimensions.headOffset, -55];
    return { nozzle: [...nozzle], end };
  });
  const sprayPieces = sprayTargets.map(({ nozzle, end }, i) => {
    const start = new T.Vector3(...nozzle), finish = new T.Vector3(...end), axis = finish.clone().sub(start);
    const geometry = new T.CylinderGeometry(8, .3, axis.length(), 12, 1, true);
    geometry.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize()));
    geometry.translate(...start.add(finish).multiplyScalar(.5).toArray()); return attachFlowAttributes(geometry, i, axis.length());
  });
  const sprays = new T.Mesh(own(mergeGeometries(sprayPieces)!), materials.spray); sprays.name = 'Saugrohrspray · zeitlich illustrativ'; sprays.renderOrder = 5; sprayPieces.forEach(g => g.dispose()); root.add(sprays);
  // Dynamic instances move outside their construction-time bounds. The small
  // fixed six-cylinder instance sets can safely bypass bounding-box recomputes.
  valves.frustumCulled=false;valves.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const matrix = new T.Matrix4(), quaternion = new T.Quaternion(), p = new T.Vector3(), pin = new T.Vector3(), center = new T.Vector3(), scale = new T.Vector3(1, 1, 1), direction = new T.Vector3();
  const Y = new T.Vector3(0, 1, 0);
  let disposed = false, lastClock: number | null = null, lastDriveAngle = 0, available = false;
  function update(state: ViewState | null, config: Config, angle: number, clock: number, driveAngle = angle, modes: Partial<Record<Medium, PipeMode>> = {}) {
    if (disposed) return;
    const dt = lastClock === null ? 0 : Math.max(0, Math.min(.1, clock - lastClock)); lastClock = clock; lastDriveAngle = driveAngle;
    available = !!state?.cycles?.some(c => c.samples.some(Boolean)) || !!state?.cycle?.samples.some(Boolean);
    const running = (state?.rpm ?? 0) > 5;
    writeNativeFlowPulses(materials.air.uniforms.uPulses.value,state,angle,'air',materials.air.uniforms.uPulseHeat.value);
    writeNativeFlowPulses(materials.exhaust.uniforms.uPulses.value,state,angle,'exhaust',materials.exhaust.uniforms.uPulseHeat.value);
    for(const gas of ['air','exhaust'] as const)if(modes[gas]==='off')for(const pulse of materials[gas].uniforms.uPulses.value as T.Vector4[])pulse.z=0;
    for (const route of routes) {
      const branch = route.spec.branch!.replace('-outlet', '');
      route.rate = (route.spec.medium==='air'?intakeRouteRate({...route.spec,branch},state,config,angle,flowActivity):flowActivity(route.spec.medium,route.spec.cylinder,branch,state,config,angle)) * (route.spec.flowFactor ?? 1);
      if (!Number.isFinite(route.rate)) route.rate = 0;
      const enabled = modes[route.spec.medium] !== 'off';
      const live = enabled && running && available;
      if (live && Math.abs(route.rate) > 1e-6) route.phase = mod(route.phase + dt * 125 / Math.max(20, route.length) * Math.sign(route.rate), 1);
      const heat = route.spec.medium === 'exhaust' && route.spec.cylinder ? combustionAppearance(state, angle, route.spec.cylinder).heat * .65 : 0;
      route.data.set(live ? route.rate : 0, route.phase, live ? heat : 0, live ? 1 : 0);
    }
    for (const gas of ['air', 'exhaust'] as const) batches.get(gas)!.visible = modes[gas] !== 'off';
    arrowRoutes.forEach(({ route, center, tangent }, i) => {
      direction.copy(tangent).multiplyScalar(Math.sign(route.rate) || 1); quaternion.setFromUnitVectors(Y, direction);
      const active = running && available && modes[route.spec.medium] !== 'off' && Math.abs(route.rate) > 1e-6;
      matrix.compose(center, quaternion, scale.setScalar(active ? 1 : 0)); arrows.setMatrixAt(i, matrix);
    }); arrows.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 6; i++) {
      const pose = mechanismPose(angle, i + 1, config, state); p.fromArray(pose.piston); pin.fromArray(pose.pin);
      mechanics.cylinder(i,p,pin,pose.rotation,dimensions.deck);
      const lifts = valveSample(state, angle, i + 1), fire = combustionAppearance(state, angle, i + 1);
      const gas=flowChamberState(state,angle,i+1);chamberStates[i]=gas;
      updateChamberVolumeColours(chamberMeshes[i].geometry,gas);
      for(let side=0;side<2;side++)materials.curtain.uniforms.uValves.value[i*2+side].set(modes[side===0?'air':'exhaust']==='off'?0:side===0?gas.intakeGate:gas.exhaustGate,gas.heat,side,gas.stage);
      const spray = running && state?.ignition === true && fire.available && modes.fuel !== 'off' && (lifts?.intakeLiftMm ?? 0) > .1 ? Math.min(1, fire.intake * 2) : 0;
      materials.spray.uniforms.uActivity.value[i].set(spray, 0);
      for (let side = 0; side < 2; side++) for (let pair = 0; pair < 2; pair++) {
        const lift = side === 0 ? lifts?.intakeLiftMm ?? 0 : lifts?.exhaustLiftMm ?? 0;
        center.set(CYLINDER_X[i] + (pair === 0 ? -17 : 17), 207 + dimensions.headOffset - lift, side === 0 ? -23 : 23);
        matrix.compose(center, quaternion.identity(), scale.set(1, 1, 1)); valves.setMatrixAt(i * 4 + side * 2 + pair, matrix);
        center.y=207+dimensions.headOffset+1.5-lift/2;matrix.compose(center,quaternion,scale.set(15,Math.max(.001,lift),15));curtains.setMatrixAt(i*4+side*2+pair,matrix);
      }
      const top = p.y + PISTON_SPEC.compressionHeightMm, height = Math.max(1, dimensions.deck - top);
      chamberMeshes[i].position.y = top + height / 2; chamberMeshes[i].scale.y = height;
      const chamberEnabled = modes.air !== 'off' || modes.exhaust !== 'off'; chamberMeshes[i].visible = chamberEnabled;
    }
    mechanics.finish(driveAngle);valves.instanceMatrix.needsUpdate=true;curtains.instanceMatrix.needsUpdate=true;
    for(let i=0;i<2;i++){
      const route=routes[routes.length-2+i],pulses=materials.exhaust.uniforms.uPulses.value as T.Vector4[];
      const packet=pulses.some((pulse,c)=>pulse.z>0&&route.offsets[c]>-10000&&pulse.x+3*pulse.y>route.offsets[c]&&pulse.x-3*pulse.y<route.offsets[c]+route.length);
      outletMeshes[i].visible=modes.exhaust!=='off'&&running&&available&&(packet||route.rate>1e-6);
    }
  }
  update(null, cfg, 0, 0);
  return {
    root, update, spray:sprays,
    setVisible(visible: boolean) { root.visible = visible && !disposed; },
    diagnostics() { return { cylinders: 6, valves: 24, available, disposed, driveAngle: lastDriveAngle, mechanics:mechanics.diagnostics,chambers:chamberStates.map((s,i)=>({...s,cylinder:i+1,bottom:chamberMeshes[i].position.y-chamberMeshes[i].scale.y/2,top:chamberMeshes[i].position.y+chamberMeshes[i].scale.y/2})),chamberRepresentation:'orthogonal-interior-density-slices',pulses:{air:(materials.air.uniforms.uPulses.value as T.Vector4[]).map(p=>p.toArray()),exhaust:(materials.exhaust.uniforms.uPulses.value as T.Vector4[]).map(p=>p.toArray()),exhaustHeat:[...materials.exhaust.uniforms.uPulseHeat.value],transport:'native-positive-flow-lobes; illustrative-angle-indexed-travel'},routes: routes.map(r => ({ medium: r.spec.medium, cylinder: r.spec.cylinder, branch: r.spec.branch, rate: r.rate, phase: r.phase,offsets:r.offsets,length:r.length })), sprayTargets, sprayActivity: (materials.spray.uniforms.uActivity.value as T.Vector2[]).map(v => v.x), injectionTiming: 'illustrative-intake-lift-and-positive-airflow; no-native-injector-timestamps', geometries: geometries.size, materials: Object.keys(materials).length+chamberMaterials.length, maximumDraws: 22, representation: 'continuous-native-gas-volumes', dimensions }; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); mechanics.disposeInstances();for (const instances of [valves, arrows,curtains]) instances.dispose(); geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose());chamberMaterials.forEach(m=>m.dispose()); root.clear(); },
  };
}
export type EngineFlowView = ReturnType<typeof createEngineFlowView>;
