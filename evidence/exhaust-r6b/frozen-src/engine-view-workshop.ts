import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EngineThree } from './engine-three';
import { installWorkshopLighting } from './engine-view-lighting';
import { createWorkshopEnclosure, WORKSHOP_ENCLOSURE } from './engine-view-enclosure';

/** Authored workshop scenery. Geometry and maps are owned by the motor scene. */
export async function installTestCell(engine: EngineThree) {
  const room = new T.Group();
  room.name = 'workshop-test-cell';
  const textures: T.Texture[] = [];
  const loader = new T.TextureLoader();
  const maps = async (name: string, repeat: number) => {
    const images = await Promise.all(['diff', 'nor_gl', 'rough'].map(kind =>
      loader.loadAsync(`${import.meta.env.BASE_URL}textures/workshop/${name}_${kind}_1k.jpg`)));
    images.forEach(texture => {
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.anisotropy = Math.min(4, engine.renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
    });
    images[0].colorSpace = T.SRGBColorSpace;
    return { map: images[0], normalMap: images[1], roughnessMap: images[2] };
  };
  let floorMaps: Awaited<ReturnType<typeof maps>>, wallMaps: Awaited<ReturnType<typeof maps>>;
  try {
    [floorMaps, wallMaps] = await Promise.all([maps('concrete_floor_worn_001', 2), maps('painted_plaster_wall', 1.8)]);
  } catch (error) {
    textures.forEach(texture => texture.dispose());
    throw error;
  }
  const surface = (color: number, roughness = .75, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const floor = new T.MeshStandardMaterial({ ...floorMaps, color: 0x929994, roughness: .94, normalScale: new T.Vector2(.38, .38) });
  const wall = new T.MeshStandardMaterial({ ...wallMaps, color: 0xb3b6aa, roughness: .98, normalScale: new T.Vector2(.28, .28) });
  const lowerWall = new T.MeshStandardMaterial({ ...wallMaps, color: 0x64736d, roughness: .86, normalScale: new T.Vector2(.2, .2) });
  const steel = surface(0x282f30, .58, .48), zinc = surface(0x8e999a, .36, .74);
  const rubber = surface(0x161a1a, .98), blue = surface(0x314f61, .52, .35);
  const cabinetPaint = surface(0x743d34, .54, .3), wood = surface(0x776447, .83);
  const yellow = surface(0xb2a15c, .9), dark = surface(0x111616, .9);
  const hoseMaterial = surface(0x263e44, .76), white = surface(0xc1c4bb, .82);
  const light = new T.MeshBasicMaterial({ color: new T.Color(5.2, 4.8, 4.1), toneMapped: false });
  const drawings = new T.Group();
  room.add(drawings);
  const architecture = new T.Group(); architecture.name = 'workshop-wall-section'; room.add(architecture);
  const workstation = new T.Group(); workstation.name = 'workshop-workstation'; room.add(workstation);
  let meshParent: T.Group = room;
  const mesh = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
    const object = new T.Mesh(geometry, material); object.position.set(x, y, z); meshParent.add(object); return object;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: T.Material, bevel = 0) =>
    mesh(bevel ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 3, h / 3, d / 3)) : new T.BoxGeometry(w, h, d), material, x, y, z);
  const cylinder = (radius: number, height: number, x: number, y: number, z: number, material: T.Material, sides = 12) =>
    mesh(new T.CylinderGeometry(radius, radius, height, sides), material, x, y, z);
  const pipe = (points: number[][], radius: number, material: T.Material) => {
    const curve = new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point as [number, number, number])));
    return mesh(new T.TubeGeometry(curve, Math.max(10, points.length * 4), radius, 6, false), material, 0, 0, 0);
  };
  const label = (text: string, width: number, height: number, x: number, y: number, z: number, background = '#d4d6c8', ink = '#313d3c') => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = ink; ctx.font = '600 38px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 65, 475);
    const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
    const object = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map }));
    object.position.set(x, y, z); (meshParent === room ? drawings : meshParent).add(object);
  };

  // Scanned plaster and concrete, with joints, skirting and a painted dado.
  const fullFloor = box(WORKSHOP_ENCLOSURE.halfSize * 2, 20, WORKSHOP_ENCLOSURE.halfSize * 2, 0, -257, 0, floor);
  const floorUv = fullFloor.geometry.getAttribute('uv');
  for (let i = 0; i < floorUv.count; i++) floorUv.setXY(i, floorUv.getX(i) * WORKSHOP_ENCLOSURE.halfSize * 2 / 5200, floorUv.getY(i) * WORKSHOP_ENCLOSURE.halfSize * 2 / 4400);
  const enclosure = createWorkshopEnclosure(wall, lowerWall, white); room.add(enclosure);
  meshParent = architecture;
  box(4400, 2400, 25, 100, 940, -1100, wall);
  box(25, 2400, 3000, -2090, 940, 400, wall);
  box(4400, 450, 8, 100, -25, -1082, lowerWall);
  box(8, 450, 3000, -2072, -25, 400, lowerWall);
  box(4400, 15, 12, 100, 207, -1076, blue);
  box(4400, 50, 15, 100, -222, -1071, steel);
  meshParent = room;
  for (const x of [-1200, 0, 1200]) box(2.2, .5, 4400, x, -246.6, 0, steel);
  for (const z of [-900, 500, 1900]) box(5200, .5, 2.2, 100, -246.6, z, steel);

  // Modular acoustic absorbers with slim frames and narrow slatted surfaces.
  meshParent = architecture;
  for (const x of [-1250, -800, -350, 100]) {
    box(320, 560, 38, x, 570, -1050, steel, 3);
    box(300, 540, 9, x, 570, -1027, rubber);
    for (let i = 0; i < 22; i++) box(5, 526, 6, x - 144 + i * 13.7, 570, -1019, lowerWall, 1);
    for (const dx of [-146, 146]) for (const dy of [-266, 266]) {
      const screw = cylinder(3.2, 3, x + dx, 570 + dy, -1023, zinc, 6); screw.rotation.x = Math.PI / 2;
    }
  }
  // Conduit and junction boxes are fixed to the wall, rather than floating.
  for (const y of [260, 1030]) pipe([[-1800, y, -1057], [100, y, -1057], [1600, y, -1057]], 4.5, zinc);
  for (const x of [-1500, 400, 1510]) {
    pipe([[x, 1030, -1057], [x, 450, -1057], [x, 260, -1057]], 4.5, zinc);
    box(48, 62, 22, x, 270, -1040, white, 3);
    for (const dy of [-13, 13]) cylinder(4, 7, x, 270 + dy, -1025, dark).rotation.x = Math.PI / 2;
  }
  // Two complete suspended fittings: end caps, diffuser and suspension rods.
  meshParent = room;
  for (const x of [-650, 620]) {
    box(650, 32, 90, x, 1180, -200, steel, 5);
    box(622, 10, 74, x, 1159, -200, light, 3);
    for (const dx of [-270, 270]) cylinder(2, 430, x + dx, 1410, -200, zinc, 6);
  }

  // Welded dynamometer frame, levelling feet, slotted deck and hex fasteners.
  box(810, 45, 470, 15, -220, 0, blue, 5);
  box(768, 7, 432, 15, -193, 0, steel, 2);
  for (const z of [-170, 170]) {
    box(750, 5, 32, 15, -187, z, zinc, 2);
    for (let x = -300; x <= 300; x += 60) box(28, 2, 7, x, -183.5, z, dark, 2);
  }
  for (const x of [-290, 290]) for (const z of [-170, 170]) {
    cylinder(22, 12, x, -241, z, rubber);
    cylinder(10, 22, x, -226, z, zinc, 6);
  }
  for (const x of [-245, 245]) for (const z of [-135, 135]) {
    box(46, 94, 46, x, -139, z, blue, 2);
    box(92, 10, 70, x, -87, z, zinc, 2);
    cylinder(13, 9, x, -77, z, rubber);
    for (const dx of [-28, 28]) cylinder(5, 6, x + dx, -79, z, zinc, 6);
  }
  label('MOTORPRÜFSTAND', 140, 27, 15, -216, 237, '#c0c5bb');
  for (const z of [-400, 400]) box(1310, .7, 10, 110, -246, z, yellow);
  for (const x of [-545, 765]) box(10, .7, 800, x, -246, 0, yellow);
  // Low exhaust cradle supports the remote silencers above the same floor.
  for (const z of [-110, 110]) box(250, 22, 25, 860, -230, z, steel, 2);
  box(30, 145, 30, 860, -150, 0, steel, 2);
  box(150, 12, 210, 860, -72, 0, rubber, 4);

  // Full-height workshop bench: toe recess, separated drawer fronts and pulls.
  meshParent = workstation;
  const benchX = 1060, benchZ = -905;
  box(850, 650, 290, benchX, 104, benchZ, steel, 5);
  box(900, 35, 330, benchX, 447, benchZ, wood, 5);
  box(835, 25, 270, benchX, -234, benchZ, dark, 2);
  box(828, 630, 5, benchX, 104, benchZ - 148, blue, 2);
  for (const x of [785, 1060, 1335]) for (let i = 0; i < 6; i++) {
    const y = 370 - i * 96;
    box(262, 86, 8, x, y, -754, cabinetPaint, 2);
    box(211, 13, 12, x, y + 26, -743, zinc, 2);
    box(70, 11, 1, x, y - 20, -748.5, white);
  }
  // Narrow worktop laminations, vise, loose sockets and a tray of tools.
  for (let z = -1050; z < -760; z += 35) box(880, .5, 1, benchX, 465, z, steel);
  box(80, 13, 85, 740, 472, -820, zinc, 2);
  box(58, 45, 55, 740, 498, -820, blue, 4);
  for (const x of [719, 768]) box(16, 20, 66, x, 524, -820, zinc, 2);
  cylinder(6, 105, 766, 493, -820, zinc).rotation.z = Math.PI / 2;
  cylinder(4, 67, 818, 493, -820, zinc);
  box(165, 9, 100, 1180, 473, -855, dark, 3);
  for (let i = 0; i < 7; i++) {
    cylinder(7, 20, 1120 + i * 18, 485, -845, zinc, 10);
    cylinder(3.5, 1, 1120 + i * 18, 495.5, -845, dark, 8);
  }
  for (const x of [970, 1020, 1070]) {
    box(8, 4, 80, x, 472, -855, zinc, 2).rotation.y = -.25;
    box(14, 10, 38, x - 9, 477, -817, cabinetPaint, 3).rotation.y = -.25;
  }

  // Tool board with individual spanners, screwdriver handles and hanging hooks.
  box(780, 390, 18, 1060, 720, -1060, steel, 4);
  box(774, 384, 4, 1060, 720, -1071, blue, 2);
  for (let x = 700; x < 1430; x += 26) for (let y = 550; y < 900; y += 26) {
    const hole = cylinder(1.9, 2, x, y, -1049, dark, 6); hole.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 9; i++) {
    const x = 745 + i * 66, length = 110 + i * 9;
    box(11, length, 6, x, 700, -1037, zinc, 3);
    for (const y of [700 - length / 2, 700 + length / 2]) {
      const head = mesh(new T.TorusGeometry(12, 4, 5, 10), zinc, x, y, -1037);
      head.rotation.y = .1;
    }
    pipe([[x, 825, -1050], [x, 825, -1024], [x, 813, -1024]], 2.2, zinc);
  }
  label('WERKZEUGE', 170, 28, 1050, 895, -1048);

  // Diagnostic trolley, off-axis monitor and physical instrument console.
  meshParent = room;
  box(245, 27, 200, -760, 80, -480, steel, 4);
  box(245, 12, 200, -760, -170, -480, blue, 3);
  for (const x of [-865, -655]) for (const z of [-560, -400]) {
    box(14, 265, 14, x, -45, z, zinc, 2);
    cylinder(18, 15, x, -218, z, rubber).rotation.z = Math.PI / 2;
  }
  box(180, 95, 100, -760, 138, -480, blue, 4);
  for (const x of [-815, -758]) {
    cylinder(23, 9, x, 150, -424, steel).rotation.x = Math.PI / 2;
    cylinder(19, 2, x, 150, -418, white).rotation.x = Math.PI / 2;
    box(2, 19, 2, x + 3, 155, -415, cabinetPaint).rotation.z = -.45;
  }
  cylinder(8, 11, -708, 151, -423, cabinetPaint).rotation.x = Math.PI / 2;
  box(14, 110, 20, -760, 239, -506, steel, 2);
  box(202, 126, 16, -760, 313, -500, steel, 5);
  box(183, 106, 1, -760, 313, -490.5, dark);
  label('PRÜFSTAND', 160, 30, -760, 332, -489, '#13272a', '#8fa9a1');
  label('MESSPLATZ', 150, 25, -760, 303, -488, '#13272a', '#8fa9a1');

  // Service hoses and a floor drain anchor the installation to its surroundings.
  pipe([[-700, 85, -410], [-620, -140, -330], [-700, -237, -250], [-390, -239, -260], [-300, -125, -170]], 8, rubber);
  pipe([[350, -160, -160], [470, -238, -270], [290, -238, -580], [550, -238, -700], [630, 30, -850]], 7, hoseMaterial);
  for (let i = 0; i < 3; i++) {
    const coil = mesh(new T.TorusGeometry(95 + i * 12, 5, 6, 40), hoseMaterial, -1120, -239 + i * 3, -650);
    coil.rotation.x = Math.PI / 2;
  }
  box(280, 2, 100, -450, -245.2, -760, steel, 2);
  for (let i = 0; i < 23; i++) box(5, .8, 85, -582 + i * 12, -243.6, -760, dark);
  // A cylinder extinguisher, hose, handle and wall bracket at the service end.
  cylinder(35, 210, -1580, -115, -1020, cabinetPaint, 20);
  cylinder(23, 15, -1580, -2, -1020, steel);
  box(60, 10, 15, -1580, 14, -1020, steel, 2);
  pipe([[-1555, 0, -1010], [-1528, -40, -990], [-1540, -140, -990]], 5, rubber);
  label('CO₂', 30, 38, -1580, -90, -983, '#d2d0ba');

  // A shared soft contact decal gives heavy objects a believable floor contact.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d')!;
  const gradient = shadowContext.createRadialGradient(64, 64, 13, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.65)'); gradient.addColorStop(.55, 'rgba(0,0,0,.3)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
  const shadowMap = new T.CanvasTexture(shadowCanvas);
  const shadow = new T.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const [x, z, w, d] of [[15, 0, 1100, 700], [1060, -905, 1100, 600], [-760, -480, 400, 360]]) {
    const decal = mesh(new T.PlaneGeometry(w, d), shadow, x, -245.3, z); decal.rotation.x = -Math.PI / 2;
  }

  // All static geometry uses material batches; decals and labels retain ordering.
  let sourceMeshes = 0, triangles = 0, batchCount = 0;
  for (const group of [room, architecture, workstation]) {
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    for (const child of [...group.children]) if (child instanceof T.Mesh && child.material !== shadow) {
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      const material = child.material as T.Material, batch = batches.get(material) ?? [];
      batch.push(geometry); batches.set(material, batch);
      child.geometry.dispose(); group.remove(child); sourceMeshes++;
    }
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      if (geometry) { triangles += geometry.getAttribute('position').count / 3; group.add(new T.Mesh(geometry, material)); batchCount++; }
      geometries.forEach(item => item.dispose());
    }
  }
  room.userData = { sourceMeshes: sourceMeshes + enclosure.children.length, batches: batchCount + enclosure.children.length, triangles: triangles + enclosure.children.length * 2, textureMaps: textures.length, textures: 'Poly Haven CC0, 1K', revision: 'workshop-background-01', enclosure: 'four-walls-and-ceiling' };
  engine.scene.add(room);
  engine.renderer.setClearColor(0x535f5d);
  engine.host.dataset.workshop = JSON.stringify(room.userData);
  const grid = engine.scene.children.find(child => child instanceof T.GridHelper);
  if (grid instanceof T.GridHelper) for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.visible = false;
  return installWorkshopLighting(engine, room, architecture, workstation);
}
