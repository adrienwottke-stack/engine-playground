import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

/** Bounded C1 shoulder easing, with the same end points as a linear ramp. */
export function castingEase(t:number){const u=T.MathUtils.clamp(t,0,1);return u*u*(3-2*u);}

/** Replace an existing rib by a shallow sweep with a quarter-circle root.
 * Crest, centreline and rounded longitudinal ends retain the authored rib.
 * Only its foot grows into the backing skin; there is no new parallel rib. */
export function castRibWithRoot(a:number[],b:number[],width:number,depth:number,backing:(x:number,y:number)=>number,radius=5){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),side=Math.sign(a[2])||1;
  if(length<1||width<=0||depth<=0||radius<=0)throw new Error('Ungültiger Gussrippenquerschnitt');
  const ux=dy/length,uy=-dx/length,alongX=dx/length,alongY=dy/length,half=width/2;
  const shape=new T.Shape(),r=Math.min(width*.4,2.5),low=-length/2,high=length/2;
  shape.moveTo(-half+r,low);shape.lineTo(half-r,low);shape.quadraticCurveTo(half,low,half,low+r);
  for(let y=low+r+6;y<high-r;y+=6)shape.lineTo(half,y);
  shape.lineTo(half,high-r);shape.quadraticCurveTo(half,high,half-r,high);shape.lineTo(-half+r,high);shape.quadraticCurveTo(-half,high,-half,high-r);
  for(let y=high-r-6;y>low+r;y-=6)shape.lineTo(-half,y);
  shape.lineTo(-half,low+r);shape.quadraticCurveTo(-half,low,-half+r,low);shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:1,steps:14,bevelEnabled:false,curveSegments:6}),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const u=p.getX(i),v=p.getY(i)+length/2,t=T.MathUtils.clamp(v/length,0,1),x=a[0]+alongX*v,y=a[1]+alongY*v;
    const crest=side*(a[2]+(b[2]-a[2])*t)+depth/2,base=Math.min(backing(x,y)-.25,crest-1.5),height=crest-base;
    const q=Math.pow(side<0?1-p.getZ(i):p.getZ(i),2),out=q*height,fillet=Math.min(radius,height*.65);
    const flare=out<fillet?fillet-Math.sqrt(Math.max(0,fillet*fillet-(fillet-out)*(fillet-out))):0;
    // Longitudinal fade avoids growing across the existing rounded end lands.
    const endFade=castingEase(v/9)*castingEase((length-v)/9),spread=u*(1+flare/half*endFade);
    p.setXYZ(i,x+ux*spread,y+uy*spread,side*(base+out));
  }
  geometry.deleteAttribute('normal');const result=mergeVertices(geometry,1e-4);geometry.dispose();result.computeVertexNormals();result.computeBoundingSphere();return result;
}
