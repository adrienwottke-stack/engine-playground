import test from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attachFlowAttributes, createFlowMaterial, createFlameMaterial, createExhaustPlumes, flameFrontPoint, FLOW_ROUTE_LIMIT } from '../src/engine-render-effects';
import { combustionAppearance, flowActivity, presentationVisibility } from '../src/engine-3d-model';
import { copyConfig, TAU } from '../src/model';

test('global views separate full metal, cutaway mechanism and pure media', () => {
  assert.deepEqual(presentationVisibility('closed'), { mechanical: false, extras: true, housing: true, closedHousing: true, cutHousing: false, media: false, pipes: true, combustion: false, floor: true });
  assert.deepEqual(presentationVisibility('cutaway'), { mechanical: true, extras: true, housing: true, closedHousing: false, cutHousing: true, media: true, pipes: true, combustion: true, floor: true });
  assert.deepEqual(presentationVisibility('flow'), { mechanical: false, extras: false, housing: false, closedHousing: false, cutHousing: false, media: true, pipes: false, combustion: true, floor: false });
});

test('dense flow geometry preserves per-route native indices and distances after merging', () => {
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(40, 20, 0), new Vector3(100, 0, 0)]);
  const first = attachFlowAttributes(new TubeGeometry(curve, 16, 8, 8), 3, curve.getLength());
  const second = attachFlowAttributes(new TubeGeometry(curve, 16, 6, 8), 9, curve.getLength());
  const merged = mergeGeometries([first, second])!;
  const boundary = first.getAttribute('position').count;
  assert.equal(merged.getAttribute('routeIndex').getX(boundary - 1), 3);
  assert.equal(merged.getAttribute('routeIndex').getX(boundary), 9);
  assert.ok(Math.abs(merged.getAttribute('pathLength').getX(boundary) - curve.getLength()) < .0001);
  assert.equal(merged.getAttribute('uv').count, merged.getAttribute('position').count);
  assert.throws(() => attachFlowAttributes(first, FLOW_ROUTE_LIMIT, 100), /Strömungswege/);
  first.dispose(); second.dispose(); merged.dispose();
});

test('each medium uses one bounded uniform palette and inactive routes discard their stream surface', () => {
  const material = createFlowMaterial('air', 0);
  assert.equal(material.uniforms.uFlow.value.length, FLOW_ROUTE_LIMIT);
  assert.ok(material.uniforms.uColor.value.b > material.uniforms.uColor.value.r, 'air is a strong blue, not a pale white guide');
  assert.match(material.fragmentShader, /abs\(vFlow.x\).*discard/);
  assert.match(material.vertexShader, /uFlow\[int\(routeIndex\)\]/);
  assert.equal(material.depthWrite, false);
  material.dispose();
});

test('flame kernel grows into a wrinkled front and stays inside bore and moving chamber', () => {
  for (const bore of [31.25, 37.5, 44.64]) for (const height of [8, 20, 92]) {
    let previousRadius = 0;
    for (const progress of [.02, .12, .4, .7, .99]) {
      const samples = Array.from({ length: 512 }, (_, index) => flameFrontPoint(index, 512, progress, bore, height));
      assert.ok(samples[0].radius >= previousRadius); previousRadius = samples[0].radius;
      for (const point of samples) {
        assert.ok([point.x, point.y, point.z, point.radius].every(Number.isFinite));
        assert.ok(Math.hypot(point.x, point.z) <= bore - 1 + 1e-8);
        assert.ok(point.y <= -1 && point.y >= -(height - 2) - 1e-8);
        assert.equal(point.wrinkling, progress);
      }
    }
  }
  const material = createFlameMaterial();
  assert.match(material.vertexShader, /uProgress/); assert.equal(material.depthWrite, false); material.dispose();
});

test('kernel and front exist only inside the recorded native burn window, including wraparound', () => {
  const rows = Array.from({ length: 144 }, (_, i) => [1200, 1700, 0, 0, 0, 0, i >= 138 || i < 8 ? 1 : 0]);
  const state = { rpm: 900, ignition: true, cycles: [{ cylinder: 1, samples: rows }] };
  const early = combustionAppearance(state, TAU * 2 * 138.2 / 144, 1);
  const later = combustionAppearance(state, TAU * 2 * 1.3 / 144, 1);
  assert.equal(early.stage, 'kernel'); assert.equal(later.stage, 'front');
  assert.ok(later.progress > early.progress);
  assert.equal(combustionAppearance({ ...state, ignition: false }, TAU * 2 * 1.3 / 144, 1).burning, false);
  assert.equal(combustionAppearance(state, TAU * 2 * 30 / 144, 1).stage, 'expansion');
  assert.equal(combustionAppearance(state, 0, 2).burning, false);
});

test('double exhaust downstream routes and both outlets retain separate three-cylinder native rates', () => {
  const cfg = copyConfig(), rates = [.3, .2, -.1, .7, .6, -.2];
  const state = { rpm: 1800, ignition: true, cycles: rates.map((rate, i) => ({ cylinder: i + 1, samples: [[100, 300, 0, 0, .1, rate, 0]] })) };
  for (const branch of ['collector-front', 'main-front', 'tail-front']) assert.ok(Math.abs(flowActivity('exhaust', undefined, branch, state, cfg, 0) - .4) < 1e-10);
  for (const branch of ['collector-rear', 'main-rear', 'tail-rear']) assert.ok(Math.abs(flowActivity('exhaust', undefined, branch, state, cfg, 0) - 1.1) < 1e-10);
  assert.equal(flowActivity('exhaust', undefined, 'tail-front', { ...state, rpm: 0 }, cfg, 0), 0);
  const outlets = [new Vector3(862, -61, 190), new Vector3(862, -61, 264)];
  const plume = createExhaustPlumes(outlets, [new Vector3(1, 0, 0), new Vector3(1, 0, 0)]);
  assert.equal(plume.points.geometry.getAttribute('position').count, 180);
  assert.equal(plume.points.geometry.getAttribute('bank').getX(0), 0);
  assert.equal(plume.points.geometry.getAttribute('bank').getX(179), 1);
  assert.equal(plume.points.visible, false); assert.deepEqual(plume.flow.toArray(), [0, 0]);
  plume.points.geometry.dispose(); plume.material.dispose();
});
