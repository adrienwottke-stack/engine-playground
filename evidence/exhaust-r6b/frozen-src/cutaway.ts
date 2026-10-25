import {coolingEngine,coolingRadiator} from './cooling-hardware';
import {coolantColor, coolingBranches} from './cooling-view';
import { prepareCanvas, drawEngine, type ViewState } from './drawing';
import { TAU, mod, pistonGeometry, type Config } from './model';

const C = { text: '#deeceb', muted: '#8da8b0', line: '#36505c', air: '#7ed6be', fuel: '#e6c477', exhaust: '#ef9872', water: '#78b5e4', metal: '#96b0bb', dark: '#0d1c24' };
type Point = [number, number];
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = C.muted, size = 13, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.font = `${size}px "Segoe UI", sans-serif`; ctx.fillText(value, x, y);
}
function path(ctx: CanvasRenderingContext2D, points: Point[], color: string, width = 3) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
}
function flow(ctx: CanvasRenderingContext2D, points: Point[], color: string, clock: number, speed: number, active = true) {
  path(ctx, points, '#233d48', 16); path(ctx, points, color, 2);
  if (!active || speed <= 0) return;
  const lengths = points.slice(1).map((p,i) => Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  const total = lengths.reduce((a,b) => a+b,0);
  for (let k=0;k<Math.ceil(total/32);k++) {
    let distance = mod(k*32+clock*speed,total), segment=0;
    while (segment<lengths.length-1 && distance>lengths[segment]) distance -= lengths[segment++];
    const a=points[segment],b=points[segment+1],f=distance/lengths[segment];
    const x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f,angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-3);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
  }
}
function box(ctx: CanvasRenderingContext2D, x: number,y: number,w: number,h: number,color=C.line) {
  ctx.fillStyle='#182d37';ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fill();ctx.stroke();
}
function rotor(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,angle:number,color:string,spokes=6){
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
  for(let i=0;i<spokes;i++){const a=angle+i*TAU/spokes;path(ctx,[[x+Math.cos(a)*8,y+Math.sin(a)*8],[x+Math.cos(a)*(r-5),y+Math.sin(a)*(r-5)]],color,3);}
  ctx.fillStyle=C.dark;ctx.beginPath();ctx.arc(x,y,7,0,TAU);ctx.fill();
}

