import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const path='evidence/camshaft-character/acceptance.json',data=JSON.parse(readFileSync(path,'utf8'));
const byName=Object.fromEntries(data.runs.map(r=>[r.camshaft,r]));
const series=byName.standard,sport=byName.sport,race=byName.race;
assert.ok(series&&sport&&race,'Alle drei nativen Aufbauten fehlen.');
for(const run of [series,sport,race]){
 assert.ok(run.idleMeanRpm>450&&run.idleMeanRpm<1600,'Selbständiger Leerlauf');
 assert.ok(run.idleMinRpm>350,'Keine Absteller im erfassten Leerlauf');
 assert.ok(run.highCount>=25,'Zu wenige native Proben im oberen Drehzahlbereich');
 assert.ok(Number.isFinite(run.rise5000to6200S)&&run.rise5000to6200S>0);
 const rows=run.rise.filter(r=>r.rpm>=4800&&r.rpm<=6400);
 const gap=Math.max(...rows.slice(1).map((r,i)=>r.t-rows[i].t));
 assert.ok(gap<.18,'Telemetrielücke verhindert verlässlichen Vergleich.');
 run.upperTelemetryMaxGapS=gap;
}
assert.ok(sport.rise5000to6200S<series.rise5000to6200S*.98,'Sport zieht obenrum nicht nachweisbar stärker.');
assert.ok(race.rise5000to6200S<series.rise5000to6200S*.9,'Racing-Abstufung obenrum zu klein.');
assert.ok(race.idleRpmSd>series.idleRpmSd*2,'Racing-Leerlauf zu gleichmäßig.');
assert.ok(race.idleAudio.envelopeCv>series.idleAudio.envelopeCv*1.6,'Racing-PCM hat zu wenig normierte Hüllkurvenunruhe.');
const result={passed:true,source:path,fixture:data.upperRangeFixture,runs:[series,sport,race].map(r=>({camshaft:r.camshaft,idleMeanRpm:r.idleMeanRpm,idleMinRpm:r.idleMinRpm,idleMaxRpm:r.idleMaxRpm,idleRpmSd:r.idleRpmSd,audioEnvelopeCv:r.idleAudio.envelopeCv,rise5000to6200S:r.rise5000to6200S,upperRiseTimeReductionPercent:(1-r.rise5000to6200S/series.rise5000to6200S)*100,upperTelemetryMaxGapS:r.upperTelemetryMaxGapS}))};
writeFileSync('evidence/camshaft-character/summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
