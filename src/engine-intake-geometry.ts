import * as T from 'three';
import type {IntakePassage} from './engine-intake-layout';

const TAU=Math.PI*2;
export type IntakeSkin={spec:IntakePassage;curve:T.CatmullRomCurve3;closed:T.BufferGeometry;cut:T.BufferGeometry;field:(p:T.Vector3,inner:boolean)=>number;bounds:T.Box3};
const power=(x:number,p:number)=>Math.abs(x)<1e-10?0:Math.sign(x)*Math.pow(Math.abs(x),p);

/** Build one hollow, capped-where-requested passage and an opening in the same
 * wall. These are display surfaces; not claimed to be a watertight CFD mesh. */
export function intakePassageSkin(spec:IntakePassage):IntakeSkin{
  const curve=new T.CatmullRomCurve3(spec.coords.map(p=>new T.Vector3(...p)),false,'centripetal'),steps=48,radial=32,stride=radial+1;
  const centers=Array.from({length:steps+1},(_,i)=>curve.getPointAt(i/steps)),normals:T.Vector3[]=[],bins:T.Vector3[]=[],tangents:T.Vector3[]=[],width:number[]=[],height:number[]=[];
  for(let i=0;i<=steps;i++){
    const u=i/steps,t=curve.getTangentAt(u),n=spec.axis==='x'?new T.Vector3(0,1,0):i?normals[i-1].clone():Math.abs(t.x)<.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0);n.addScaledVector(t,-n.dot(t)).normalize();normals.push(n);bins.push(new T.Vector3().crossVectors(t,n).normalize());tangents.push(t);
    const cap=(spec.capStart ? .4+.6*T.MathUtils.smoothstep(u,0,.12) : 1)*(spec.capEnd ? .4+.6*T.MathUtils.smoothstep(1-u,0,.12) : 1),root=spec.rootWidth?T.MathUtils.lerp(spec.rootWidth,spec.width,T.MathUtils.smoothstep(u,0,.45)):spec.width;
    width.push((spec.section==='port'?T.MathUtils.lerp(root,33,T.MathUtils.smoothstep(u,.78,1)):root)*cap);height.push((spec.section==='port'?T.MathUtils.lerp(spec.height,20,T.MathUtils.smoothstep(u,.76,1)):spec.height)*cap);
  }
  const make=(section:boolean)=>{
    const positions:number[]=[],uv:number[]=[],ix:number[]=[],layer=(steps+1)*stride,sweep=section?(spec.axis==='x'?Math.PI:TAU-2.1):TAU;
    for(const side of [0,1])for(let i=0;i<=steps;i++)for(let j=0;j<=radial;j++){
      const roof=Math.atan2(bins[i].y+.65*bins[i].x,normals[i].y+.65*normals[i].x),start=section?(spec.axis==='x'?Math.PI/2:roof+1.05):0,angle=start+j/radial*sweep,u=i/steps,wall=side*(spec.section==='port'?T.MathUtils.lerp(3,2,T.MathUtils.smoothstep(u,.8,1)):3),w=width[i]-wall,h=height[i]-wall,p=spec.section==='round'?1:.55;
      const ca=power(Math.cos(angle),p),sa=power(Math.sin(angle),p),vertical=spec.section==='port'?T.MathUtils.lerp(sa,Math.max(-.74,sa),T.MathUtils.smoothstep(u,.78,1)):sa;
      const center=centers[i].clone();if(side&&i===0&&spec.capStart)center.addScaledVector(tangents[i],3);if(side&&i===steps&&spec.capEnd)center.addScaledVector(tangents[i],-3);
      positions.push(...center.addScaledVector(normals[i],ca*w).addScaledVector(bins[i],vertical*h).toArray());uv.push(u,j/radial);
    }
    const quad=(a:number,b:number,c:number,d:number,flip=false)=>ix.push(...(flip?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
    for(let i=0;i<steps;i++)for(let j=0;j<radial;j++){const a=i*stride+j,b=a+stride;quad(a,b,a+1,b+1,true);quad(a+layer,b+layer,a+1+layer,b+1+layer);}
    for(const i of [0,steps]){
      const capped=i===0?spec.capStart:spec.capEnd;
      if(capped)for(const side of [0,1]){const k=positions.length/3,p=centers[i].clone();if(side)p.addScaledVector(tangents[i],i===0?3:-3);positions.push(...p.toArray());uv.push(i/steps,.5);for(let j=0;j<radial;j++){const a=side*layer+i*stride+j;ix.push(...((i===0)!==!!side?[k,a+1,a]:[k,a,a+1]));}}
      else for(let j=0;j<radial;j++){const a=i*stride+j;quad(a,a+1,a+layer,a+1+layer,i===steps);}
    }
    if(section)for(const j of [0,radial])for(let i=0;i<steps;i++){const a=i*stride+j,b=a+stride;quad(a,b,a+layer,b+layer,j===radial);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();g.userData.innerStart=layer;g.userData.sourceSamples=layer*2;return g;
  };
  const closed=make(false),cut=make(true);closed.computeBoundingBox();const bounds=closed.boundingBox!.clone().expandByScalar(.1);
  const field=(p:T.Vector3,inner:boolean)=>{
    if(!bounds.containsPoint(p))return 2;let best=Infinity,result=2;
    for(let i=0;i<steps;i++){
      const c=centers[i],d=centers[i+1],dx=d.x-c.x,dy=d.y-c.y,dz=d.z-c.z,den=dx*dx+dy*dy+dz*dz,u=T.MathUtils.clamp(((p.x-c.x)*dx+(p.y-c.y)*dy+(p.z-c.z)*dz)/den,0,1),qx=p.x-c.x-dx*u,qy=p.y-c.y-dy*u,qz=p.z-c.z-dz*u,dist=qx*qx+qy*qy+qz*qz;
      if(dist>=best)continue;best=dist;const n=normals[i],b=bins[i],t=tangents[i],wall=inner?3:0,w=T.MathUtils.lerp(width[i],width[i+1],u)-wall,h=T.MathUtils.lerp(height[i],height[i+1],u)-wall,qn=qx*n.x+qy*n.y+qz*n.z,qb=qx*b.x+qy*b.y+qz*b.z,qt=qx*t.x+qy*t.y+qz*t.z,e=spec.section==='round'?2:2/.55;
      result=Math.pow(Math.abs(qn/w),e)+Math.pow(Math.abs(qb/h),e)+Math.pow(Math.abs(qt/Math.min(w,h)),e)-1;
    }return result;
  };
  return{spec,curve,closed,cut,field,bounds};
}

/** Mutual skin intersections are removed on both wall faces. Original samples
 * are retained for section inspection; unused vertices are discarded by batching. */
export function joinIntakeSkins(skins:IntakeSkin[],only?:Set<string>){
  for(const skin of skins){if(only&&!only.has(skin.spec.id))continue;const others=skins.filter(s=>s!==skin&&s.bounds.intersectsBox(skin.bounds));for(const g of [skin.closed,skin.cut]){
    const a=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),p=Array.from(a.array),norm=Array.from(n.array),tex=Array.from(uv.array),ix:number[]=[],source=g.getIndex()!,layer=g.userData.innerStart as number,caches=[new Map<number,number>(),new Map<number,number>()];
    const at=(i:number)=>new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)),field=(v:T.Vector3,inner:boolean)=>others.length?Math.min(...others.map(s=>s.field(v,inner))):2;
    for(let k=0;k<source.count;k+=3){const ids=[source.getX(k),source.getX(k+1),source.getX(k+2)],inner=ids.filter(i=>i>=layer).length>=2,cache=caches[inner?1:0],f=ids.map(i=>{let v=cache.get(i);if(v===undefined){v=field(at(i),inner);cache.set(i,v);}return v;});if(f.every(x=>x>=0)){ix.push(...ids);continue;}if(f.every(x=>x<0))continue;
      const polygon:number[]=[];
      for(let j=0;j<3;j++){const next=(j+1)%3,i=ids[j],q=ids[next];if(f[j]>=0)polygon.push(i);if((f[j]>=0)===(f[next]>=0))continue;
        const start=at(i),end=at(q);let lo=0,hi=1;for(let z=0;z<10;z++){const u=(lo+hi)/2;if((field(start.clone().lerp(end,u),inner)>=0)===(f[j]>=0))lo=u;else hi=u;}const u=(lo+hi)/2,v=start.lerp(end,u),nn=new T.Vector3(n.getX(i),n.getY(i),n.getZ(i)).lerp(new T.Vector3(n.getX(q),n.getY(q),n.getZ(q)),u).normalize();polygon.push(p.length/3);p.push(...v.toArray());norm.push(...nn.toArray());tex.push(T.MathUtils.lerp(uv.getX(i),uv.getX(q),u),T.MathUtils.lerp(uv.getY(i),uv.getY(q),u));
      }for(let j=1;j<polygon.length-1;j++)ix.push(polygon[0],polygon[j],polygon[j+1]);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('uv',new T.Float32BufferAttribute(tex,2));g.setIndex(ix);g.computeBoundingBox();g.computeBoundingSphere();
  }}
}