export function drawCutaway(canvas:HTMLCanvasElement,s:ViewState|null,cfg:Config,angle:number,clock:number,detail:boolean,cylinder:number,slow:boolean,frozen:boolean) {
  if(!detail){drawEngine(canvas,s,cfg,angle,slow,frozen);return;}
  const mobile=canvas.getBoundingClientRect().width<500, W=mobile?600:900,H=560;
  const ctx=prepareCanvas(canvas,W,H),x=W/2,top=160,crankY=445,scale=1.22;
  const g=pistonGeometry(angle,cylinder,cfg.engine.strokeMm,cfg.engine.rodMm),pistonY=crankY+g.pistonY*scale;
  const pin:Point=[x+g.crankX*scale,crankY+g.crankY*scale],bore=cfg.engine.boreMm*scale;
  const moving=!!s && (s.rpm||0)>5 && !frozen;
  const intake=g.stage===2&&moving,exhaust=g.stage===1&&moving,burning=g.stage===0&&g.phase<2&&moving&&!!s?.ignition;
  for(let i=25;i<W;i+=30)path(ctx,[[i,35],[i,525]],'#172c35',1);
  for(let i=35;i<525;i+=30)path(ctx,[[25,i],[W-25,i]],'#172c35',1);

  // Port injection into the intake runner; the illustration is cycle based, not CFD.
  const intakePath:Point[]=[[55,145],[x-155,145],[x-83,145],[x-33,174]];
  flow(ctx,intakePath,C.air,clock,intake?110:35,moving);
  box(ctx,37,119,60,51,C.air);text(ctx,'Luftfilter',67,149,C.air,10,'center');
  text(ctx,'ANSAUGTRAKT',42,98,C.air,13);
  path(ctx,[[x-155,59],[x-155,104],[x-115,128]],C.fuel,7);
  box(ctx,x-210,41,120,30,C.fuel);text(ctx,'KRAFTSTOFF',x-150,61,C.fuel,11,'center');
  ctx.save();ctx.translate(x-115,128);ctx.rotate(.55);ctx.fillStyle=C.fuel;ctx.fillRect(-5,-12,10,25);ctx.restore();
  text(ctx,'Einspritzung',x-240,114,C.fuel,12);
  if(intake)for(let i=0;i<13;i++){const f=mod(i/13+clock*1.5,1);ctx.fillStyle=C.fuel;ctx.beginPath();ctx.arc(x-110+f*78,135+f*32+(i%3-1)*6,2.2,0,TAU);ctx.fill();}
  const exhaustPath:Point[]=[[x+33,174],[x+91,139],[W-72,139],[W-42,103]];
  flow(ctx,exhaustPath,C.exhaust,clock,exhaust?140:35,moving);
  text(ctx,'ABGAS',W-43,78,C.exhaust,13,'right');

  // Transparent water jacket on both cylinder walls, linked to a pump and radiator.
  const right=W-55;
  const loop:Point[]=[[x-70,303],[x-70,182],[x+70,182],[x+70,311],[right,311],[right,403],[x-148,403],[x-148,303],[x-70,303]];
  flow(ctx,loop,C.water,clock,cfg.cooling.flowLMin*.7,!!s);
  box(ctx,right-28,289,57,96,C.water);
  for(let i=0;i<7;i++)path(ctx,[[right-19,300+i*11],[right+19,300+i*11]],C.water,1);
  text(ctx,'KÜHLER',right,282,C.water,11,'center');
  rotor(ctx,x-148,403,17,clock*cfg.cooling.flowLMin*.045,C.water,5);
  text(ctx,'Pumpe',x-148,437,C.water,12,'center');
  text(ctx,`${cfg.cooling.flowLMin} L/min`,x-148,455,C.water,11,'center');
  ctx.fillStyle='#74b1e423';ctx.fillRect(x-bore/2-16,top+25,12,138);ctx.fillRect(x+bore/2+4,top+25,12,138);

  // Machined cylinder, head, valves, piston rings and exact connecting rod geometry.
  box(ctx,x-bore/2-11,top+12,bore+22,158,C.metal);
  ctx.fillStyle=C.dark;ctx.fillRect(x-bore/2+2,top+14,bore-4,155);
  const gas=ctx.createLinearGradient(0,top,0,pistonY);
  gas.addColorStop(0,burning?'#efbf5c99':intake?'#77d9b644':exhaust?'#e9876544':'#b4a7cf44');gas.addColorStop(1,'#192a3333');
  ctx.fillStyle=gas;ctx.fillRect(x-bore/2+3,top+18,bore-6,Math.max(1,pistonY-14-top-18));
  if(burning){ctx.save();ctx.beginPath();ctx.rect(x-bore/2+3,top+18,bore-6,Math.max(1,pistonY-top-32));ctx.clip();
    for(let i=0;i<12;i++){const a=i*2.399,rad=(18+g.phase*30)*(1+(i%4)*.22);path(ctx,[[x,top+27],[x+Math.sin(a)*rad,top+27+Math.abs(Math.cos(a))*rad]],i%2?C.exhaust:C.fuel,3);}
    ctx.restore();
  }
  box(ctx,x-bore/2-18,top-27,bore+36,41,C.metal);
  for(const [dx,open,color] of [[-28,intake,C.air],[28,exhaust,C.exhaust]] as const){
    const lift=open?Math.sin(mod(g.phase,Math.PI))*11:0;
    path(ctx,[[x+dx,top-43],[x+dx,top+14+lift]],color,3);
    path(ctx,[[x+dx-12,top+14+lift],[x+dx+12,top+14+lift]],color,5);
    path(ctx,[[x+dx-8,top-12],[x+dx+8,top-7],[x+dx-8,top-2],[x+dx+8,top+3]],C.metal,1.2);
  }
  path(ctx,[[x,top-39],[x,top+17]],C.fuel,5);
  if(burning&&g.phase<.22){ctx.strokeStyle='#fff0b8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-7,top+18);ctx.lineTo(x+5,top+25);ctx.lineTo(x-3,top+32);ctx.stroke();}
  text(ctx,'Zündkerze',x+14,top-45,C.fuel,11);
  path(ctx,[[x,pistonY],pin],'#304957',18);path(ctx,[[x,pistonY],pin],C.metal,10);
  rotor(ctx,x,crankY,cfg.engine.strokeMm/2*scale+16,-g.phase,'#527782',3);
  path(ctx,[[x,crankY],pin],C.metal,15);
  ctx.fillStyle='#203943';ctx.strokeStyle=C.metal;ctx.lineWidth=2;ctx.beginPath();ctx.arc(...pin,10,0,TAU);ctx.fill();ctx.stroke();
  const metal=ctx.createLinearGradient(x-bore/2,0,x+bore/2,0);metal.addColorStop(0,'#728d9b');metal.addColorStop(.5,'#d3e0df');metal.addColorStop(1,'#587585');
  ctx.fillStyle=metal;ctx.strokeStyle='#d0e0e3';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-bore/2+3,pistonY-16,bore-6,35,4);ctx.fill();ctx.stroke();
  for(let i=0;i<3;i++)path(ctx,[[x-bore/2+4,pistonY-10+i*5],[x+bore/2-4,pistonY-10+i*5]],'#314956',2);
  ctx.fillStyle='#223e49';ctx.beginPath();ctx.arc(x,pistonY+5,5,0,TAU);ctx.fill();
  if(!mobile){
    text(ctx,'Einlassventil',x-95,top-40,C.air,12,'right');text(ctx,'Auslassventil',x+95,top-13,C.exhaust,12);
    text(ctx,'Kühlmantel',x+95,244,C.water,12);text(ctx,'Kolben & Ringe',x-100,pistonY+5,C.metal,12,'right');text(ctx,'Pleuel',x+97,353,C.metal,12);
  }
  text(ctx,`ZYLINDER ${cylinder}`,x,26,C.text,14,'center');
  text(ctx,['ARBEIT / EXPANSION','ABGAS AUSSCHIEBEN','LUFT + KRAFTSTOFF ANSAUGEN','GEMISCH VERDICHTEN'][g.stage],x,526,[C.fuel,C.exhaust,C.air,'#b5a8d6'][g.stage],14,'center');
  text(ctx,slow?'Ein 720°-Zyklus in Zeitlupe · Flusswege schematisch':'Gemeinsamer Kurbelwinkel · Flusswege schematisch',x,549,C.muted,11,'center');
}

