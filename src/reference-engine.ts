import {prepareCanvas,type ViewState} from './drawing';
import {TAU,mod,type Config} from './model';
import {shaftGeometry,cycleSample,valveSample} from './native-view';

const C={metal:'#bec8cc',edge:'#53626b',air:'#79d7e6',fuel:'#f0c471',exhaust:'#f5a170',water:'#5986b3',block:'#9c809b',muted:'#8a9ba6'};
const W=1080,H=500,AXES=[140,300,460,620,780,940],SCALE=.96,CRANK_Y=365,DECK=155;

function line(ctx:CanvasRenderingContext2D,points:number[][],color:string,width=2){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
}
function label(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,color:string=C.muted,size=11,align:CanvasTextAlign='left'){
  ctx.fillStyle=color;ctx.font=`${size}px "Cascadia Mono",Consolas,monospace`;ctx.textAlign=align;ctx.fillText(value,x,y);
}
function circle(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,fill:string,stroke?:string){
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
}
function flow(ctx:CanvasRenderingContext2D,points:number[][],color:string,clock:number,rate:number){
  line(ctx,points,'#111e25',10);line(ctx,points,color,1.1);
  if(Math.abs(rate)<1e-4)return;
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),total=lengths.reduce((a,b)=>a+b,0);
  if(!total)return;
  for(let i=0;i<4;i++){
    let d=mod(i/4*total+clock*34*Math.sign(rate),total),k=0;
    while(k<lengths.length-1&&d>lengths[k])d-=lengths[k++];
    const a=points[k],b=points[k+1],f=d/lengths[k];ctx.fillStyle=color;ctx.fillRect(a[0]+(b[0]-a[0])*f-1.5,a[1]+(b[1]-a[1])*f-1.5,3,3);
  }
}
function gear(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,angle:number,color:string){
  circle(ctx,x,y,r,'#0c151c',color);circle(ctx,x,y,4,'#a7b6be');
  for(let i=0;i<6;i++){const a=angle+i*TAU/6;line(ctx,[[x+Math.cos(a)*7,y+Math.sin(a)*7],[x+Math.cos(a)*(r-3),y+Math.sin(a)*(r-3)]],color,2);}
}

