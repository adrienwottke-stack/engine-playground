import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createWorkshopEnclosure, WORKSHOP_ENCLOSURE as bounds } from '../src/engine-view-enclosure';

test('workshop background closes every horizontal and upward sightline from the permitted camera volume', () => {
  const material = new T.MeshBasicMaterial();
  const room = createWorkshopEnclosure(material, material, material);
  room.updateMatrixWorld(true);
  const ray = new T.Raycaster();
  for (const origin of [[90, 200, 22], [6200, 500, -6200], [-6200, 400, 6200], [0, 6200, 0]]) {
    for (let turn = 0; turn < 24; turn++) for (const slope of [0, .5, 2]) {
      const angle = turn / 24 * Math.PI * 2;
      ray.set(new T.Vector3(...origin as [number, number, number]), new T.Vector3(Math.sin(angle), slope, Math.cos(angle)).normalize());
      const hit = ray.intersectObject(room, true)[0];
      assert.ok(hit, `background must cover angle ${turn}, slope ${slope}, origin ${origin}`);
      assert.ok(hit.distance < bounds.far, 'the background must stay inside the camera far plane');
    }
  }
  assert.ok(bounds.maxOrbit + bounds.maxPan + 105 < bounds.halfSize);
  assert.ok(bounds.maxOrbit + bounds.maxPan + 105 < bounds.ceilingY);
  room.traverse(object => { if (object instanceof T.Mesh) object.geometry.dispose(); });
  material.dispose();
});
