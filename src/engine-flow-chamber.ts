import * as T from 'three';
import {combustionAppearance} from './engine-3d-model';
import {valveSample} from './native-view';
import type {ViewState} from './drawing';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const stageId={idle:0,intake:1,compression:2,kernel:3,front:3,expansion:4,exhaust:5};
/** The existing recorded cycle owns burn windows, temperature, pressure and
 * lift. These are display channels, not a new combustion or injection model. */
export function flowChamberState(state:ViewState|null,angle:number,cylinder:number){
  const fire=combustionAppearance(state,angle,cylinder),valves=valveSample(state,angle,cylinder);
  const running=(state?.rpm??0)>5,available=fire.available;
  const active=running&&available,stage=active?stageId[fire.stage]:0;
  return {available,active,stage,stageName:active?fire.stage:'idle',heat:active?fire.heat:0,pressure:active?fire.pressure:0,
    burning:active&&fire.burning,progress:active&&fire.burning?fire.progress:0,
    intakeLift:valves?.intakeLiftMm??0,exhaustLift:valves?.exhaustLiftMm??0,
    intakeGate:active&&fire.intake>1e-6&&(valves?.intakeLiftMm??0)>.05?Math.min(1,Math.sqrt(fire.intake)*1.5):0,
    exhaustGate:active&&fire.exhaust>1e-6&&(valves?.exhaustLiftMm??0)>.05?Math.min(1,Math.sqrt(fire.exhaust)*1.5):0};
}

/** Fixed interior density samples in three directions remain readable from
 * above and from the side. Their projection illustrates native scalar cylinder
 * states; it is not a solved three-dimensional temperature/pressure field. */
export function createChamberVolumeGeometry(cylinderIndex:number){
  const pieces:T.BufferGeometry[]=[];
  const add=(g:T.BufferGeometry,weight:number)=>{g.setAttribute('densityWeight',new T.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(weight),1));pieces.push(g);};
  add(new T.CylinderGeometry(1,1,1,48),.18);
  for(const t of [-.8,-.4,0,.4,.8]){
    const width=2*Math.sqrt(1-t*t);
    const z=new T.PlaneGeometry(width,1,1,8);z.translate(0,0,t);add(z,.38);
    const x=new T.PlaneGeometry(width,1,1,8);x.rotateY(Math.PI/2);x.translate(t,0,0);add(x,.38);
    const y=new T.CircleGeometry(1,48);y.rotateX(Math.PI/2);y.translate(0,t/2,0);add(y,.38);
  }
  const result=mergeGeometries(pieces)!;pieces.forEach(g=>g.dispose());
  const count=result.getAttribute('position').count;
  result.setAttribute('routeIndex',new T.BufferAttribute(new Float32Array(count).fill(cylinderIndex),1));
  result.setAttribute('color',new T.BufferAttribute(new Float32Array(count*4),4).setUsage(T.DynamicDrawUsage));return result;
}
export function createChamberVolumeMaterial(){
  return new T.MeshBasicMaterial({color:0xffffff,vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
}
export function updateChamberVolumeColours(geometry:T.BufferGeometry,state:ReturnType<typeof flowChamberState>){
  const position=geometry.getAttribute('position'),weights=geometry.getAttribute('densityWeight'),colour=geometry.getAttribute('color');
  let r=.025,g=.09,b=.58;
  if(state.stage===2){const t=Math.min(.8,state.pressure*1.6+state.heat*.35);g+=(.62-g)*t;b+=(.72-b)*t;}
  if(state.stage===4||state.stage===5){const t=Math.min(1,state.heat*1.6);r=.025+(.16-.025)*t;g=.62+(.67-.62)*t;b=.72+(.25-.72)*t;}
  if(state.burning){r=.072;g=.638;b=.555;}
  if(!state.active){r=.16;g=.24;b=.32;}
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i)+.5,z=position.getZ(i),swirl=.92+.08*Math.sin(x*7+z*9+y*6+state.progress*3);
    let cr=r*(.84+y*.22),cg=g*(.84+y*.22),cb=b*(.84+y*.22),edge=0;
    if(state.burning){const front=1.06-state.progress*1.28+.035*Math.sin(x*8+z*5),t=Math.max(0,Math.min(1,(y-front+.1)/.18)),burned=t*t*(3-2*t)*.9;edge=Math.exp(-Math.pow((y-front)/.075,2))*.85;
      cr+=(.82-cr)*burned;cg+=(.19-cg)*burned;cb+=(.045-cb)*burned;cr+=(1-cr)*edge;cg+=(.79-cg)*edge;cb+=(.36-cb)*edge;}
    const alpha=(.34+state.pressure*.22+edge*.12)*weights.getX(i)*swirl*(state.active?1:.14);
    colour.setXYZW(i,cr,cg,cb,Math.min(.3,alpha));
  }
  colour.needsUpdate=true;
}

/** The visible annular curtain follows actual valve travel; it vanishes when
 * seated or the recorded gas flow points the other way. One draw for24 seats. */
export function createValveCurtainMaterial(){
  return new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    uniforms:{uValves:{value:Array.from({length:12},()=>new T.Vector4())}},
    vertexShader:`attribute float valveIndex;uniform vec4 uValves[12];varying vec4 vState;varying vec2 vUv;varying vec3 vNormal;varying vec3 vEye;
      void main(){vec4 p=instanceMatrix*vec4(position,1.0);vec4 eye=modelViewMatrix*p;
        vUv=uv;vState=uValves[int(valveIndex)];vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vEye=normalize(-eye.xyz);gl_Position=projectionMatrix*eye;}`,
    fragmentShader:`varying vec4 vState;varying vec2 vUv;varying vec3 vNormal;varying vec3 vEye;
      void main(){if(vState.x<0.00001)discard;
        float through=vState.z>0.5?vUv.y:1.0-vUv.y;
        vec3 color=mix(vec3(0.03,0.25,0.86),vec3(0.08,0.85,0.69),vState.x);
        color=mix(color,vec3(0.48,0.81,0.22),vState.y*0.8);
        float core=sqrt(abs(dot(normalize(vNormal),normalize(vEye))));
        float alpha=(0.14+vState.x*0.48)*(0.6+core*0.4)*sin(vUv.y*3.14159);
        color*=0.8+through*0.35;gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