function drawCylinder(ctx:CanvasRenderingContext2D,s:ViewState|null,cfg:Config,angle:number,cylinder:number,selected:number,compact:boolean,labelScale:number){
  const x=AXES[cylinder-1],g=shaftGeometry(angle,cylinder,cfg,s);
  // Colour and pressure come from this cylinder's captured cycle. Never replay cylinder 1 in all six bores.
  const sample=cycleSample(s,angle,cylinder,true),valves=valveSample(s,angle,cylinder);
  const halfBore=cfg.engine.boreMm*SCALE/2,wristY=CRANK_Y+g.pistonY*SCALE,pistonTop=wristY-19;
  const pinX=x+g.crankX*SCALE,pinY=CRANK_Y+g.crankY*SCALE,roof=DECK+13;
  const inLift=valves?.intakeLiftMm??sample?.intakeLiftMm??0,exLift=valves?.exhaustLiftMm??sample?.exhaustLiftMm??0;
  const burning=!!sample?.burning&&!!s?.ignition&&(s.rpm??0)>1;
  const activeColor=burning?C.fuel:inLift>.3?C.air:exLift>.3?C.exhaust:C.metal;
  ctx.fillStyle='#0a1319';ctx.fillRect(x-halfBore-1,roof,halfBore*2+2,133);
  const chamberH=Math.max(1,pistonTop-roof);
  if(sample){
    const gas=ctx.createLinearGradient(0,roof,0,Math.max(roof+1,pistonTop));
    gas.addColorStop(0,burning?'#eaa34aa8':inLift>.3?'#3c91a74d':exLift>.3?'#a65a384f':'#59677845');
    gas.addColorStop(1,burning?'#d56c233b':'#18283220');ctx.fillStyle=gas;ctx.fillRect(x-halfBore+2,roof,halfBore*2-4,chamberH);
    if(burning){
      const flameR=Math.min(18,chamberH*.38);circle(ctx,x,roof+Math.min(chamberH*.4,19),Math.max(2,flameR),'#ffdaa4b8');
      line(ctx,[[x,roof+1],[x-3,roof+7],[x+2,roof+12]],'#fff2cf',2);
    }
  }
  ctx.fillStyle='#29476667';ctx.fillRect(x-halfBore-12,DECK+3,6,147);ctx.fillRect(x+halfBore+6,DECK+3,6,147);
  line(ctx,[[x-halfBore-3,roof],[x-halfBore-3,DECK+146]],C.block,4);
  line(ctx,[[x+halfBore+3,roof],[x+halfBore+3,DECK+146]],C.block,4);
  const clock=angle/TAU*4;
  flow(ctx,[[x-57,61],[x-57,132],[x-21,roof+4]],C.air,clock,sample?.intakeMolS??0);
  flow(ctx,[[x+21,roof+4],[x+57,132],[x+57,77]],C.exhaust,clock,sample?.exhaustMolS??0);
  // Poppets move directly by native cam lift at this displayed crank angle.
  for(const [offset,lift,color]of[[-21,inLift,C.air],[21,exLift,C.exhaust]]as const){
    const y=roof+3+lift*SCALE;
    line(ctx,[[x+offset,118+lift*SCALE],[x+offset,y]],'#b1bdc3',3);
    line(ctx,[[x+offset-10,y],[x+offset+10,y]],color,5);
    const springTop=121+lift*SCALE,springHeight=Math.max(6,148-springTop);
    line(ctx,Array.from({length:8},(_,i)=>[x+offset+(i%2?6:-6),springTop+i/7*springHeight]),'#7c8d95',1);
    circle(ctx,x+offset,117+lift*SCALE,4,color);
  }
  line(ctx,[[x,145],[x,roof+1]],C.fuel,3);ctx.fillStyle='#e1e1d9';ctx.fillRect(x-4,143,8,10);
  // Crank webs and rods stay joined to the common shaft at every angle.
  circle(ctx,x,CRANK_Y,cfg.engine.strokeMm*SCALE/2+7,'#111b22','#2c3e49');
  line(ctx,[[x,CRANK_Y],[pinX,pinY]],'#647784',18);
  line(ctx,[[x,wristY],[pinX,pinY]],'#344b59',12);
  line(ctx,[[x,wristY],[pinX,pinY]],'#bbc7cb',7);
  const metal=ctx.createLinearGradient(x-halfBore,0,x+halfBore,0);
  metal.addColorStop(0,'#5d707b');metal.addColorStop(.43,'#d6dfe0');metal.addColorStop(1,'#6d7f89');
  ctx.fillStyle=metal;ctx.fillRect(x-halfBore+2,pistonTop,halfBore*2-4,38);
  for(let ring=0;ring<3;ring++)line(ctx,[[x-halfBore+3,pistonTop+5+ring*5],[x+halfBore-3,pistonTop+5+ring*5]],'#293d47',1.8);
  circle(ctx,x,wristY,5,'#20333e','#a6bac3');circle(ctx,pinX,pinY,9,'#8c9fa8');circle(ctx,pinX,pinY,3,'#1c2f3a');circle(ctx,x,CRANK_Y,6,'#182b35','#a5bac5');
  label(ctx,String(cylinder).padStart(2,'0'),x,37,cylinder===selected?C.air:C.metal,compact?10.5*labelScale:16,'center');
  const phase=compact
    ?sample?burning?'ARBEIT':inLift>.3?'EIN':exLift>.3?'AUS':'ZU':'…'
    :sample?burning?'VERBRENNUNG':inLift>.3?'EINLASS OFFEN':exLift>.3?'AUSLASS OFFEN':'VENTILE ZU':'ZYKLUS ERFASSEN';
  label(ctx,phase,x,compact?440:424,activeColor,compact?9*labelScale:9,'center');
  if(!compact)label(ctx,sample?`${(sample.pressureKpa/100).toFixed(1)} bar abs.`:'—',x,445,sample?C.metal:C.muted,12,'center');
  const barW=25,maxLift=12;
  ctx.fillStyle='#1c303a';ctx.fillRect(x-34,457,barW,3);ctx.fillRect(x+9,457,barW,3);
  ctx.fillStyle=C.air;ctx.fillRect(x-34,457,Math.min(barW,inLift/maxLift*barW),3);
  ctx.fillStyle=C.exhaust;ctx.fillRect(x+9,457,Math.min(barW,exLift/maxLift*barW),3);
  return sample;
}

