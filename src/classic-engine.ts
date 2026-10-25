import { prepareCanvas, type ViewState } from './drawing';
import { pistonGeometry, TAU, type Config } from './model';

/** Simple slider-crank view, matching the original dashboard's visual hierarchy. */
export function drawClassicEngine(canvas: HTMLCanvasElement, state: ViewState | null, config: Config, angle: number, cylinder: number, slow = true) {
  const ctx = prepareCanvas(canvas, 500, 550);
  const fit = Math.min(canvas.width / 500, canvas.height / 550);
  ctx.setTransform(fit, 0, 0, fit, (canvas.width - 500 * fit) / 2, (canvas.height - 550 * fit) / 2);
  const scale = 1.45, crankY = 426, x = 250;
  const geometry = pistonGeometry(angle, cylinder, config.engine.strokeMm, config.engine.rodMm);
  const wristY = crankY + geometry.pistonY * scale;
  const pistonY = wristY - 32;
  const pinX = x + geometry.crankX * scale, pinY = crankY + geometry.crankY * scale;
  const halfBore = config.engine.boreMm * scale / 2;
  const top = crankY - (config.engine.rodMm + config.engine.strokeMm / 2) * scale - 63;
  const wallBottom = crankY - 75;
  ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, 500, 550);
  const burning = state?.ignition && geometry.stage === 0 && geometry.phase < 1.4;
  ctx.fillStyle = burning ? '#e4aa45' : '#293439';
  ctx.fillRect(x-halfBore, top+29, halfBore*2, Math.max(0,pistonY-top-29));
  ctx.fillStyle = '#d580b3';
  ctx.fillRect(x-halfBore-10, top+18, 8, wallBottom-top-18);
  ctx.fillRect(x+halfBore+2, top+18, 8, wallBottom-top-18);
  ctx.fillRect(x-halfBore-21, top, halfBore*2+42, 17);
  const intake = geometry.stage === 2 && !!state?.rpm;
  const exhaust = geometry.stage === 1 && !!state?.rpm;
  const valveLift = 14 * Math.sin(geometry.phase % Math.PI);
  for (const [offset, color, lift] of [[-25,'#6ed2df',intake?valveLift:0],[25,'#f6cb54',exhaust?valveLift:0]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x+offset,top-33); ctx.lineTo(x+offset,top+25+lift); ctx.stroke();
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x+offset-11,top+24+lift); ctx.lineTo(x+offset+11,top+24+lift); ctx.stroke();
    ctx.save(); ctx.translate(x+offset,top-61); ctx.rotate(angle/2+(offset<0?.6:-.6));
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0,-5,16,24,0,0,TAU); ctx.fill(); ctx.fillStyle='#111'; ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.fill();ctx.restore();
  }
  ctx.fillStyle = '#bbb'; ctx.fillRect(x-halfBore+3,pistonY,halfBore*2-6,49);
  for (let row=0;row<3;row++){ctx.fillStyle=row===1?'#e9e9e9':'#9d9d9d';ctx.fillRect(x-halfBore+3,pistonY+7+row*7,halfBore*2-6,3);}
  const dx=pinX-x,dy=pinY-wristY,len=Math.hypot(dx,dy),normalX=-dy/len*10,normalY=dx/len*10;
  ctx.fillStyle='#919191';ctx.beginPath();ctx.moveTo(x+normalX,wristY+normalY);ctx.lineTo(pinX+normalX,pinY+normalY);ctx.lineTo(pinX-normalX,pinY-normalY);ctx.lineTo(x-normalX,wristY-normalY);ctx.closePath();ctx.fill();
  ctx.fillStyle='#b7b7b7';ctx.beginPath();ctx.arc(x,crankY,48,0,TAU);ctx.fill();
  ctx.save();ctx.translate(x,crankY);ctx.rotate(angle);ctx.fillStyle='#d7d7d7';ctx.beginPath();ctx.moveTo(-24,-10);ctx.lineTo(24,-10);ctx.lineTo(40,27);ctx.lineTo(-40,27);ctx.closePath();ctx.fill();ctx.restore();
  for(const [px,py,r]of[[x,wristY,10],[pinX,pinY,16],[x,crankY,12]]){ctx.fillStyle='#797979';ctx.beginPath();ctx.arc(px,py,r,0,TAU);ctx.fill();ctx.fillStyle='#202020';ctx.beginPath();ctx.arc(px,py,3,0,TAU);ctx.fill();}
  ctx.font='11px Consolas, monospace';ctx.fillStyle='#777';ctx.textAlign='center';ctx.fillText(`ZYLINDER ${cylinder} / SCHNITT · ${slow?'VISUELLE ZEITLUPE':'ECHTZEIT'}`,250,523);
}
