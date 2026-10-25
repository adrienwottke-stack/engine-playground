import * as T from 'three';
import type { EngineThree } from './engine-three';
import type { ViewState } from './drawing';
import type { EnginePresentation } from './engine-3d-model';
import { WORKSHOP_ENCLOSURE } from './engine-view-enclosure';
import { workshopReflectionIntensity } from './engine-material-profiles';

export interface WorkshopLighting {
  update(presentation: EnginePresentation, state: ViewState | null, clock: number): void;
  dispose(): void;
}

/** Fixture lighting and a single, filtered reflection capture of the actual room. */
export function installWorkshopLighting(engine: EngineThree, room: T.Group, architecture: T.Group, workstation: T.Group): WorkshopLighting {
  const renderer = engine.renderer;
  const software = engine.host.dataset.graphics === 'software';
  const previousExposure = renderer.toneMappingExposure;
  const previousShadowType = renderer.shadowMap.type;
  renderer.shadowMap.type = T.PCFShadowMap;
  const originalLights: { light: T.Light; intensity: number; color: T.Color }[] = [];
  engine.scene.traverse(object => {
    if (!(object instanceof T.Light)) return;
    originalLights.push({ light: object, intensity: object.intensity, color: object.color.clone() });
    if (object instanceof T.HemisphereLight) {
      object.intensity = .55; object.color.set(0xc5d1d4); object.groundColor.set(0x534b40);
    } else if (object instanceof T.DirectionalLight) {
      // A weak, cool fill comes through the open front; fixtures supply the key.
      object.intensity = object.position.z > 0 ? 1.0 : .32;
      object.color.set(object.position.z > 0 ? 0xc1d3e2 : 0xe5ded0);
    }
  });
  renderer.toneMappingExposure = 1.15;
  const lights = new T.Group(); lights.name = 'workshop-fixture-lighting';
  const main = new T.SpotLight(0xffecd2, 3_800_000, 3300, .9, .88, 2);
  main.name = 'workshop-overhead-key'; main.position.set(-650, 1140, -200);
  main.target.position.set(-70, -100, 80);
  main.castShadow = true;
  main.shadow.mapSize.set(1024, 1024);
  main.shadow.camera.near = 80; main.shadow.camera.far = 3300;
  main.shadow.bias = -.00012; main.shadow.normalBias = 1.4;
  main.shadow.radius = 4.5;
  main.shadow.autoUpdate = false; main.shadow.needsUpdate = true;
  const bench = new T.SpotLight(0xe0eafa, 2_400_000, 3000, 1.0, .95, 2);
  bench.name = 'workshop-bench-fill'; bench.position.set(620, 1140, -200);
  bench.target.position.set(880, 80, -650);
  lights.add(main, main.target, bench, bench.target);
  engine.scene.add(lights);

  // Capture only the room once; mechanical movement cannot feed back into light.
  const capture = new T.Scene(); capture.background = new T.Color(0x2b3436);
  capture.add(room.clone(true));
  for (const saved of originalLights) capture.add(saved.light.clone());
  const captureMain = main.clone(), captureBench = bench.clone();
  captureMain.castShadow = captureBench.castShadow = false;
  capture.add(captureMain, captureMain.target, captureBench, captureBench.target);
  const openingGeometry = new T.PlaneGeometry(2200, 1600);
  const openingMaterial = new T.MeshBasicMaterial({ color: new T.Color(.7, .85, 1.05), side: T.DoubleSide });
  const opening = new T.Mesh(openingGeometry, openingMaterial);
  opening.position.set(0, 650, 1700); capture.add(opening);
  const pmrem = new T.PMREMGenerator(renderer);
  const shadowUpdate = renderer.shadowMap.needsUpdate;
  const reflection = pmrem.fromScene(capture, .035, 20, WORKSHOP_ENCLOSURE.far, { size: 128, position: new T.Vector3(0, 170, 0) });
  pmrem.dispose(); openingGeometry.dispose(); openingMaterial.dispose(); capture.clear();
  reflection.texture.name = 'workshop-local-reflections';
  renderer.shadowMap.needsUpdate = shadowUpdate;

  let receivers = 0, casters = 0;
  const prepareMaterials = () => {
    receivers = casters = 0;
    engine.scene.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const solids = materials.filter((material): material is T.MeshStandardMaterial => material instanceof T.MeshStandardMaterial);
      if (!solids.length) return;
      object.receiveShadow = true; receivers++;
      object.castShadow = solids.some(material => !material.transparent && material.opacity >= 1);
      if (object.castShadow) casters++;
      for (const material of solids) {
        material.envMap = reflection.texture;
        material.envMapIntensity = workshopReflectionIntensity(material);
        material.needsUpdate = true;
      }
    });
  };
  prepareMaterials();
  let lastPresentation = '', lastGeometry = '', lastMoving = false, lastShadow = -Infinity, disposed = false;
  let lastWallVisible = true;
  let lastWorkstationVisible = true;
  const stationBounds = new T.Box3().setFromObject(workstation);
  const viewRay = new T.Ray(), viewDirection = new T.Vector3(), stationHit = new T.Vector3();
  engine.controls.cursor.set(90, 105, 22);
  let shadowRefreshes = 0, shadowReady = false;
  const publish = () => {
    engine.host.dataset.workshopLighting = JSON.stringify({
      revision: 'workshop-lighting-01', fixtureLights: 2, shadowLights: 1,
      shadowMap: 1024, reflectionSize: 128, reflectionSource: 'workshop-room',
      receivers, casters, shadowRefreshes, shadowReady, exposure: renderer.toneMappingExposure,
      movingShadowHz: software ? 2 : 6,
    });
  };
  publish();
  renderer.shadowMap.needsUpdate = true;
  return {
    update(presentation, state, clock) {
      if (disposed) return;
      const bounds = WORKSHOP_ENCLOSURE;
      engine.controls.maxDistance = Math.min(engine.controls.maxDistance, bounds.maxOrbit);
      engine.controls.maxTargetRadius = bounds.maxPan;
      engine.controls.maxPolarAngle = bounds.maxPolarAngle;
      if (engine.controls.target.y < bounds.minTargetY) {
        engine.camera.position.y += bounds.minTargetY - engine.controls.target.y;
        engine.controls.target.y = bounds.minTargetY;
      }
      if (engine.camera.far !== bounds.far) { engine.camera.far = bounds.far; engine.camera.updateProjectionMatrix(); }
      // A dollhouse cut opens the enclosure when orbiting outside its walls.
      const wallVisible = engine.camera.position.z > engine.controls.target.z - 600 && engine.camera.position.x > -1850;
      architecture.visible = wallVisible;
      if (wallVisible !== lastWallVisible) engine.controls.dispatchEvent({ type: 'change' });
      engine.host.dataset.workshopOpenWall = String(!wallVisible);
      viewDirection.copy(engine.controls.target).sub(engine.camera.position);
      const targetDistance = viewDirection.length(); viewDirection.normalize();
      viewRay.set(engine.camera.position, viewDirection);
      const blocked = viewRay.intersectBox(stationBounds, stationHit);
      const workstationVisible = !blocked || engine.camera.position.distanceTo(stationHit) >= targetDistance - 180;
      workstation.visible = workstationVisible;
      if (workstationVisible !== lastWorkstationVisible) engine.controls.dispatchEvent({ type: 'change' });
      engine.host.dataset.workshopBackground = JSON.stringify({ revision: 'workshop-background-01', enclosure: true, wallCut: !wallVisible, workstationCut: !workstationVisible });
      if (shadowReady !== !!main.shadow.map) { shadowReady = !!main.shadow.map; publish(); }
      const geometry = `${engine.host.dataset.geometry??''}:${engine.host.dataset.assemblyRevision??''}`;
      const moving = (state?.rpm ?? 0) > 5;
      if (geometry !== lastGeometry && lastGeometry) prepareMaterials();
      const changed = presentation !== lastPresentation || geometry !== lastGeometry || moving !== lastMoving || wallVisible !== lastWallVisible || workstationVisible !== lastWorkstationVisible;
      if (changed || moving && clock - lastShadow >= 1 / (software ? 2 : 6)) {
        main.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true;
        lastPresentation = presentation; lastGeometry = geometry; lastMoving = moving;
        lastWallVisible = wallVisible;
        lastWorkstationVisible = workstationVisible;
        lastShadow = clock; shadowRefreshes++; publish();
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      engine.scene.traverse(object => {
        if (!(object instanceof T.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof T.MeshStandardMaterial && material.envMap === reflection.texture) material.envMap = null;
        }
      });
      main.shadow.dispose(); reflection.dispose(); lights.removeFromParent();
      for (const saved of originalLights) { saved.light.intensity = saved.intensity; saved.light.color.copy(saved.color); }
      renderer.toneMappingExposure = previousExposure;
      renderer.shadowMap.type = previousShadowType;
    },
  };
}
