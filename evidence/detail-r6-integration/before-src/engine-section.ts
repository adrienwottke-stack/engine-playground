import {prepareCanvas,type ViewState} from './drawing';
import {TAU,mod,type Config} from './model';
import {shaftGeometry,cycleSample,valveSample,type ValveCurves} from './native-view';
import {coolantColor} from './cooling-view';

// Composite longitudinal section: channels are projected into the section plane.
// Native dimensions and kinematics; illustrative castings and pipe routing.
const W=1280,H=760,AXES=[230,392,554,716,878,1040],SCALE=.96,CRANK_Y=548,DECK=329,ROOF=342;
const C={metal:'#c9d3d5',air:'#79d7e6',fuel:'#ecc575',exhaust:'#eda179',water:'#75b8e1',oil:'#d5b867',muted:'#90a6af'};
type P=[number,number];
type Layers={water:boolean;oil:boolean;labels:boolean};
function line(ctx:CanvasRenderingContext2D,points:number[][],color:string,width=2){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
}
function label(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,color:string=C.muted,size=11,align:CanvasTextAlign='left'){
  ctx.fillStyle=color;ctx.font=`${size}px "Cascadia Mono",Consolas,monospace`;ctx.textAlign=align;ctx.fillText(value,x,y);
}
function circle(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,fill:string,stroke?:string){
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,stroke?:string,r=4){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function metal(ctx:CanvasRenderingContext2D,y:number,h:number,colors=['#43525b','#c1ced1','#6e838d','#32424c']){
  const g=ctx.createLinearGradient(0,y,0,y+h);colors.forEach((c,i)=>g.addColorStop(i/(colors.length-1),c));return g;
}
function pipe(ctx:CanvasRenderingContext2D,p:Path2D,color:string,width:number){
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#081015';ctx.lineWidth=width+5;ctx.stroke(p);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(p);ctx.strokeStyle='#07161c';ctx.lineWidth=width-6;ctx.stroke(p);ctx.strokeStyle=color+'80';ctx.lineWidth=1;ctx.stroke(p);
}
function path(points:P[]){const p=new Path2D();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));return p;}
const intakePaths=AXES.map(x=>{const p=new Path2D();p.moveTo(x-28,117);p.bezierCurveTo(x-88,142,x-88,197,x-67,260);p.bezierCurveTo(x-65,298,x-49,318,x-23,ROOF+3);return p;});
const exhaustPaths=AXES.map((x,i)=>{const p=new Path2D();p.moveTo(x+23,ROOF+3);p.bezierCurveTo(x+83,318,x+70,268,x+70,225);p.bezierCurveTo(x+70,188,x+85,177,i<3?1105:1131,i<3?177:201);return p;});
const waterFeed=path([[1200,524],[1200,606],[117,606],[117,451],[177,451],[177,493]]),waterReturn=path([[1098,383],[1140,383],[1140,352],[1200,352],[1200,405]]),bypass=path([[1140,383],[1140,606]]);
const oilFeed=path([[175,622],[132,622],[132,510],[1090,510],[1090,290],[175,290]]);
const staticLayers=new WeakMap<HTMLCanvasElement,{key:string;image:HTMLCanvasElement}>();
const camPaths=new WeakMap<ValveCurves,Path2D[][]>();

