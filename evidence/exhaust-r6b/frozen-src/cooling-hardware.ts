import {coolantColor} from './cooling-view';
import {coolingCylinderPose,fluidMarkers,type FluidPoint} from './cooling-motion';
import type {Config} from './model';
import type {ViewState} from './drawing';

// Vector cutaways driven by shared crank geometry and calculated coolant branch flows.
type Context=CanvasRenderingContext2D;
function line(c:Context,pts:number[][],stroke:string|CanvasGradient,width=1){
 c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();
}
function shape(c:Context,pts:number[][],fill:string|CanvasGradient,stroke='#718994'){
 c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1;c.stroke();
}
function rect(c:Context,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,stroke='#718994',r=3){
 c.fillStyle=fill;c.strokeStyle=stroke;c.lineWidth=1;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();c.stroke();
}
function bolt(c:Context,x:number,y:number){
 c.fillStyle='#b0bdc1';c.beginPath();c.arc(x,y,2.3,0,Math.PI*2);c.fill();line(c,[[x-1,y],[x+1,y]],'#3a4b53');
}
function label(c:Context,value:string,x:number,y:number,size=10,color='#a9bbc2'){
 c.font=`${size}px "Segoe UI",sans-serif`;c.textAlign='center';c.fillStyle=color;c.fillText(value,x,y);
}
type EngineMotion={angle:number;config:Config;state:ViewState|null;phase:number;flow:number;inletC:number};
function liquid(c:Context,points:FluidPoint[],phase:number,flow:number,inlet:number,outlet:number,width=4){
 const first=points[0],last=points.at(-1)!;
 const g=c.createLinearGradient(first[0],first[1],last[0],last[1]);g.addColorStop(0,coolantColor(inlet));g.addColorStop(1,coolantColor(outlet));
 line(c,points,'#081924',width+3);line(c,points,g,width);
 // A stationary outline remains when there is no circulation; moving markers disappear.
 if(flow<=0)return;
 for(const p of fluidMarkers(points,phase)){
  c.save();c.translate(p.x,p.y);c.rotate(p.angle);
  c.fillStyle='#e5f7ff';c.globalAlpha=.95;c.beginPath();c.moveTo(3,0);c.lineTo(-3,-1.8);c.lineTo(-1.5,0);c.lineTo(-3,1.8);c.closePath();c.fill();
  c.strokeStyle='#e5f7ff';c.lineWidth=1.5;c.globalAlpha=.45;c.beginPath();c.moveTo(-7,0);c.lineTo(-3,0);c.stroke();c.restore();
 }
}
export function coolingEngine(c:Context,x:number,y:number,w:number,h:number,temperature:number,motion:EngineMotion){
 c.save();c.translate(x,y);c.scale(w/330,h/200);
 const metal=c.createLinearGradient(0,0,0,200);metal.addColorStop(0,'#82949c');metal.addColorStop(.24,'#3d5663');metal.addColorStop(.75,'#213440');metal.addColorStop(1,'#546772');
 // Cast block, cylinder-head depth and stamped oil sump establish the silhouette.
 shape(c,[[16,44],[294,44],[310,63],[310,154],[292,173],[31,173],[17,151]],metal);
 shape(c,[[16,44],[31,30],[309,30],[294,44]],'#91a1a7');
 shape(c,[[294,44],[309,30],[324,49],[324,142],[310,154],[310,63]],'#263d49');
 shape(c,[[31,173],[292,173],[278,193],[52,193],[40,185]],'#3e525d');
 line(c,[[48,178],[284,178]],'#82939b',2);
 // Long cam cover with six coil bosses, head gasket and fasteners.
 rect(c,10,10,292,28,'#233845','#a1afb5',6);
 shape(c,[[10,10],[24,0],[313,0],[302,10]],'#62747e');
 shape(c,[[302,10],[313,0],[320,26],[302,38]],'#1d303c');
 line(c,[[30,17],[276,17]],'#7e929e',2);line(c,[[31,30],[278,30]],'#7e929e');
 for(let i=0;i<6;i++){rect(c,40+i*39,18,16,10,'#15262f','#6f8794',2);bolt(c,27+i*49,46);}
 line(c,[[18,54],[297,54]],'#b3a294',2);
 // Open section of the water jacket. Coolant sits outside the cylinder liners.
 rect(c,27,62,268,79,'#0d1b23','#576f7b');
 const water=c.createLinearGradient(0,140,0,56);water.addColorStop(0,coolantColor(motion.inletC));water.addColorStop(1,coolantColor(temperature));
 c.fillStyle=water;c.globalAlpha=.28;c.fillRect(27,58,268,84);c.globalAlpha=1;
 // Side inlet feeds the lower distributor; coolant rises outside each liner.
 liquid(c,[[0,129],[23,129],[23,139],[287,139]],motion.phase,motion.flow,motion.inletC,motion.inletC,4);
 for(let i=0;i<7;i++){const a=31+i*42;liquid(c,[[a,139],[a,59]],motion.phase+i*3,motion.flow/7,motion.inletC,temperature,4);}
 liquid(c,[[287,59],[119.5,59],[119.5,-7]],motion.phase,motion.flow,temperature,temperature,4);
 liquid(c,[[31,59],[119.5,59]],motion.phase,motion.flow,temperature,temperature,4);
 // Crank main axis sits behind the moving journals and connecting rods.
 line(c,[[32,157],[290,157]],'#a7b6bd',5);
 for(let i=0;i<6;i++){
  const a=38+i*42,pose=coolingCylinderPose(motion.angle,i+1,motion.config,motion.state),py=pose.pistonTop;
  rect(c,a,66,29,69,'#15232d','#9cabb2',1);
  const piston=c.createLinearGradient(a,0,a+26,0);piston.addColorStop(0,'#778d98');piston.addColorStop(.5,'#c2cccf');piston.addColorStop(1,'#536d7b');
  rect(c,a+3,py,23,19,piston,'#aebfc6',1);
  line(c,[[a+4,py+4],[a+25,py+4]],'#425968');line(c,[[a+4,py+8],[a+25,py+8]],'#425968');
  line(c,[[pose.axis,pose.wristY],[pose.pinX,pose.pinY]],'#334f5d',7);
  line(c,[[pose.axis,pose.wristY],[pose.pinX,pose.pinY]],'#b0c0c9',3);
  line(c,[[pose.axis,157],[pose.pinX,pose.pinY]],'#5a7687',8);bolt(c,pose.pinX,pose.pinY);
  label(c,String(i+1),a+14,79,8,'#a1b3bc');
 }
 // Main bearing line, webs and timing-end pulley.
 for(let i=0;i<6;i++)bolt(c,52+i*42,157);
 for(const a of [26,98,174,290]){bolt(c,a,146);bolt(c,a,169);}
 rect(c,300,66,25,95,'#344c5a','#879ba6',6);
 c.fillStyle='#0b1820';c.strokeStyle='#90a3ad';c.lineWidth=3;c.beginPath();c.arc(312,147,22,0,Math.PI*2);c.fill();c.stroke();
 c.strokeStyle='#526d7d';c.lineWidth=2;c.beginPath();c.arc(312,147,16,0,Math.PI*2);c.stroke();
 for(let i=0;i<3;i++){const a=motion.angle+i*Math.PI*2/3;line(c,[[312+Math.cos(a)*6,147+Math.sin(a)*6],[312+Math.cos(a)*17,147+Math.sin(a)*17]],'#afc2cd',2);}
 bolt(c,312,147);
 // Hose necks are actual endpoints of the external flow diagram.
 rect(c,107,-7,25,17,'#6d818d','#b0bec5');line(c,[[108,-2],[131,-2]],'#d1d9dc',2);
 rect(c,-4,119,24,20,'#657e8d','#a8bac3');
 liquid(c,[[-4,129],[23,129]],motion.phase,motion.flow,motion.inletC,motion.inletC,5);
 c.restore();
}
export function coolingRadiator(c:Context,x:number,y:number,w:number,h:number,hot:number,cold:number,angle:number,phase:number,flow:number){
 c.save();c.translate(x,y);c.scale(w/210,h/200);
 // Rear thickness, mounting ears, crimped tanks and fine aluminium fins.
 shape(c,[[8,16],[20,5],[208,5],[208,187],[196,198],[196,16]],'#283f4b','#738d9c');
 for(const a of [25,167]){rect(c,0,a,16,18,'#415c6b');bolt(c,7,a+9);rect(c,194,a,16,18,'#415c6b');bolt(c,201,a+9);}
 rect(c,13,23,184,155,'#14232b','#91a7b3');
 const g=c.createLinearGradient(0,25,0,177);g.addColorStop(0,coolantColor(hot));g.addColorStop(1,coolantColor(cold));
 c.globalAlpha=.6;
 for(let j=0;j<35;j++)line(c,[[18,27+j*4.2],[191,27+j*4.2]],'#6c8490',.7);
 for(let i=0;i<20;i++)line(c,[[20+i*8.8,26],[20+i*8.8,176]],g,1.6);
 c.globalAlpha=1;
 // Top header distributes the radiator branch into parallel coolant tubes.
 for(let i=0;i<10;i++){const a=20+i*18.4;liquid(c,[[a,27],[a,177]],phase+i*2,flow/10,hot,cold,3);}
 rect(c,8,10,190,18,'#394f5a','#9badb6',5);rect(c,8,177,190,18,'#334b59','#9badb6',5);
 liquid(c,[[140,-5],[140,25],[21,25]],phase,flow,hot,hot,4);liquid(c,[[140,25],[187,25]],phase,flow,hot,hot,4);
 liquid(c,[[21,179],[146,179],[146,205]],phase,flow,cold,cold,4);liquid(c,[[187,179],[146,179]],phase,flow,cold,cold,4);
 for(let i=0;i<12;i++){line(c,[[17+i*15,12],[17+i*15,17]],'#a4b5bc');line(c,[[17+i*15,190],[17+i*15,194]],'#a4b5bc');}
 rect(c,129,-5,23,17,'#80949f','#c1cdd2');rect(c,125,-10,31,8,'#8a9da5','#c1cdd2');
 // Circular shroud is mounted on the radiator face. Curved fan blades rotate inside it.
 c.fillStyle='#10212b35';c.strokeStyle='#7f99a8';c.lineWidth=4;c.beginPath();c.arc(106,102,65,0,Math.PI*2);c.fill();c.stroke();
 for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){line(c,[[106+Math.cos(a)*14,102+Math.sin(a)*14],[106+Math.cos(a)*62,102+Math.sin(a)*62]],'#364e5a',5);}
 c.save();c.translate(106,102);c.rotate(angle);
 for(let i=0;i<7;i++){
  c.save();c.rotate(i*Math.PI*2/7);c.beginPath();c.moveTo(11,-5);c.bezierCurveTo(23,-28,49,-34,56,-21);c.bezierCurveTo(58,-11,30,-5,14,7);c.closePath();c.fillStyle='#94a9b480';c.fill();c.strokeStyle='#c0cdd2';c.lineWidth=.7;c.stroke();c.restore();
 }
 c.restore();c.fillStyle='#243e4d';c.strokeStyle='#a8bbc4';c.lineWidth=2;c.beginPath();c.arc(106,102,14,0,Math.PI*2);c.fill();c.stroke();bolt(c,106,102);
 rect(c,135,194,22,11,'#758f9d','#b8c8d0');
 liquid(c,[[146,179],[146,205]],phase,flow,cold,cold,4);
 liquid(c,[[140,-5],[140,25]],phase,flow,hot,hot,4);
 c.restore();
}
