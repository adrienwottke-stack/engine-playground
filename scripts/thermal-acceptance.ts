import {Simulation,copyConfig,THERMAL_LIMITS} from '../src/model';
import {writeFileSync} from 'node:fs';
function run(name:string,watts:number,options:Record<string,number|boolean>={},speed=0,warm=false){
 const c=copyConfig();Object.assign(c.cooling,options);const sim=new Simulation(c);if(warm)sim.resetThermal([105,95,70]);
 let minC=sim.state.coolantC,maxC=minC,maxResidual=0,at300:any,at600:any;
 for(let i=0;i<180000;i++){sim.thermalStep(.02,watts,speed);minC=Math.min(minC,sim.state.coolantC);maxC=Math.max(maxC,sim.state.coolantC);maxResidual=Math.max(maxResidual,Math.abs(sim.state.energyResidualJ));if(i===14999)at300=sim.snapshot();if(i===29999)at600=sim.snapshot();if(sim.state.thermalHalted)break;}
 return {name,watts,speedMs:speed,config:c.cooling,at300,at600,final:sim.snapshot(),minC,maxC,maxResidualJ:maxResidual};
}
const cases=[run('idle10kW',10000),run('standstill25kW',25000),run('standstill60kW',60000),run('road100kW',100000,{},100/3.6),run('pump-off100kW',100000,{flowLMin:0},0,true),run('radiator-off100kW',100000,{radiatorWPerK:0},0,true),run('fan-off25kW',25000,{fan:0}),run('full-fan25kW',25000,{fan:3}),run('zero-heat',0)];
const gEC=50+900*45/55,gCR=45/60*3800,gRA=240*(.2+.8/3),flowW=25000/(1+15*(1/gRA+1/gCR+1/gEC));
const old={sourceW:25000,engineC:22+flowW*(1/gRA+1/gCR+1/gEC),coolantC:22+flowW*(1/gRA+1/gCR),radiatorC:22+flowW/gRA};
writeFileSync('evidence/cooling-v041-scenarios.json',JSON.stringify({scope:'Deterministic lumped thermal model, not measured BMW calibration',limits:THERMAL_LIMITS,old25kWEquilibrium:old,cases},null,2));
console.log(JSON.stringify({old,cases:cases.map(c=>({name:c.name,coolantC:c.final.coolantC,engineC:c.final.engineC,returnC:c.final.radiatorC,thermalTimeS:c.final.thermalTimeS,status:c.final.thermalStatus,energyErrorJ:c.maxResidualJ,fanDuty:c.final.fanDuty}))},null,2));
