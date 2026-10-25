import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createM54HeadCover} from '../src/engine-3d-head-cover';
import {CYLINDER_X} from '../src/engine-3d-model';
import {disposeSceneResources} from '../src/engine-three-resources';
const material=()=>new T.MeshStandardMaterial();
function sample(ho=0){const m={black:material(),rubber:material(),steel:material(),machined:material(),cast:material()};const cover=createM54HeadCover(ho,m);cover.root.updateMatrixWorld(true);return cover;}

test('head cover leaves both full cam sweep corridors open, including shifted deck datum',()=>{
  for(const ho of [0,8.4]){const c=sample(ho);for(const centre of [-23,23])for(let a=0;a<24;a++){
    const angle=a*Math.PI/12,y=279+ho+22.8*Math.cos(angle),z=centre+22.8*Math.sin(angle);
    const hits=new T.Raycaster(new T.Vector3(-307,y,z),new T.Vector3(1,0,0),0,614).intersectObject(c.root,true);
    assert.equal(hits.length,0,`cam envelope must clear the shell at z=${centre}, angle=${a}`);
  }disposeSceneResources(c.root);}
});

test('removing upper trim exposes six true plug-well holes above the recessed bridge',()=>{
  const c=sample();c.coilCover.removeFromParent();c.root.updateMatrixWorld(true);
  for(const x of CYLINDER_X){const ray=new T.Raycaster(new T.Vector3(x,315,0),new T.Vector3(0,-1,0),0,24);assert.equal(ray.intersectObject(c.root,true).length,0);}
  assert.ok(c.valveCover.parent===c.root);const [x,y,z]=c.root.userData.oilFiller;assert.ok(x<0&&z<0);assert.ok(new T.Raycaster(new T.Vector3(x,y+20,z),new T.Vector3(0,-1,0),0,30).intersectObject(c.valveCover,true).length>0,'oil cap remains with functional cover');disposeSceneResources(c.coilCover);disposeSceneResources(c.root);
});

test('upper front enclosure respects chain planes and the agreed -375 VANOS frontier',()=>{
  const c=sample(),bounds=new T.Box3().setFromObject(c.root);assert.ok(bounds.min.x>=-375.001);
  for(const y of [260,279,297,301])for(const z of [-45,-23,0,23,45]){
    const hits=new T.Raycaster(new T.Vector3(-337,y,z),new T.Vector3(1,0,0),0,23).intersectObject(c.root,true);assert.equal(hits.length,0,'fixed timing envelope must remain open');
  }let count=0;c.root.traverse(o=>{if(o instanceof T.Mesh){count++;const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));assert.equal((o.material as T.Material).depthTest,true);}});assert.ok(count<=7,'stationary details must batch within the two removable groups');disposeSceneResources(c.root);
});

test('both thin bank skins face outward with ordinary front-face materials',()=>{
  const c=sample();c.coilCover.removeFromParent();c.root.updateMatrixWorld(true);
  for(const side of [-1,1]){const hits=new T.Raycaster(new T.Vector3(0,285,side*140),new T.Vector3(0,0,-side)).intersectObject(c.valveCover,true);assert.ok(hits.length>0,'outer side must render without DoubleSide');assert.ok(hits[0].point.z*side>60);}
  for(const z of [-45,45]){const hits=new T.Raycaster(new T.Vector3(0,350,z),new T.Vector3(0,-1,0)).intersectObject(c.valveCover,true);assert.ok(hits.length>0);assert.ok(hits[0].point.y>310,'both outer roof banks must face upward');}
  disposeSceneResources(c.coilCover);disposeSceneResources(c.root);
});
