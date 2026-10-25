import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coolantColor,coolingBranches} from '../src/cooling-view';
test('bypass mixing conserves flow and temperature at both thermostat extremes',()=>{
 assert.deepEqual(coolingBranches(45,0,95,70),{radiator:0,bypass:45,mixed:95});
 assert.deepEqual(coolingBranches(45,45,95,70),{radiator:45,bypass:0,mixed:70});
 assert.equal(coolingBranches(45,15,95,65).mixed,85);
 assert.equal(coolingBranches(0,0,95,65).mixed,95);
});
test('temperature colour stays continuous across the former 80 degree switch',()=>{
 const channels=(t:number)=>coolantColor(t).match(/\d+/g)!.map(Number);
 const a=channels(79.99),b=channels(80.01);
 assert.ok(a.every((v,i)=>Math.abs(v-b[i])<=1));
 assert.equal(coolantColor(-20),coolantColor(20));
 assert.equal(coolantColor(200),coolantColor(120));
 assert.notEqual(coolantColor(22),coolantColor(95));
});