const thermalNumber=new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
const coolingMotion=new WeakMap<HTMLCanvasElement,{time:number;main:number;rad:number;bypass:number;fan:number}>();
export function drawCoolantLoop(canvas:HTMLCanvasElement,s:ViewState|null,cfg:Config,clock:number,angle:number){
  const mobile=canvas.clientWidth<650,W=mobile?500:900,H=mobile?950:610;
  const aspect=`${W} / ${H}`;if(canvas.style.aspectRatio!==aspect)canvas.style.aspectRatio=aspect;
  const ctx=prepareCanvas(canvas,W,H);
  const hot=s?.coolantC??cfg.cooling.ambientC,cold=s?.radiatorC??cfg.cooling.ambientC;
  const active=!!s&&!s.thermalHalted,total=active?cfg.cooling.flowLMin:0;
  const b=coolingBranches(total,active?(s?.radiatorFlowLMin??0):0,hot,cold);
  let m=coolingMotion.get(canvas);if(!m){m={time:clock,main:0,rad:0,bypass:0,fan:0};coolingMotion.set(canvas,m);}
  const dt=Math.max(0,Math.min(.1,clock-m.time));m.time=clock;
  m.main+=dt*total*.9;m.rad+=dt*b.radiator*.9;m.bypass+=dt*b.bypass*.9;m.fan+=dt*(active?(s?.fanDuty??0):0)*8;
  const pipe=(points:Point[],temperature:number,phase:number,q:number)=>flow(ctx,points,coolantColor(temperature),phase,1,q>0);
  const engineMotion={angle,config:cfg,state:s,phase:m.main,flow:total,inletC:b.mixed};
  const n=(v:number)=>thermalNumber.format(v);
  const junction=mobile?430:475,top=mobile?100:120,bottom=mobile?790:470,pump=mobile?90:270;
  if(mobile){
    pipe([[175,142],[175,100],[junction-16,top]],hot,m.main,total);
    pipe([[junction+16,top],[480,top],[480,485],[385,485],[385,505]],hot,m.rad,b.radiator);
    pipe([[391,720],[480,720],[480,bottom],[190,bottom]],cold,m.rad,b.radiator);
    pipe([[junction,top+16],[junction,450],[190,450],[190,bottom]],hot,m.bypass,b.bypass);
    pipe([[190,bottom],[pump+27,bottom]],b.mixed,m.main,total);
    pipe([[pump-27,bottom],[18,bottom],[18,291],[41,291]],b.mixed,m.main,total);
    coolingEngine(ctx,45,150,360,218,hot,engineMotion);
    coolingRadiator(ctx,245,515,210,200,hot,cold,m.fan,m.rad,b.radiator);
  }else{
    pipe([[150,163],[150,top],[junction-16,top]],hot,m.main,total);
    pipe([[junction+16,top],[805,top],[805,161]],hot,m.rad,b.radiator);
    pipe([[811,376],[875,376],[875,bottom],[junction,bottom]],cold,m.rad,b.radiator);
    pipe([[junction,top+16],[junction,bottom]],hot,m.bypass,b.bypass);
    pipe([[junction,bottom],[pump+27,bottom]],b.mixed,m.main,total);
    pipe([[pump-27,bottom],[12,bottom],[12,299],[26,299]],b.mixed,m.main,total);
    coolingEngine(ctx,30,170,330,200,hot,engineMotion);
    coolingRadiator(ctx,665,171,210,200,hot,cold,m.fan,m.rad,b.radiator);
  }
  const engineX=mobile?250:205;
  text(ctx,'SECHS ZYLINDER · SCHNITT',engineX,mobile?385:390,C.text,mobile?15:13,'center');
  text(ctx,`Block ${n(s?.engineC??cfg.cooling.ambientC)} °C`,engineX,mobile?410:414,C.fuel,mobile?21:19,'center');
  text(ctx,`Block → Wasser ${n(s?.engineCoolantKw??0)} kW`,engineX,434,C.muted,mobile?14:11,'center');
  text(ctx,'MOTOR-AUSGANG',mobile?150:230,mobile?43:51,C.muted,mobile?13:11,'center');
  text(ctx,`${n(hot)} °C`,mobile?150:230,mobile?75:82,coolantColor(hot),27,'center');
  // Closed housing and hoses terminating at the impeller boundary.
  ctx.fillStyle=C.dark;ctx.strokeStyle=C.metal;ctx.lineWidth=2;ctx.beginPath();ctx.arc(pump,bottom,27,0,TAU);ctx.fill();ctx.stroke();
  rotor(ctx,pump,bottom,21,m.main*.05,C.metal,5);
  for(let i=0;i<3;i++){const a=i*TAU/3;ctx.fillStyle='#a7b8c0';ctx.beginPath();ctx.arc(pump+Math.cos(a)*24,bottom+Math.sin(a)*24,1.6,0,TAU);ctx.fill();}
  text(ctx,'WASSERPUMPE',pump,bottom+51,C.text,mobile?15:12,'center');
  text(ctx,`${n(total)} L/min`,pump,bottom+74,C.muted,mobile?16:13,'center');
  text(ctx,`Gemischter Zulauf ${n(b.mixed)} °C`,mobile?235:215,mobile?905:585,coolantColor(b.mixed),mobile?16:13,'center');
  ctx.fillStyle=C.dark;ctx.strokeStyle=coolantColor(hot);ctx.lineWidth=2;ctx.beginPath();ctx.arc(junction,top,16,0,TAU);ctx.fill();ctx.stroke();
  const opening=s?.thermostatOpen??0;
  path(ctx,[[junction-9,top+9-opening*18],[junction+9,top-9+opening*18]],coolantColor(hot),3);
  text(ctx,`THERMOSTAT ${Math.round(opening*100)} %`,mobile?393:junction,top-29,C.text,mobile?13:12,'center');
  text(ctx,'BYPASS',mobile?162:junction-20,mobile?585:285,C.text,mobile?14:12,'right');
  text(ctx,`${n(b.bypass)} L/min`,mobile?162:junction-20,mobile?609:309,C.muted,mobile?14:12,'right');
  text(ctx,`KÜHLER · ${n(b.radiator)} L/min`,mobile?325:770,mobile?478:148,C.text,mobile?15:13,'center');
  text(ctx,`Rücklauf ${n(cold)} °C`,mobile?350:770,mobile?750:398,coolantColor(cold),mobile?19:18,'center');
  text(ctx,`Lüfter ${Math.round((s?.fanDuty??0)*100)} %`,mobile?350:770,mobile?776:418,C.muted,mobile?14:11,'center');
  // Airflow remains separate from the liquid circuit and never crosses a hose.
  if(!mobile)for(let i=0;i<3;i++){
    const y=235+i*35;path(ctx,[[570,y],[632,y]],'#607f8e',1.5);path(ctx,[[625,y-4],[632,y],[625,y+4]],'#607f8e',1.5);
  }
  if(!mobile)text(ctx,'LUFT',600,348,C.muted,11,'center');
  text(ctx,`Umgebung ${cfg.cooling.ambientC} °C · Kühlwege schematisch`,W/2,20,C.muted,mobile?13:12,'center');
  if(!mobile){
    for(let i=0;i<100;i++){ctx.fillStyle=coolantColor(20+i);ctx.fillRect(650+i*2.2,485,2.5,5);}
    text(ctx,'20 °C',650,510,C.muted,11);text(ctx,'120 °C',870,510,C.muted,11,'right');
    text(ctx,'Kühlmitteltemperatur',760,535,C.muted,11,'center');
  }
  if(s?.thermalHalted)text(ctx,'MODELLGRENZE · WÄRMERECHNUNG ANGEHALTEN',W/2,H-12,'#eb998e',mobile?12:13,'center');
}

