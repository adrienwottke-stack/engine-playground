import * as T from 'three';
import type { Medium } from './engine-3d-model';

export const FLOW_ROUTE_LIMIT = 128;

/** Dedicated flow-view surface. Existing cutaway materials keep their appearance.
 * Bands indicate signed connector flow; their travel speed is illustrative, not m/s.
 * No textures, sprites or per-frame geometry are needed. */
export function createGasVolumeMaterial(medium: 'air' | 'exhaust' | 'chamber') {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    uniforms: {
      uData: { value: Array.from({ length: FLOW_ROUTE_LIMIT }, () => new T.Vector4()) },
      uPulses: { value: Array.from({ length: 6 }, () => new T.Vector4(0,1,0,0)) },
      uPulseHeat: { value: Array<number>(6).fill(0) },
      uChamber: { value: medium === 'chamber' ? 1 : 0 },
      uCool: { value: new T.Color(medium === 'air' ? 0x123b91 : medium === 'exhaust' ? 0x17327c : 0x246d84) },
      uBright: { value: new T.Color(medium === 'air' ? 0x35cabb : medium === 'exhaust' ? 0x2ccab6 : 0x74ddd1) },
      uHot: { value: new T.Color(0xe8a46f) },
    },
    vertexShader: `
      attribute float routeIndex;attribute float pathLength;attribute float volumeFade;
      attribute vec3 pulseDistanceA;attribute vec3 pulseDistanceB;
      uniform vec4 uData[${FLOW_ROUTE_LIMIT}];
      varying vec2 vUv;varying vec4 vData;varying float vLength;
      varying vec3 vNormal;varying vec3 vEye;varying float vFade;
      varying vec3 vDistanceA;varying vec3 vDistanceB;
      void main(){
        vec4 eye=modelViewMatrix*vec4(position,1.0);
        vUv=uv;vData=uData[int(routeIndex)];vLength=pathLength;vFade=volumeFade;
        vDistanceA=pulseDistanceA;vDistanceB=pulseDistanceB;
        vNormal=normalize(normalMatrix*normal);vEye=normalize(-eye.xyz);
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader: `
      uniform vec3 uCool;uniform vec3 uBright;uniform vec3 uHot;
      uniform vec4 uPulses[6];uniform float uPulseHeat[6];uniform float uChamber;
      varying vec2 vUv;varying vec4 vData;varying float vLength;
      varying vec3 vNormal;varying vec3 vEye;varying float vFade;
      varying vec3 vDistanceA;varying vec3 vDistanceB;
      float packet(float distance,vec4 event){
        if(distance< -10000.0||event.z<0.00001)return 0.0;
        float q=(distance-event.x)/event.y;
        float body=exp(-q*q*1.8),front=exp(-pow(q-0.45,2.0)*17.0);
        return (body*0.68+front*0.38)*event.z;
      }
      void main(){
        float travel=(vUv.x-vData.y)*vLength;
        vec3 pa=vec3(packet(vDistanceA.x,uPulses[0]),packet(vDistanceA.y,uPulses[1]),packet(vDistanceA.z,uPulses[2]));
        vec3 pb=vec3(packet(vDistanceB.x,uPulses[3]),packet(vDistanceB.y,uPulses[4]),packet(vDistanceB.z,uPulses[5]));
        float pulse=pa.x+pa.y+pa.z+pb.x+pb.y+pb.z;
        float heat=(dot(pa,vec3(uPulseHeat[0],uPulseHeat[1],uPulseHeat[2]))+dot(pb,vec3(uPulseHeat[3],uPulseHeat[4],uPulseHeat[5])))/max(pulse,0.00001);
        // Recorded backflow keeps a local signed band; its remote source is
        // unknown, so no positive transport event is fabricated for it.
        if(vData.x< -0.000001)pulse+=exp(-pow((vUv.x-vData.y)*vLength/42.0,2.0))*0.55;
        pulse=clamp(pulse,0.0,1.0)*vData.w;
        float facing=abs(dot(normalize(vNormal),normalize(vEye))),chord=sqrt(facing);
        float wisps=0.86+0.14*sin(vUv.y*37.7+sin(travel*0.019)*2.0);
        vec3 color=mix(uCool,uBright,clamp(pulse*0.85,0.0,1.0));
        color=mix(color,vec3(0.27,0.78,0.18),clamp(heat*pulse*1.1,0.0,0.7));
        color=mix(color,uHot,max(0.0,heat-0.55)*pulse*0.7);
        float alpha=(0.045+chord*0.12+pulse*(0.3+chord*0.24)*wisps+uChamber*0.03)*mix(0.22,1.0,vData.w);
        gl_FragColor=vec4(color,alpha*vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Local port spray, gated by intake flow and lift. No injector opening time or
 * pulse width exists in ViewState: this is explicitly a timing illustration. */
export function createPortSprayMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uActivity: { value: Array.from({ length: 6 }, () => new T.Vector2()) } },
    vertexShader: `attribute float routeIndex;uniform vec2 uActivity[6];varying vec2 vActivity;varying vec2 vUv;
      void main(){vActivity=uActivity[int(routeIndex)];vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vActivity;varying vec2 vUv;
      void main(){if(vActivity.x<0.000001)discard;
        float fine=0.6+0.4*sin(vUv.x*94.25+sin(vUv.y*42.0)*2.0);
        float body=sin(vUv.y*3.14159);float alpha=body*mix(0.42,0.68,clamp(vActivity.x,0.0,1.0))*fine;
        gl_FragColor=vec4(0.88,0.73,0.43,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** A single draw per medium carries all live, signed native connector flows. */
export function createFlowMaterial(medium: Medium, color: number) {
  const base = new T.Color(medium === 'air' ? 0x1465ff : color);
  const bright = new T.Color(medium === 'air' ? 0x8cddff : medium === 'exhaust' ? 0xffd491 : color).lerp(new T.Color(0xffffff), .18);
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    uniforms: { uFlow: { value: Array.from({ length: FLOW_ROUTE_LIMIT }, () => new T.Vector2()) }, uColor: { value: base }, uBright: { value: bright } },
    vertexShader: `
      attribute float routeIndex;
      attribute float pathLength;
      uniform vec2 uFlow[${FLOW_ROUTE_LIMIT}];
      varying vec2 vUv;
      varying vec2 vFlow;
      varying float vLength;
      void main(){
        vUv=uv;vFlow=uFlow[int(routeIndex)];vLength=pathLength;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uBright;
      varying vec2 vUv;
      varying vec2 vFlow;
      varying float vLength;
      void main(){
        if(abs(vFlow.x)<0.000001)discard;
        float distance=(vUv.x-vFlow.y)*vLength;
        float band=smoothstep(0.12,0.85,sin(distance*0.12));
        float lane=smoothstep(-0.5,0.7,sin(vUv.y*31.4159+sin(distance*0.022)*0.55));
        float strength=clamp(sqrt(abs(vFlow.x))*0.65,0.3,1.0);
        float light=band*(0.4+lane*0.6);
        float alpha=(0.2+light*0.62)*(0.7+strength*0.3);
        gl_FragColor=vec4(mix(uColor,uBright,light*0.82),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function attachFlowAttributes(geometry: T.BufferGeometry, routeIndex: number, length: number) {
  if (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex >= FLOW_ROUTE_LIMIT) throw new Error('Zu viele Strömungswege für den gebündelten Renderer.');
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('routeIndex', new T.BufferAttribute(new Float32Array(count).fill(routeIndex), 1));
  geometry.setAttribute('pathLength', new T.BufferAttribute(new Float32Array(count).fill(length), 1));
  return geometry;
}

/** Deterministic, wrinkled hemisphere at the native ignition progress. The
 * source research motivates kernel expansion and increasing wrinkling only;
 * this illustration is not a computed CFD flame surface.
 * https://link.springer.com/article/10.1007/s10494-022-00350-w (Fig. 6)
 */
export function flameFrontPoint(index: number, count: number, progress: number, boreRadius: number, chamberHeight: number) {
  const p = Math.max(0, Math.min(1, progress));
  const radius = Math.min(boreRadius - 1, 1.5 + Math.pow(p, .72) * (boreRadius + 8));
  const azimuth = index * 2.399963229728653;
  const down = (index + .5) / count, radial = Math.sqrt(1 - down * down);
  const wrinkle = 1 + p * (.12 * Math.sin(azimuth * 3 + down * 19 + p * 8) + .07 * Math.sin(azimuth * 7 - down * 13));
  const shell = index % 5 === 0 ? .72 : 1;
  let x = Math.cos(azimuth) * radial * radius * wrinkle * shell;
  let z = Math.sin(azimuth) * radial * radius * wrinkle * shell * 1.08;
  const horizontal = Math.hypot(x, z), limit = Math.max(1, boreRadius - 1);
  if (horizontal > limit) { x *= limit / horizontal; z *= limit / horizontal; }
  const y = -Math.min(Math.max(1, chamberHeight - 2), 1.2 + down * radius * wrinkle * 1.25);
  return { x, y, z, radius, wrinkling: p, energy: index % 5 === 0 ? .6 : 1 };
}

export function createFlameMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uHeat: { value: 0 }, uPressure: { value: 0 }, uPointScale: { value: 500 } },
    vertexShader: `
      attribute float seed;
      uniform float uProgress;
      uniform float uPointScale;
      varying float vSeed;
      void main(){
        vSeed=seed;
        vec4 eye=modelViewMatrix*vec4(position,1.0);
        float size=mix(5.0,8.0,uProgress)*(0.7+fract(seed*13.17)*0.6);
        gl_PointSize=clamp(size*uPointScale/max(1.0,-eye.z),1.5,42.0);
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader: `
      uniform float uProgress;
      uniform float uHeat;
      uniform float uPressure;
      varying float vSeed;
      void main(){
        vec2 p=gl_PointCoord*2.0-1.0;
        float radius=length(p);if(radius>1.0)discard;
        float core=exp(-radius*radius*4.5);
        vec3 yellow=vec3(1.0,0.72,0.19),white=vec3(1.0,0.95,0.76),red=vec3(1.0,0.18,0.035);
        vec3 color=mix(yellow,red,smoothstep(0.3,1.0,uProgress)*(0.3+fract(vSeed*17.0)*0.7));
        color=mix(color,white,core*(1.0-uProgress)*0.82);
        float alpha=pow(1.0-radius,1.1)*(0.10+uPressure*0.045)*(1.0-smoothstep(0.8,1.0,uProgress)*0.5);
        gl_FragColor=vec4(color*(0.7+uHeat*0.5),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export interface ExhaustPlumes { points: T.Points; material: T.ShaderMaterial; outlets: T.Vector3[]; directions: T.Vector3[]; flow: T.Vector2 }

/** Both outlets share one sprite draw. Rate gates originate in the corresponding
 * native three-cylinder collector, and stop as soon as the motor is at rest. */
export function createExhaustPlumes(outlets: T.Vector3[], directions: T.Vector3[]): ExhaustPlumes {
  if(outlets.length!==2||directions.length!==2)throw new Error('Die Abgasdarstellung braucht genau zwei angeschlossene Austritte.');
  const perOutlet = 90, count = perOutlet * outlets.length;
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count), banks = new Float32Array(count);
  for (let i = 0; i < count; i++) { seeds[i] = (i % perOutlet + .5) / perOutlet; banks[i] = Math.floor(i / perOutlet); }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new T.BufferAttribute(seeds, 1));
  geometry.setAttribute('bank', new T.BufferAttribute(banks, 1));
  const envelope=outlets.flatMap((outlet,index)=>[outlet.clone(),outlet.clone().addScaledVector(directions[index],230).add(new T.Vector3(0,70,0))]);
  geometry.boundingSphere=new T.Box3().setFromPoints(envelope).getBoundingSphere(new T.Sphere());geometry.boundingSphere.radius+=55;
  const flow = new T.Vector2();
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOrigins: { value: outlets }, uDirections: { value: directions }, uFlow: { value: flow }, uTime: { value: 0 }, uPointScale: { value: 500 } },
    vertexShader: `
      attribute float seed;attribute float bank;
      uniform vec3 uOrigins[2];uniform vec3 uDirections[2];
      uniform vec2 uFlow;uniform float uTime;uniform float uPointScale;
      varying float vAge;varying float vFlow;varying float vSeed;
      void main(){
        int b=int(bank);float flow=b==0?uFlow.x:uFlow.y;
        float age=fract(seed+uTime*(0.42+min(flow,1.0)*0.3));
        vec3 d=uDirections[b],side=normalize(cross(d,vec3(0.0,1.0,0.0)));
        float theta=seed*457.13+uTime*0.8;
        float width=3.0+age*27.0;
        vec3 position=uOrigins[b]+d*(age*230.0)+side*sin(theta)*width;
        position.y+=age*age*36.0+cos(theta*1.3)*width*0.6;
        vec4 eye=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=clamp((11.0+age*36.0)*uPointScale/max(1.0,-eye.z),2.0,64.0);
        gl_Position=projectionMatrix*eye;vAge=age;vFlow=flow;vSeed=seed;
      }`,
    fragmentShader: `
      varying float vAge;varying float vFlow;varying float vSeed;
      void main(){
        if(vFlow<0.00001)discard;
        float r=length(gl_PointCoord*2.0-1.0);if(r>1.0)discard;
        float alpha=pow(1.0-r,1.6)*(1.0-vAge)*(0.1+min(vFlow,1.0)*0.26);
        alpha*=smoothstep(0.0,0.06,vAge);
        gl_FragColor=vec4(mix(vec3(0.73,0.78,0.8),vec3(0.95,0.8,0.6),max(0.0,0.35-vAge)),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new T.Points(geometry, material); points.name = 'Zwei native Abgasfahnen'; points.visible = false;
  return { points, material, outlets, directions, flow };
}
