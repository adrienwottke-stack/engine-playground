import * as T from 'three';

/** Authored oval stainless finishers, not measured OEM geometry. The centre of
 * each mouth remains the shared flow outlet; there is no torus or end-cap disc. */
export function createExhaustTips(outlets:number[][],mat:(color:number,metalness?:number,roughness?:number)=>T.MeshStandardMaterial){
  const group=new T.Group();group.name='Hohle Edelstahl Doppelendrohre';
  const steel=mat(0xb3bec3,.84,.26),lip=mat(0xdce1e3,.88,.22),inside=mat(0x1d2326,.08,.94);
  const surfaces:[number[][],T.Material][]=[
    [[[20.8,-62],[20.8,-55],[22.9,-44],[24.7,-8],[24.7,-1.4]],steel],
    [[[24.7,-1.4],[24.55,-.65],[24.1,-.12],[23.45,.08],[22.8,-.17],[22.35,-.68],[22.2,-1.4]],lip],
    // Continue the soot-lined passage into the rear can. Otherwise its bright
    // transport tube ends visibly inside the mouth as a floating silver shard.
    [[[22.2,-1.4],[22.2,-8],[18.3,-44],[18.3,-55],[18.3,-140]],inside],
  ];
  for(const outlet of outlets)for(const [profile,material] of surfaces){
    const geometry=new T.LatheGeometry(profile.map(([radius,x])=>new T.Vector2(radius,x)),64);
    geometry.rotateZ(-Math.PI/2);
    // A restrained oval section and slight slash cut. All three surfaces share
    // the transform, so their seams remain continuous.
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const y=positions.getY(i)*.94,z=positions.getZ(i)*1.08;
      positions.setXYZ(i,positions.getX(i)-y*.12,y,z);
    }
    geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,material);mesh.position.fromArray(outlet);group.add(mesh);
  }
  return group;
}
