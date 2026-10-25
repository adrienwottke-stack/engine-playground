import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_SOUND,referenceScript,validateSound} from '../native/reference-settings.mjs';
import {copyConfig,TAU} from '../src/model';
import {shaftGeometry,cycleSample} from '../src/native-view';
test('reference preserves the original M52 engine body; only its host and IR selection are supplied',()=>{
 const base=readFileSync(new URL('../native/headless/assets/engines/bmw/M52B28.mr',import.meta.url),'utf8');
 const result=referenceScript(base,{...DEFAULT_SOUND,preset:'m52'},[99,100,160]);
 assert.ok(result.startsWith(base));assert.ok(result.includes('set_engine(M52B28())'));
 assert.ok(result.includes('throw: 84 * units.mm / 2'));assert.ok(result.includes('tdc: 120.0 * units.deg'));
 assert.ok(referenceScript(base,{...DEFAULT_SOUND,preset:'m52',impulse:'sharp_0'},[84,84,135]).includes('impulse_response: ir_lib.sharp_0'));
});
test('sound settings reject nonfinite values and arbitrary script/IR names',()=>{
 for(const patch of [{hfGain:NaN},{noise:2},{preset:'../main'},{impulse:'bad) node evil'},{idleAssist:1}])assert.throws(()=>validateSound({...DEFAULT_SOUND,...patch}));
 assert.equal(validateSound().idleAssist,false);
});
test('geometry honors the native crank TDC and selected journal, with exact rod length',()=>{
 const cfg=copyConfig();cfg.engine.strokeMm=84;
 const s={tdcRad:TAU/3,journalAngles:[0,TAU/3,2*TAU/3,2*TAU/3,TAU/3,0]};
 for(let c=1;c<=6;c++)for(let angle=0;angle<2*TAU;angle+=.07){const g=shaftGeometry(angle,c,cfg,s);assert.ok(Math.abs(Math.hypot(g.crankX,g.crankY-g.pistonY)-135)<1e-8);assert.ok(g.travel>=-1e-8&&g.travel<=84+1e-8);}
});
test('slow cutaway uses its corresponding calculated cycle bin, never another cylinder or a guessed combustion',()=>{
 const s={cycle:{cylinder:3,samples:[[500,800,3,0,.2,0,1],null]}};
 assert.equal(cycleSample(s,0,3,true)?.pressureKpa,500);assert.equal(cycleSample(s,0,3,true)?.burning,true);
 assert.equal(cycleSample(s,0,2,true),null);assert.equal(cycleSample(s,TAU,3,true),null);
});
