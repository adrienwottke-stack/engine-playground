import test from 'node:test';
import assert from 'node:assert/strict';
import { M54Presence } from '../native/sound-m54-r6.presence.mjs';

test('presence corrects the measured low-mid emphasis and opens existing upper harmonics',()=>{
  for(const rate of [44100,48000]){
    const eq=new M54Presence(rate);
    assert.ok(eq.responseDb(100)<-3);
    assert.ok(eq.responseDb(400)<-3);
    assert.ok(eq.responseDb(1150)>8);
    assert.ok(eq.responseDb(2500)>4&&eq.responseDb(2500)<10);
  }
});
test('44.1 and 48kHz have equivalent audible EQ response',()=>{
  const a=new M54Presence(44100),b=new M54Presence(48000);
  for(const hz of [50,100,200,400,800,1150,1600,2500,4000])assert.ok(Math.abs(a.responseDb(hz)-b.responseDb(hz))<.12);
});
test('chunk boundaries do not change phase, amplitude, sample count or introduce a buffered delay',()=>{
  const input=Float64Array.from({length:10000},(_,i)=>.07*Math.sin(i*.03)+.02*Math.cos(i*.15));
  const full=new M54Presence().processBlock(input),stream=new M54Presence();
  const split=new Float64Array(input.length);
  for(let at=0;at<input.length;at+=128)split.set(stream.processBlock(input.subarray(at,at+128)),at);
  assert.deepEqual(split,full);
  const impulse=new Float64Array(2048);impulse[0]=1;
  const response=new M54Presence().processBlock(impulse);
  assert.notEqual(response[0],0);
  assert.ok(response.every(Number.isFinite));
});
test('streaming measured frequency gain agrees with the analytical filter response',()=>{
  const rate=44100,hz=1150,eq=new M54Presence(rate);let inputEnergy=0,outputEnergy=0;
  for(let i=0;i<rate;i++){
    const x=.01*Math.sin(2*Math.PI*hz*i/rate),y=eq.process(x);
    if(i>rate/2){inputEnergy+=x*x;outputEnergy+=y*y;}
  }
  assert.ok(Math.abs(10*Math.log10(outputEnergy/inputEnergy)-eq.responseDb(hz))<.02);
});
test('silence stays silent, reset clears tails and disabled processing has a trivial identity',()=>{
  const eq=new M54Presence();assert.ok(eq.processBlock(new Float64Array(1000)).every(x=>x===0));
  eq.process(1);eq.reset();assert.equal(eq.process(0),0);
  const bypass=new M54Presence(44100,[]);assert.deepEqual([...bypass.processBlock(Float64Array.of(.1,-.2,0))],[.1,-.2,0]);
});
test('invalid sample rates and parameters fail before an audio stream starts',()=>{
  assert.throws(()=>new M54Presence(0));assert.throws(()=>new M54Presence(44100,[{type:'peak',hz:30000,gainDb:2,q:1}]));
  assert.throws(()=>new M54Presence(44100,[{type:'peak',hz:500,gainDb:2,q:0}]));
});