/** Radial illustration of actual native lift curves, not a manufactured cam contour. */
function cams(curves:ValveCurves){
  let paths=camPaths.get(curves);if(paths)return paths;
  paths=curves.samples.map(rows=>[0,1].map(v=>{const p=new Path2D();rows.forEach((row,i)=>{const a=Math.PI/2-i/rows.length*TAU,r=12+Math.max(0,row[v]??0)*SCALE,x=Math.cos(a)*r,y=Math.sin(a)*r;i?p.lineTo(x,y):p.moveTo(x,y);});p.closePath();return p;}));
  camPaths.set(curves,paths);return paths;
}
function gear(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,a:number){
  ctx.save();ctx.translate(x,y);ctx.rotate(a);for(let i=0;i<24;i++){ctx.rotate(TAU/24);rect(ctx,r-2,-1.5,5,3,'#7d919b');}
  circle(ctx,0,0,r,'#22343e','#9eafb6');for(let i=0;i<6;i++){const b=i*TAU/6;circle(ctx,Math.cos(b)*r*.62,Math.sin(b)*r*.62,r*.16,'#09141b','#566f7b');}
  circle(ctx,0,0,5,'#a3b4bb');circle(ctx,0,0,2,'#172831');ctx.restore();
}
function bolts(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,spacing=34){for(let a=x+12;a<x+w-8;a+=spacing){circle(ctx,a,y,3,'#101d24','#758992');line(ctx,[[a-1,y-1],[a+1,y+1]],'#b2c1c6',.8);}}
function hatch(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();for(let a=x-h;a<x+w;a+=9)line(ctx,[[a,y+h],[a+h,y]],'#9aaab322',1);ctx.restore();}
function leader(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,target:P,color=C.muted,align:CanvasTextAlign='left'){
  label(ctx,value,x,y,color,11,align);line(ctx,[[x,y+6],[target[0],y+6],target],color+'80',.8);circle(ctx,...target,2,color);
}
function staticSection(ctx:CanvasRenderingContext2D,cfg:Config,l:Layers){
  ctx.fillStyle='#080f14';ctx.fillRect(0,0,W,H);
  for(let x=30;x<W;x+=24)for(let y=30;y<H;y+=24){ctx.fillStyle='#24343f60';ctx.fillRect(x,y,.8,.8);}
  label(ctx,'M52B28 / REIHENSECHSER',35,31,'#d4e0e3',15);label(ctx,'LÄNGSSCHNITT · KANÄLE IN SCHNITTEBENE PROJIZIERT',1245,31,C.muted,10,'right');
  // Sectioned block and ribbed crankcase.
  ctx.fillStyle=metal(ctx,321,280,['#5a6b74','#354853','#243640','#425560']);ctx.beginPath();ctx.moveTo(160,321);ctx.lineTo(1106,321);ctx.lineTo(1120,489);ctx.lineTo(1134,555);ctx.lineTo(1109,608);ctx.lineTo(162,608);ctx.lineTo(146,558);ctx.closePath();ctx.fill();ctx.strokeStyle='#7b929d';ctx.stroke();hatch(ctx,153,325,970,280);
  rect(ctx,158,487,956,111,'#101e27','#485d69',12);
  for(let i=0;i<7;i++){const x=149+i*162;rect(ctx,x,485,21,111,'#42545f','#6a7e88');hatch(ctx,x,485,21,111);rect(ctx,x-3,537,27,25,'#6c7f88','#9aaeb8');circle(ctx,x+10,549,5,'#172a34','#a1b4bc');}
  ctx.fillStyle=metal(ctx,603,54,['#879ba4','#415561','#1d303b']);ctx.beginPath();ctx.moveTo(152,604);ctx.lineTo(1118,604);ctx.lineTo(1092,648);ctx.quadraticCurveTo(1090,658,1074,658);ctx.lineTo(195,658);ctx.quadraticCurveTo(177,658,174,645);ctx.closePath();ctx.fill();ctx.strokeStyle='#728b99';ctx.stroke();
  rect(ctx,191,612,890,28,'#131f26','#435864');if(l.oil){rect(ctx,201,627,866,13,'#b99a4138');line(ctx,[[204,627],[1065,627]],C.oil,1);}bolts(ctx,158,606,957,48);rect(ctx,1030,651,14,10,'#6f838c','#bac9cf',1);
  for(const x of AXES){
    const half=cfg.engine.boreMm*SCALE/2;rect(ctx,x-half-13,DECK-2,half*2+26,157,'#1a2a34','#78919d');hatch(ctx,x-half-13,DECK,half*2+26,157);rect(ctx,x-half-2,ROOF,half*2+4,142,'#0b161d',undefined,0);
    line(ctx,[[x-half-3,ROOF],[x-half-3,480]],'#d1d8d7',3);line(ctx,[[x+half+3,ROOF],[x+half+3,480]],'#b1c2c8',3);
    if(l.water){rect(ctx,x-half-13,349,7,120,'#315b72');rect(ctx,x+half+6,349,7,120,'#315b72');line(ctx,[[x-half-9,352],[x-half-9,470],[x+half+9,470],[x+half+9,352]],C.water+'80',1);}
  }
  ctx.fillStyle=metal(ctx,209,130,['#536672','#23343d','#475b66']);ctx.fillRect(160,209,946,129);hatch(ctx,160,209,946,129);rect(ctx,165,216,936,100,'#12222b','#82949d');
  rect(ctx,153,326,962,12,'#8b979c','#d1d8d8',1);bolts(ctx,155,332,959);for(let i=0;i<7;i++)rect(ctx,160+i*156,211,10,112,'#60737d','#93a7af',1);
  exhaustPaths.forEach(p=>pipe(ctx,p,'#996c55',15));pipe(ctx,path([[1105,177],[1165,177],[1181,211],[1181,279]]),'#ae795c',25);pipe(ctx,path([[1131,201],[1147,201],[1158,227],[1158,279]]),'#ae795c',25);rect(ctx,1142,279,56,13,'#685c50','#be9a7b',2);bolts(ctx,1142,285,56,25);
  intakePaths.forEach(p=>pipe(ctx,p,'#58747e',23));
  // A common plenum and throttle connect to every port injector.
  rect(ctx,159,91,946,45,metal(ctx,91,45,['#516f79','#203d48','#112933','#476875']),'#82a2ac',19);rect(ctx,177,101,909,24,'#112b34','#4f7986',12);
  for(let x=196;x<1090;x+=32)line(ctx,[[x,93],[x,99]],'#a1b3b9',1);
  pipe(ctx,path([[72,112],[156,112]]),'#587782',29);rect(ctx,26,89,47,46,'#283d47','#8aa1ab',3);for(let x=33;x<69;x+=6)line(ctx,[[x,95],[x,129]],'#90a4aa',1);circle(ctx,126,112,17,'#1a333e','#90aab5');
  pipe(ctx,path([[144,155],[1095,155]]),'#ac945c',9);line(ctx,[[45,181],[111,181],[144,155]],'#947c4d',5);
  for(const x of AXES){line(ctx,[[x-57,155],[x-57,180]],C.fuel,2);ctx.save();ctx.translate(x-57,189);ctx.rotate(-.35);rect(ctx,-5,-12,10,24,'#82959b','#cad4d4',2);rect(ctx,-3,12,6,10,'#bfa56e');ctx.restore();}
  if(l.water){
    pipe(ctx,waterFeed,'#557c99',15);pipe(ctx,waterReturn,'#557c99',15);pipe(ctx,bypass,'#557c99',9);pipe(ctx,path([[177,493],[1098,493],[1098,383]]),'#315c78',8);
    for(const x of AXES)line(ctx,[[x-49,493],[x-49,338],[x+49,338],[x+49,493]],C.water+'60',2);
    rect(ctx,1169,403,63,127,'#294450','#85a7b6');rect(ctx,1176,414,49,105,'#0c202b');for(let y=418;y<519;y+=6)line(ctx,[[1178,y],[1223,y]],'#5d8294',1);for(let x=1183;x<1224;x+=8)line(ctx,[[x,415],[x,518]],'#7492a1',.7);
    rect(ctx,1165,396,71,17,'#4b6471','#9fb7bf');rect(ctx,1165,520,71,15,'#4b6471','#9fb7bf');circle(ctx,1140,383,13,'#2b4859','#9ac3d9');circle(ctx,117,451,24,'#355363','#9eb9c4');
  }
  if(l.oil){pipe(ctx,oilFeed,'#8f7e4a',6);for(let i=0;i<7;i++)line(ctx,[[172+i*151,510],[172+i*151,548]],'#bca35b90',2);circle(ctx,132,622,10,'#514932','#c8af68');}
  if(l.labels){
    leader(ctx,'ANSAUGSAMMLER + DROSSEL',35,62,[126,96],C.air);leader(ctx,'EINSPRITZLEISTE',425,62,[440,155],C.fuel);leader(ctx,'ABGASKRÜMMER · 2 × 3',1130,66,[1181,211],C.exhaust,'right');
    leader(ctx,'ÖLWANNE / ÖLSUMPF',203,682,[278,637],l.oil?C.oil:C.muted);if(l.water){leader(ctx,'WASSERPUMPE',30,377,[117,437],C.water);label(ctx,'KÜHLER',1200,560,C.water,10,'center');label(ctx,'BYPASS',1140,583,C.water,9,'center');}
  }
  line(ctx,[[155,694],[1114,694]],'#324754',1);
}
function particle(ctx:CanvasRenderingContext2D,points:P[],color:string,clock:number,rate:number,count=5){
  if(Math.abs(rate)<1e-4)return;const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),total=lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<count;i++){let d=mod(i/count*total+clock*32*Math.sign(rate),total),k=0;while(k<lengths.length-1&&d>lengths[k])d-=lengths[k++];const a=points[k],b=points[k+1],f=d/lengths[k],x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f,rot=Math.atan2(b[1]-a[1],b[0]-a[0])+(rate<0?Math.PI:0);ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(-2,-2);ctx.lineTo(-2,2);ctx.fill();ctx.restore();}
}
function crank(ctx:CanvasRenderingContext2D,s:ViewState|null,cfg:Config,angle:number){
  line(ctx,[[128,CRANK_Y],[1129,CRANK_Y]],'#526c7b',15);line(ctx,[[128,CRANK_Y-3],[1129,CRANK_Y-3]],'#adc0c8',2);
  for(let i=0;i<6;i++){
    const x=AXES[i],g=shaftGeometry(angle,i+1,cfg,s),a=Math.atan2(g.crankY,g.crankX);ctx.save();ctx.translate(x,CRANK_Y);ctx.rotate(a);ctx.fillStyle=metal(ctx,-30,60,['#bcc7c7','#728792','#334b58']);
    ctx.beginPath();ctx.moveTo(14,-14);ctx.lineTo(-25,-39);ctx.arc(0,0,47,Math.atan2(-39,-25),Math.atan2(39,-25),true);ctx.lineTo(14,14);ctx.closePath();ctx.fill();ctx.strokeStyle='#99adb6';ctx.stroke();
    rect(ctx,-12,-11,Math.hypot(g.crankX,g.crankY)*SCALE+24,22,'#687e8b','#a9bdc5',10);circle(ctx,0,0,11,'#607986','#b1c4cc');circle(ctx,0,0,4,'#13232c');ctx.restore();
  }
  rect(ctx,1121,493,17,109,metal(ctx,493,109));for(let y=496;y<601;y+=6)rect(ctx,1118,y,23,3,'#94a7af',undefined,0);
}
function drawCylinder(ctx:CanvasRenderingContext2D,s:ViewState|null,cfg:Config,angle:number,index:number,selected:number,clock:number,l:Layers){
  const x=AXES[index],g=shaftGeometry(angle,index+1,cfg,s),sample=cycleSample(s,angle,index+1,true),valves=valveSample(s,angle,index+1),half=cfg.engine.boreMm*SCALE/2,wristY=CRANK_Y+g.pistonY*SCALE,pistonTop=wristY-19,pinX=x+g.crankX*SCALE,pinY=CRANK_Y+g.crankY*SCALE;
  const lifts=[valves?.intakeLiftMm??sample?.intakeLiftMm??0,valves?.exhaustLiftMm??sample?.exhaustLiftMm??0],burning=!!sample?.burning&&!!s?.ignition&&(s.rpm??0)>1;
  if(sample){const gas=ctx.createLinearGradient(0,ROOF,0,Math.max(ROOF+1,pistonTop));gas.addColorStop(0,burning?'#f2ac51c0':lifts[0]>.3?'#69c2d25c':lifts[1]>.3?'#c57a474c':'#708da33a');gas.addColorStop(1,'#10222b20');ctx.fillStyle=gas;ctx.fillRect(x-half+2,ROOF,half*2-4,Math.max(0,pistonTop-ROOF));if(burning){const r=Math.max(2,Math.min(15,(pistonTop-ROOF)*.35));circle(ctx,x,ROOF+r+2,r,'#ffdc9dbb');}}
  line(ctx,[[x,wristY],[pinX,pinY]],'#223843',17);line(ctx,[[x,wristY],[pinX,pinY]],'#a8bbc4',10);line(ctx,[[x-1,wristY+8],[pinX-1,pinY-6]],'#4a646f',3);circle(ctx,pinX,pinY,13,'#9eb1ba','#d4dedf');circle(ctx,pinX,pinY,7,'#243c49','#a4bac5');for(const dx of [-9,9])circle(ctx,pinX+dx,pinY+8,2,'#293f4c');
  rect(ctx,x-half+2,pistonTop,half*2-4,38,metal(ctx,pistonTop,38,['#d1dcdd','#98afb8','#4b6675']),'#adbec6',3);for(let ring=0;ring<3;ring++)line(ctx,[[x-half+3,pistonTop+5+ring*5],[x+half-3,pistonTop+5+ring*5]],'#1d303b',2);circle(ctx,x,wristY,6,'#273f4d','#c3d4da');circle(ctx,x,wristY,2,'#09171f');
  for(let v=0;v<2;v++){
    const dx=v===0?-23:23,camY=v===0?238:271,lift=lifts[v]*SCALE,color=v===0?C.air:C.exhaust;ctx.save();ctx.translate(x+dx,camY);ctx.rotate(angle/2);const p=s?.valveCurves?cams(s.valveCurves)[index]?.[v]:null;
    if(p){ctx.fillStyle='#a9bac1';ctx.fill(p);ctx.strokeStyle='#d4dddf';ctx.lineWidth=1;ctx.stroke(p);}else circle(ctx,0,0,12,'#627b89','#b2c6cd');circle(ctx,0,0,4,'#243c4a','#ced9dc');ctx.restore();
    const follower=camY+12+lift;rect(ctx,x+dx-7,follower,14,7,'#6f8792','#c8d7dc',1);line(ctx,[[x+dx,follower+7],[x+dx,ROOF+4+lift]],'#c0ced2',2.4);const bottom=ROOF-9,springTop=follower+13;line(ctx,Array.from({length:12},(_,i)=>[x+dx+(i%2?5:-5),springTop+i/11*Math.max(3,bottom-springTop)]),'#91a4af',1.2);line(ctx,[[x+dx-9,ROOF+4+lift],[x+dx+9,ROOF+4+lift]],color,4);
  }
  rect(ctx,x-4,308,8,17,'#dbdcd4','#859aa3',1);line(ctx,[[x,324],[x,ROOF+1]],'#d2b77b',3);if(burning)line(ctx,[[x,ROOF],[x-3,ROOF+5],[x+2,ROOF+10]],'#fff0bd',2);
  particle(ctx,[[x-70,259],[x-59,307],[x-23,ROOF+3]],C.air,clock,sample?.intakeMolS??0,3);particle(ctx,[[x+23,ROOF+3],[x+62,310],[x+70,238]],C.exhaust,clock,sample?.exhaustMolS??0,3);
  if((sample?.intakeMolS??0)>1e-4&&s?.ignition)for(let j=0;j<5;j++){const t=mod(clock*1.5+j/5,1);circle(ctx,x-53+t*17,210+t*42,1,C.fuel);}
  if(l.water)particle(ctx,[[x-49,493],[x-49,338],[x+49,338],[x+49,493]],coolantColor(s?.coolantC??cfg.cooling.ambientC),clock*(cfg.cooling.flowLMin/30),s&&!s.thermalHalted?cfg.cooling.flowLMin:0,4);
  label(ctx,String(index+1).padStart(2,'0'),x,77,index+1===selected?C.air:'#b0c1c8',13,'center');const color=burning?C.fuel:lifts[0]>.3?C.air:lifts[1]>.3?C.exhaust:C.metal;
  label(ctx,sample?burning?'VERBRENNUNG':lifts[0]>.3?'EINLASS':lifts[1]>.3?'AUSLASS':'GESCHLOSSEN':'ZYKLUS ERFASSEN',x,714,color,10,'center');label(ctx,sample?`${(sample.pressureKpa/100).toFixed(1)} bar abs.`:'—',x,733,C.metal,11,'center');
}
export function installEngineSectionControls(){
  const canvas=document.getElementById('engine-canvas') as HTMLCanvasElement,toolbar=document.createElement('div');toolbar.className='section-layers';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Bauteile im Motorschnitt');
  toolbar.innerHTML='<span>MOTORSCHNITT</span><label><input type="checkbox" data-section-layer="water" checked>Kühlwege</label><label><input type="checkbox" data-section-layer="oil" checked>Ölwege</label><label><input type="checkbox" data-section-layer="labels" checked>Beschriftung</label>';
  const viewport=document.createElement('div');viewport.className='engine-section-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Motorschnitt · auf kleinen Bildschirmen seitlich verschiebbar');canvas.before(toolbar,viewport);viewport.append(canvas);
  const hint=document.createElement('p');hint.className='section-scroll-hint';hint.textContent='← Motorschnitt seitlich verschieben →';viewport.before(hint);
  for(const input of Array.from(toolbar.querySelectorAll<HTMLInputElement>('input'))){const update=()=>{canvas.dataset[input.dataset.sectionLayer!]=String(input.checked);};input.addEventListener('change',update);update();}
  canvas.setAttribute('aria-label','Sechs Zylinder nebeneinander im Motorlängsschnitt mit Ansaugsammler, Einspritzleiste, Abgaskrümmer, zwei Nockenwellen, Steuerkette, Kurbelwelle, Kühlwasserleitungen und Ölwanne');
}
export function drawEngineSection(canvas:HTMLCanvasElement,s:ViewState|null,cfg:Config,angle:number,cylinder:number,slow:boolean,_detail:boolean,clock=0){
  const ctx=prepareCanvas(canvas,W,H),fit=Math.min(canvas.width/W,canvas.height/H);ctx.setTransform(fit,0,0,fit,(canvas.width-W*fit)/2,(canvas.height-H*fit)/2);
  const l={water:canvas.dataset.water!=='false',oil:canvas.dataset.oil!=='false',labels:canvas.dataset.labels!=='false'},key=[canvas.width,canvas.height,cfg.engine.boreMm,l.water,l.oil,l.labels].join(':');let cache=staticLayers.get(canvas);
  if(!cache||cache.key!==key){const image=document.createElement('canvas');image.width=Math.ceil(W*fit);image.height=Math.ceil(H*fit);const base=image.getContext('2d')!;base.scale(fit,fit);staticSection(base,cfg,l);cache={key,image};staticLayers.set(canvas,cache);}ctx.drawImage(cache.image,0,0,W,H);
  canvas.dataset.cylinderLayout='inline-six';canvas.dataset.crankAngle=String(mod(angle,TAU*2));canvas.dataset.camAngle=String(mod(angle/2,TAU));canvas.dataset.valveTiming=s?.valveCurves?'native-angle':'awaiting-native';canvas.dataset.labelDensity='full';canvas.dataset.sectionVersion='assembled-v1';
  for(const [y,color]of[[238,C.air],[271,C.exhaust]] as const){line(ctx,[[141,y],[1104,y]],'#435d6c',8);line(ctx,[[141,y-2],[1104,y-2]],'#c6d6dc',1.5);for(let i=0;i<7;i++)rect(ctx,160+i*156,y-8,10,16,'#849ba5','#b3c6ce',1);circle(ctx,139,y,6,'#8ea3ac',color);}
  const chain=new Path2D();chain.moveTo(54,238);chain.arc(82,238,28,Math.PI,Math.PI*1.5);chain.lineTo(148,210);chain.arc(148,238,28,-Math.PI/2,0);chain.lineTo(130,548);chain.arc(116,548,14,0,Math.PI);chain.closePath();
  ctx.strokeStyle='#48545b';ctx.lineWidth=7;ctx.stroke(chain);ctx.save();ctx.setLineDash([3,5]);ctx.lineDashOffset=-angle*14;ctx.strokeStyle='#b7c2c5';ctx.lineWidth=3;ctx.stroke(chain);ctx.restore();gear(ctx,82,238,28,angle/2);gear(ctx,148,238,28,angle/2);gear(ctx,116,548,14,angle);
  crank(ctx,s,cfg,angle);AXES.forEach((_,i)=>drawCylinder(ctx,s,cfg,angle,i,cylinder,clock,l));
  const throttle=s?.actualThrottle??s?.pedal??0;ctx.save();ctx.translate(126,112);ctx.rotate(-1.3+Math.max(0,Math.min(1,throttle))*1.3);line(ctx,[[-12,0],[12,0]],'#b6c9cb',3);ctx.restore();
  if(l.water){const total=s&&!s.thermalHalted?cfg.cooling.flowLMin:0,rad=s?.radiatorFlowLMin??0;particle(ctx,[[1200,524],[1200,606],[117,606],[117,451],[177,451],[177,493],[1098,493],[1098,383]],coolantColor(s?.radiatorC??cfg.cooling.ambientC),clock*total/30,total,28);particle(ctx,[[1098,383],[1140,383]],coolantColor(s?.coolantC??cfg.cooling.ambientC),clock*total/30,total,3);particle(ctx,[[1140,383],[1140,352],[1200,352],[1200,405]],coolantColor(s?.coolantC??cfg.cooling.ambientC),clock*rad/30,rad,5);particle(ctx,[[1140,383],[1140,606]],C.water,clock*(total-rad)/30,total-rad,6);gear(ctx,117,451,17,clock*total*.04);}
  if(l.labels){leader(ctx,'NOCKENWELLEN',27,322,[187,238],C.metal);leader(ctx,'STEUERKETTE',29,598,[99,507]);label(ctx,'KURBELWELLE · KURBELWANGEN + GEGENGEWICHTE',635,682,C.metal,10,'center');if(l.oil)leader(ctx,'ÖLGALERIE',1208,659,[1090,510],C.oil,'right');}
  label(ctx,slow?'ZEITLUPE · TON ECHTZEIT':'ECHTZEIT',35,752,C.muted,9);label(ctx,'Ventilhub + Kolben: nativer Kern · Flusswege und Gehäuse: schematisch',1245,752,C.muted,9,'right');
}