/** A whole inline-six, with one global clock for pistons, valve lift and cam drive. */
export function drawReferenceEngine(canvas:HTMLCanvasElement,s:ViewState|null,cfg:Config,angle:number,cylinder:number,slow:boolean,_detail:boolean){
  const ctx=prepareCanvas(canvas,W,H),fit=Math.min(canvas.width/W,canvas.height/H);
  // prepareCanvas already resolved the CSS size. Reuse its backing dimensions instead of reading layout every frame.
  const dpr=Math.min(window.devicePixelRatio||1,2),compact=canvas.width/dpr<600,labelScale=dpr/fit;
  ctx.setTransform(fit,0,0,fit,(canvas.width-W*fit)/2,(canvas.height-H*fit)/2);
  ctx.fillStyle='#05090d';ctx.fillRect(0,0,W,H);
  canvas.dataset.cylinderLayout='inline-six';canvas.dataset.crankAngle=String(mod(angle,TAU*2));
  canvas.dataset.valveTiming=s?.valveCurves?'native-angle':'awaiting-native';
  canvas.dataset.labelDensity=compact?'compact':'full';
  if(!compact)label(ctx,'ZYL.',35,37,C.muted,10);
  line(ctx,[[63,61],[1014,61]],'#1b3b48',12);line(ctx,[[63,61],[1014,61]],C.air,1.5);
  line(ctx,[[63,77],[1014,77]],'#3b2c25',10);line(ctx,[[63,77],[1014,77]],C.exhaust,1.5);
  ctx.fillStyle='#15212a';ctx.strokeStyle='#475965';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(58,142,968,169,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#322b37';ctx.fillRect(58,144,968,12);
  for(let x=72;x<1020;x+=32){circle(ctx,x,149,2,'#ac9aa8');}
  line(ctx,[[64,95],[1015,95]],'#8999a3',5);line(ctx,[[64,116],[1015,116]],'#748995',4);
  for(const x of AXES){ctx.fillStyle='#354955';ctx.fillRect(x-28,88,14,13);ctx.fillRect(x+14,109,14,13);}
  gear(ctx,38,95,14,-angle/2,C.air);gear(ctx,38,116,11,-angle/2,C.exhaust);
  line(ctx,[[23,95],[23,CRANK_Y],[52,CRANK_Y],[52,95]],'#2c424f',2);
  gear(ctx,38,CRANK_Y,14,-angle,C.metal);
  line(ctx,[[57,CRANK_Y],[1023,CRANK_Y]],'#536b78',10);line(ctx,[[57,CRANK_Y],[1023,CRANK_Y]],'#a4b5bd',2);
  for(let i=1;i<=6;i++)drawCylinder(ctx,s,cfg,angle,i,cylinder,compact,labelScale);
  // Cooling is the existing thermal model, distinct from native gas flow.
  flow(ctx,[[76,317],[1008,317]],C.water,angle/TAU*cfg.cooling.flowLMin*.08,s?cfg.cooling.flowLMin:0);
  line(ctx,[[59,405],[1025,405]],'#263b46',1);
  if(compact){
    label(ctx,slow?'ZEITLUPE':'ECHTZEIT',27,491,C.metal,9*labelScale);
    label(ctx,'1 · 5 · 3 · 6 · 2 · 4',1053,491,C.muted,9*labelScale,'right');
  }else{
    label(ctx,'GEMEINSAME KURBELWELLE',540,393,C.muted,9,'center');
    label(ctx,'Druck und Füllung: letzter erfasster Zyklus',540,473,C.muted,9,'center');
    label(ctx,'1 – 5 – 3 – 6 – 2 – 4',540,491,C.muted,10,'center');
    label(ctx,slow?'ZEITLUPE · TON IN ECHTZEIT':'ECHTZEIT',27,485,C.metal,10);
    label(ctx,s?.valveCurves?'VENTILE · ORIGINALNOCKEN':'VENTILDATEN WERDEN GELADEN',1053,485,C.muted,10,'right');
  }
}
