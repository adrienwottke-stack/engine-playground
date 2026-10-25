import test from 'node:test';
import assert from 'node:assert/strict';
import {followGauge} from '../src/gauge-motion';

test('needle reaches 90 percent of a new reading within 60 ms without overshoot',()=>{
 let value=0;for(let t=0;t<60;t+=10)value=followGauge(value,6000,10);
 assert.ok(value>5400&&value<6000);
 assert.equal(followGauge(NaN,1200,16),1200);
 assert.equal(followGauge(5000,0,16,true),0);
});
test('needle response is independent of frame rate and does not extrapolate stale data',()=>{
 let a=0,b=0;for(let i=0;i<6;i++)a=followGauge(a,3000,10);for(let i=0;i<3;i++)b=followGauge(b,3000,20);
 assert.ok(Math.abs(a-b)<1e-8);
 for(let i=0;i<100;i++)a=followGauge(a,3000,16);
 assert.equal(a,3000);assert.ok(followGauge(a,0,16)<a);
});