export function drawDrive(canvas:HTMLCanvasElement,s:ViewState|null,engineAngle:number,wheelAngle:number){
  const ctx=prepareCanvas(canvas,900,190),active=!!s?.gear&&!!s?.clutch;
  const wheelX=780,y=89,ratio=s?.totalRatio||0;
  path(ctx,[[70,y],[wheelX,y]],'#2e4551',9);
  if(active)flow(ctx,[[90,y],[wheelX-60,y]],C.air,engineAngle,16);
  rotor(ctx,120,y,45,engineAngle,C.fuel,7);
  rotor(ctx,325,y,35,engineAngle,s?.clutch?C.air:C.muted,5);
  path(ctx,[[363,52],[363,128]],s?.clutch?C.air:C.muted,8);
  box(ctx,463,38,130,100,C.line);rotor(ctx,500,y,25,engineAngle,C.metal,8);rotor(ctx,558,y,28,-wheelAngle*ratio,C.water,9);
  rotor(ctx,wheelX,y,52,wheelAngle,C.water,6);
  ctx.strokeStyle='#698698';ctx.lineWidth=7;ctx.beginPath();ctx.arc(wheelX,y,59,0,TAU);ctx.stroke();
  [['Schwungrad',120],['Kupplung',340],['Getriebe',530],['Antriebsrad',wheelX]].forEach(([name,x])=>text(ctx,String(name),Number(x),170,C.muted,13,'center'));
}
