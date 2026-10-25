import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyConfig,TAU} from '../src/model';
import {coolingCylinderPose,fluidMarkers} from '../src/cooling-motion';
test('cooling pistons share native crank geometry, constant rod length and full stroke',()=>{
 const cfg=copyConfig(),state={tdcRad:Math.PI/2,journalAngles:[0,TAU/3,2*TAU/3,2*TAU/3,TAU/3,0]};
 for(let cylinder=1;cylinder<=6;cylinder++){
  let lo=Infinity,hi=-Infinity;
  for(let angle=0;angle<TAU;angle+=.01){
   const p=coolingCylinderPose(angle,cylinder,cfg,state);
   assert.ok(Math.abs(Math.hypot(p.pinX-p.axis,p.pinY-p.wristY)-cfg.engine.rodMm*.43)<1e-9);
   assert.ok(p.pistonTop>=63&&p.pistonTop+19<=136);
   lo=Math.min(lo,p.pistonTop);hi=Math.max(hi,p.pistonTop);
  }
  assert.ok(Math.abs(hi-lo-cfg.engine.strokeMm*.43)<.01);
 }
 const a=coolingCylinderPose(.4,1,cfg,state),b=coolingCylinderPose(.4,6,cfg,state),other=coolingCylinderPose(.4,2,cfg,state);
 assert.equal(a.pistonTop,b.pistonTop);assert.notEqual(a.pistonTop,other.pistonTop);
});
test('flow tracers follow bends without crossing the path and preserve direction',()=>{
 const a=fluidMarkers([[0,0],[60,0],[60,60]],10,24);
 assert.deepEqual(a.map(p=>[p.x,p.y]),[[10,0],[34,0],[58,0],[60,22],[60,46]]);
 assert.equal(a[0].angle,0);assert.equal(a[3].angle,Math.PI/2);
 assert.deepEqual(fluidMarkers([[2,2],[2,2]],10),[]);
 assert.deepEqual(fluidMarkers([[0,0],[60,0],[60,60]],34,24),a);
});
