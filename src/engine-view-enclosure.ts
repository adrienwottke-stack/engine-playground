import * as T from 'three';

/** The inspection camera stays inside this continuous workshop shell. */
export const WORKSHOP_ENCLOSURE = Object.freeze({
  halfSize: 7200, floorY: -247, ceilingY: 6900,
  maxOrbit: 4500, maxPan: 1800, minTargetY: -100, far: 24000,
  maxPolarAngle: Math.PI / 2 - .04,
});

export function createWorkshopEnclosure(wall: T.Material, dado: T.Material, ceiling: T.Material) {
  const group = new T.Group(); group.name = 'workshop-continuous-background';
  const b = WORKSHOP_ENCLOSURE, width = b.halfSize * 2, height = b.ceilingY - b.floorY;
  const panel = (w: number, h: number, x: number, y: number, z: number, turn: number, material: T.Material) => {
    const geometry = new T.PlaneGeometry(w, h);
    // Preserve the physical plaster scale on the more distant room surfaces.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3600, uv.getY(i) * h / 3600);
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = turn;
    group.add(mesh); return mesh;
  };
  for (const [x, z, turn] of [[0, -b.halfSize, 0], [0, b.halfSize, Math.PI], [-b.halfSize, 0, Math.PI / 2], [b.halfSize, 0, -Math.PI / 2]]) {
    panel(width, height, x, b.floorY + height / 2, z, turn, wall);
    const normal = new T.Vector3(0, 0, 1).applyAxisAngle(new T.Vector3(0, 1, 0), turn);
    panel(width, 700, x + normal.x, b.floorY + 350, z + normal.z, turn, dado);
  }
  const roof = new T.Mesh(new T.PlaneGeometry(width, width), ceiling);
  roof.position.y = b.ceilingY; roof.rotation.x = Math.PI / 2; group.add(roof);
  return group;
}
