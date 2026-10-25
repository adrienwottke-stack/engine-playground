import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assemblyConnectors, engineRoutes, type RouteSpec } from './engine-3d-layout';
import { assemblyDimensions, CYLINDER_X, mechanismPose, flowActivity, combustionAppearance, type Medium, type PipeMode } from './engine-3d-model';
import { attachFlowAttributes, createGasVolumeMaterial, createPortSprayMaterial } from './engine-render-effects';
import { valveSample } from './native-view';
import { mod, type Config } from './model';
import { PISTON_SPEC } from './piston-spec';
import type { ViewState } from './drawing';

export const FLOW_VIEW_BACKGROUND = 0x080e15;
type Gas = 'air' | 'exhaust';
type FlowRoute = { spec: RouteSpec; index: number; length: number; phase: number; rate: number; data: T.Vector4 };
/** Separate, resource-owning layer: six cylinders, existing connector coordinates,
 * native cycle/valve sampling, no runtime/lease/audio dependencies. Recreate if
 * bore/stroke/rod dimensions change, just as the main assembly is recreated. */
export function createEngineFlowView(cfg: Config) {
  const root = new T.Group(); root.name = 'M54 · freigestellter Gaswechsel R6'; root.visible = false;
  const dimensions = assemblyDimensions(cfg), nodes = assemblyConnectors(dimensions.headOffset);
  const materials = {
    air: createGasVolumeMaterial('air'), exhaust: createGasVolumeMaterial('exhaust'), chamber: createGasVolumeMaterial('chamber'), spray: createPortSprayMaterial(),
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
  // Use the shared path graph. The plenum and filter expand the same passage,
  // rather than adding disconnected ornamental tubes.
  for (const gas of ['air', 'exhaust'] as const) {
    const pieces: T.BufferGeometry[] = [];
    for (const spec of specs.filter(s => s.medium === gas)) {
      const curve = new T.CatmullRomCurve3(spec.coords.map(p => new T.Vector3(...p)), false, 'centripetal');
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
      pieces.push(envelope(g, index, length));
      routes.push({ spec, index, length, phase: 0, rate: 0, data: materials[gas].uniforms.uData.value[index] });
    }
    const merged = own(mergeGeometries(pieces)!); pieces.forEach(g => g.dispose());
    const mesh = new T.Mesh(merged, materials[gas]); mesh.name = gas === 'air' ? 'Zusammenhängende Ansaugluft' : 'Zwei zusammenhängende Abgasbänke';
    mesh.renderOrder = 2; root.add(mesh); batches.set(gas, mesh);
  }
  const chamberMeshes = CYLINDER_X.map((x, i) => {
    const geometry = own(envelope(new T.CylinderGeometry(cfg.engine.boreMm / 2 - 2, cfg.engine.boreMm / 2 - 2, 1, 24), i, 70));
    const mesh = new T.Mesh(geometry, materials.chamber); mesh.position.x = x; mesh.name = `Gasraum ${i + 1}`; mesh.renderOrder = 1; root.add(mesh); return mesh;
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
    geometry.computeVertexNormals(); own(envelope(geometry, index, length, true));
    const mesh = new T.Mesh(geometry, materials.exhaust); mesh.name = `Abgasvolumen Austritt ${i + 1}`; mesh.visible = false; root.add(mesh);
    routes.push({ spec: { ...tailSpec, branch: tailSpec.branch! + '-outlet' }, index, length, phase: 0, rate: 0, data: materials.exhaust.uniforms.uData.value[index] });
    return mesh;
  });
  const pistonGeometry = own(new T.CylinderGeometry(cfg.engine.boreMm / 2 - 1, cfg.engine.boreMm / 2 - 1, 33, 24));
  const pistons = new T.InstancedMesh(pistonGeometry, materials.metal, 6); pistons.name = 'Sechs reduzierte Kolben'; root.add(pistons);
  const rods = new T.InstancedMesh(own(new T.CylinderGeometry(6, 8, 1, 8)), materials.metal, 6); rods.name = 'Sechs Pleuel'; root.add(rods);
  const webs = new T.InstancedMesh(own(new T.CylinderGeometry(45, 45, 12, 18)), materials.dark, 6); webs.name = 'Kurbelwangen'; root.add(webs);
  const stem = new T.CylinderGeometry(2.1, 2.1, 33, 8); stem.translate(0, 16, 0);
  const head = new T.CylinderGeometry(11, 13, 3, 12); const valveGeometry = own(mergeGeometries([stem, head])!); stem.dispose(); head.dispose();
  const valves = new T.InstancedMesh(valveGeometry, materials.metal, 24); valves.name = '24 native Ventile'; root.add(valves);
  const shaft = new T.Mesh(own(new T.CylinderGeometry(13, 13, 620, 16)), materials.dark); shaft.rotation.z = Math.PI / 2; root.add(shaft);
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
  const sprays = new T.Mesh(own(mergeGeometries(sprayPieces)!), materials.spray); sprays.name = 'Saugrohrspray · zeitlich illustrativ'; sprays.renderOrder = 4; sprayPieces.forEach(g => g.dispose()); root.add(sprays);
  // Dynamic instances move outside their construction-time bounds. The small
  // fixed six-cylinder instance sets can safely bypass bounding-box recomputes.
  for (const instances of [pistons, rods, webs, valves]) { instances.frustumCulled = false; instances.instanceMatrix.setUsage(T.DynamicDrawUsage); }
  const matrix = new T.Matrix4(), quaternion = new T.Quaternion(), p = new T.Vector3(), pin = new T.Vector3(), center = new T.Vector3(), scale = new T.Vector3(1, 1, 1), direction = new T.Vector3();
  const Y = new T.Vector3(0, 1, 0), X = new T.Vector3(1, 0, 0), webQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
  let disposed = false, lastClock: number | null = null, lastDriveAngle = 0, available = false;
  function update(state: ViewState | null, config: Config, angle: number, clock: number, driveAngle = angle, modes: Partial<Record<Medium, PipeMode>> = {}) {
    if (disposed) return;
    const dt = lastClock === null ? 0 : Math.max(0, Math.min(.1, clock - lastClock)); lastClock = clock; lastDriveAngle = driveAngle;
    available = !!state?.cycles?.some(c => c.samples.some(Boolean)) || !!state?.cycle?.samples.some(Boolean);
    const running = (state?.rpm ?? 0) > 5;
    for (const route of routes) {
      const branch = route.spec.branch!.replace('-outlet', '');
      route.rate = flowActivity(route.spec.medium, route.spec.cylinder, branch, state, config, angle) * (route.spec.flowFactor ?? 1);
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
      center.copy(p); center.y += PISTON_SPEC.compressionHeightMm - 16.5;
      matrix.compose(center, quaternion.identity(), scale.set(1, 1, 1)); pistons.setMatrixAt(i, matrix);
      center.copy(p).add(pin).multiplyScalar(.5); direction.copy(p).sub(pin); const rodLength = direction.length(); quaternion.setFromUnitVectors(Y, direction.normalize());
      matrix.compose(center, quaternion, scale.set(1, rodLength, 1)); rods.setMatrixAt(i, matrix);
      // Raw driveAngle is deliberately retained. No 720-degree reset of the drive.
      quaternion.setFromAxisAngle(X, driveAngle); quaternion.multiply(webQ); center.set(CYLINDER_X[i], 0, 0); matrix.compose(center, quaternion, scale.set(1, 1, 1)); webs.setMatrixAt(i, matrix);
      const lifts = valveSample(state, angle, i + 1), fire = combustionAppearance(state, angle, i + 1);
      const spray = running && state?.ignition === true && fire.available && modes.fuel !== 'off' && (lifts?.intakeLiftMm ?? 0) > .1 ? Math.min(1, fire.intake * 2) : 0;
      materials.spray.uniforms.uActivity.value[i].set(spray, 0);
      for (let side = 0; side < 2; side++) for (let pair = 0; pair < 2; pair++) {
        const lift = side === 0 ? lifts?.intakeLiftMm ?? 0 : lifts?.exhaustLiftMm ?? 0;
        center.set(CYLINDER_X[i] + (pair === 0 ? -17 : 17), 207 + dimensions.headOffset - lift, side === 0 ? -23 : 23);
        matrix.compose(center, quaternion.identity(), scale.set(1, 1, 1)); valves.setMatrixAt(i * 4 + side * 2 + pair, matrix);
      }
      const top = p.y + PISTON_SPEC.compressionHeightMm, height = Math.max(1, dimensions.deck - top);
      chamberMeshes[i].position.y = top + height / 2; chamberMeshes[i].scale.y = height;
      const chamberEnabled = modes.air !== 'off' || modes.exhaust !== 'off'; chamberMeshes[i].visible = chamberEnabled;
      materials.chamber.uniforms.uData.value[i].set(running ? fire.intake + fire.exhaust : 0, routes.find(r => r.spec.cylinder === i + 1)?.phase ?? 0, running && state?.ignition !== false && fire.available ? fire.heat : 0, fire.available && running ? 1 : 0);
    }
    for (const instances of [pistons, rods, webs, valves]) instances.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 2; i++) outletMeshes[i].visible = modes.exhaust !== 'off' && running && available && routes[routes.length - 2 + i].rate > 1e-6;
  }
  update(null, cfg, 0, 0);
  return {
    root, update, spray:sprays,
    setVisible(visible: boolean) { root.visible = visible && !disposed; },
    diagnostics() { return { cylinders: 6, valves: 24, available, disposed, driveAngle: lastDriveAngle, routes: routes.map(r => ({ medium: r.spec.medium, cylinder: r.spec.cylinder, branch: r.spec.branch, rate: r.rate, phase: r.phase })), sprayTargets, sprayActivity: (materials.spray.uniforms.uActivity.value as T.Vector2[]).map(v => v.x), injectionTiming: 'illustrative-intake-lift-and-positive-airflow; no-native-injector-timestamps', geometries: geometries.size, materials: Object.keys(materials).length, maximumDraws: 17, representation: 'continuous-native-gas-volumes', dimensions }; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); for (const instances of [pistons, rods, webs, valves, arrows]) instances.dispose(); geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); root.clear(); },
  };
}
export type EngineFlowView = ReturnType<typeof createEngineFlowView>;
