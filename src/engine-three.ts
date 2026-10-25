import {intakeRouteRate} from './engine-intake-flow';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TAU,mod,copyConfig,type Config} from './model';
import {valveSample,cycleSample,type ValveCurves} from './native-view';
import type {ViewState} from './drawing';
import {CYLINDER_X,MEDIA,mechanismPose,assemblyDimensions,valveSpringPose,camProfileRadius,flowActivity,pipeVisibility,combustionAppearance,presentationVisibility,type Medium,type PipeMode,type EnginePresentation} from './engine-3d-model';
import {engineRoutes,assemblyConnectors,type RouteSpec} from './engine-3d-layout';
import {buildWorkshopAssembly,animateWorkshopAssembly,createWorkshopFlywheel,type WorkshopAssembly} from './engine-3d-assembly';
import {disposeSceneResources} from './engine-three-resources';
import {createEngineMaterial} from './engine-material-profiles';
import {setCoolingPlumbingPresentation} from './engine-3d-cooling';
import {createEngineFlowView,FLOW_VIEW_BACKGROUND,type EngineFlowView} from './engine-flow-view';
import {m54IntakeVariant,type M54IntakeSelection} from './engine-3d-intake';
import {PISTON_SPEC} from './piston-spec';
import {loadPistonLibrary,createPistonInstance,explodePiston,type PistonLibrary,type PistonInstance} from './piston-asset';
import {loadStudioEnvironment} from './part-lighting';
import {createFlowMaterial,attachFlowAttributes,flameFrontPoint,createFlameMaterial,createExhaustPlumes,type ExhaustPlumes} from './engine-render-effects';

type Route={medium:Medium;cylinder?:number;branch:string;internal:boolean;flowFactor:number;flowIndex:number;length:number;pipe:T.Mesh;volume:T.Mesh;points:T.Points;buffer:T.BufferAttribute;table:T.Vector3[];phase:number;rate:number};
type FlowBatch={pipe:T.Mesh|null;volume:T.Mesh;points:T.Points;buffer:T.BufferAttribute};
type CylinderParts={piston:T.Group;wristPin:T.Object3D;crown:T.Object3D;rod:T.Mesh;smallEnd:T.Mesh;bigEnd:T.Mesh;throw:T.Group;valves:T.Group[];springs:T.Mesh[][];cams:T.Group[];gas:T.Mesh;flame:T.Points;flameBuffer:T.BufferAttribute;spark:T.Mesh};
const Y=new T.Vector3(0,1,0),V=new T.Vector3(),P=new T.Vector3(),Q=new T.Vector3();

export class EngineThree {
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(38,1,2,4000);
  readonly renderer:T.WebGLRenderer;
  readonly controls:OrbitControls;
  private parts:CylinderParts[]=[];
  private routes:Route[]=[];
  private extras=new T.Group();
  private head=new T.Group();
  private housing=new T.Group();
  private mechanical=new T.Group();
  private combustion=new T.Group();
  private studio=new T.Group();
  private assetSources=new T.Group();
  private studioPiston:PistonInstance|null=null;
  private pistonLibrary:PistonLibrary|null=null;
  private environment:T.DataTexture|null=null;
  private component:'engine'|'piston'='engine';
  private presentation:EnginePresentation='cutaway';
  private exploded=0;
  private extrasEnabled=true;
  private housingEnabled=true;
  private engineFloor:T.GridHelper;
  private keyLight:T.DirectionalLight;
  private flowGroups=new Map<Medium,T.Group>();
  private flowBatches=new Map<Medium,FlowBatch>();
  private routeMaterials=new Map<string,T.Material>();
  private workshop:WorkshopAssembly|null=null;
  private exhaustPlumes:ExhaustPlumes|null=null;
  private flowView:EngineFlowView|null=null;
  private portSpray:T.Mesh|null=null;
  private glowTexture:T.DataTexture|null=null;
  private clock=0;
  private width=1;
  private height=1;
  private disposed=false;
  private ready=false;
  private contextLost=false;
  private observer:ResizeObserver;
  private materials:T.Material[]=[];
  private mode:Record<Medium,PipeMode>={air:'transparent',fuel:'transparent',exhaust:'transparent',water:'transparent',oil:'transparent'};
  private deck=135+42+PISTON_SPEC.compressionHeightMm+PISTON_SPEC.illustrativeCrownClearanceMm;
  private headOffset=this.deck-205;
  private boreScale=1;
  private nativeGeometry='84:84:135';
  private intakeSelection:M54IntakeSelection={};
  private intakeGeometry='standard';
  private assemblyRevision=0;
  private camCurves:ValveCurves|null|undefined=null;
  private cameraPreset='overview';
  private frameSerial=0;
  private lastAngle=0;
  private lastDriveAngle=0;
  private frameCount=0;
  private cameraLayout='';
  private cameraPoints:T.Vector3[]=[];
  private lastRender=0;
  private lastDrawSignature='';
  private renderSamples=0;
  private renderCost=0;
  private pixelRatio=Math.min(devicePixelRatio||1,1);
  private softwareGraphics=false;
  private studioDirty=true;
  private flywheel!:T.Group;
  private staticMaterial:T.MeshStandardMaterial;
  private metal:T.MeshStandardMaterial;
  private rodMetal:T.MeshStandardMaterial;
  private dark:T.MeshStandardMaterial;

  constructor(readonly host:HTMLElement){
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareGraphics=!!debug&&/swiftshader|llvmpipe|software|warp/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)));
    if(this.softwareGraphics)this.pixelRatio=Math.min(devicePixelRatio||1,.4);
    host.dataset.graphics=this.softwareGraphics?'software':'hardware';
    this.renderer.setPixelRatio(this.pixelRatio);this.renderer.setClearColor(0x17252f);
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    // The studio assembly is stationary between inspection changes. Reuse its
    // shadow map while orbiting instead of redrawing it on every animation tick.
    this.renderer.shadowMap.autoUpdate=false;
    const canvas=this.renderer.domElement;canvas.id='engine-3d-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Drehbarer 3D-Reihensechser im Schnitt mit Ansaugung, Abgasanlage, Kuehlung und bewegtem Steuertrieb');
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.host.dataset.webgl='lost';});
    canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.studioDirty=true;this.renderer.shadowMap.needsUpdate=true;this.host.dataset.webgl='ready';});
    host.append(canvas);host.dataset.webgl='loading';
    this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(0,105,0);this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.minDistance=400;this.controls.maxDistance=2000;
    this.controls.addEventListener('change',()=>{this.studioDirty=true;host.dataset.camera=this.camera.position.toArray().map(v=>v.toFixed(1)).join(',');});
    this.resetCamera();
    const hemi=new T.HemisphereLight(0xd5e1ed,0x26313a,1.1);this.scene.add(hemi);
    this.keyLight=new T.DirectionalLight(0xfff1df,2.2);this.keyLight.position.set(-300,600,450);
    Object.assign(this.keyLight.shadow.camera,{left:-130,right:130,top:130,bottom:-130,near:1,far:1500});
    this.keyLight.shadow.mapSize.set(this.softwareGraphics?512:1024,this.softwareGraphics?512:1024);this.keyLight.shadow.normalBias=.08;this.keyLight.shadow.bias=-.0002;this.scene.add(this.keyLight);
    for(const [x,y,z,color,intensity] of [[350,300,-400,0xa3c9ef,1.3],[150,120,-300,0xe4efff,2]] as const){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);this.scene.add(l);}
    this.metal=this.mat(0x9eafb8,.62,.36);this.rodMetal=this.mat(0x7e919b,.65,.38);this.dark=this.mat(0x263840,.5,.5);this.staticMaterial=this.mat(0x465b67,.5,.45);
    this.scene.add(this.extras,this.housing,this.mechanical,this.combustion);this.extras.add(this.head);
    this.engineFloor=new T.GridHelper(1700,34,0x44606c,0x29404c);this.engineFloor.position.set(130,-158,0);(this.engineFloor.material as T.Material).transparent=true;(this.engineFloor.material as T.Material).opacity=.28;this.scene.add(this.engineFloor);
    this.studio.visible=false;this.scene.add(this.studio);
    this.assetSources.visible=false;this.scene.add(this.assetSources);
    this.observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width<1||r.height<1)return;this.width=r.width;this.height=r.height;this.renderer.setSize(this.width,this.height,false);this.studioDirty=true;this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();const layout=this.width<600?'narrow':'wide';if(this.cameraLayout!==layout){this.cameraLayout=layout;this.view(this.cameraPreset);}});this.observer.observe(host);
    canvas.addEventListener('keydown',this.keydown);this.updateVisibility();
    host.dataset.mechanism='always-visible';host.dataset.occlusion='shared-depth';host.dataset.cylinders='6';
  }
  static async create(host:HTMLElement,readState?:()=>{state:ViewState|null;cfg:Config}|null){
    const started=performance.now(),engine=new EngineThree(host);
    try{
      const library=await loadPistonLibrary();engine.pistonLibrary=library;engine.assetSources.add(library.hero,library.engine);
      engine.studioPiston=createPistonInstance(library.hero);engine.studio.add(engine.studioPiston.root);
      const environment=await loadStudioEnvironment();engine.environment=environment;engine.scene.environmentIntensity=.85;
      // Only authored parts need image-based reflections in the moving engine.
      // Legacy illustrative pipes/extras retain their lighter material path.
      library.engine.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial){
        if(engine.softwareGraphics){material.normalMap=null;material.envMap=null;material.metalness=Math.min(.28,material.metalness);material.roughness=Math.max(.4,material.roughness);}
        else{material.envMap=environment;material.envMapIntensity=.85;}
        material.needsUpdate=true;
      }});
      // A front-facing inspection surface receives the contact shadow above it,
      // and disappears naturally from below so the hollow piston stays visible.
      const stand=engine.mesh(new T.CircleGeometry(72,80),new T.MeshStandardMaterial({color:0x18242e,roughness:.8,metalness:.08}),engine.studio,0,-20.23,0);
      stand.rotation.x=-Math.PI/2;stand.receiveShadow=true;
      const latest=readState?.();
      if(latest){const dimensions=assemblyDimensions(latest.cfg);engine.deck=dimensions.deck;engine.headOffset=dimensions.headOffset;engine.boreScale=dimensions.boreScale;engine.nativeGeometry=[latest.cfg.engine.boreMm,latest.cfg.engine.strokeMm,latest.cfg.engine.rodMm].join(':');}
      engine.intakeSelection={...latest?.cfg.tuning};engine.intakeGeometry=m54IntakeVariant(engine.intakeSelection).intake;
      await engine.buildAssembly(latest?.state?.valveCurves);
      engine.buildFlowView(latest?.cfg??copyConfig());engine.applyComponentVisibility();
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      engine.component='piston';engine.applyComponentVisibility();
      await engine.renderer.compileAsync(engine.scene,engine.camera);
      engine.component='engine';engine.applyComponentVisibility();
      await engine.renderer.compileAsync(engine.scene,engine.camera);
      engine.presentation='flow';engine.applyComponentVisibility();
      await engine.renderer.compileAsync(engine.scene,engine.camera);
      engine.presentation='cutaway';engine.applyComponentVisibility();
      if(engine.softwareGraphics)await engine.primeEngineBuffers();
      engine.ready=true;host.dataset.assemblyRevision=String(++engine.assemblyRevision);host.dataset.initializationMs=(performance.now()-started).toFixed(1);host.dataset.webgl='ready';return engine;
    }catch(error){engine.dispose();throw error;}
  }
  private async primeEngineBuffers(groups:T.Object3D[]=[this.mechanical,this.extras,this.housing,this.combustion,this.engineFloor,...this.flowGroups.values()]){
    // Compilation alone does not upload geometry or prepare first-use uniforms.
    // Spread that work across small real draws so native commands keep flowing.
    const warm=new T.Scene(),drawables:T.Object3D[]=[];
    this.scene.updateMatrixWorld(true);
    for(const child of this.scene.children)if(child instanceof T.Light)warm.add(child.clone());
    for(const group of groups)group.traverse(object=>{
      if(!(object instanceof T.Mesh||object instanceof T.Line||object instanceof T.Points))return;
      const clone=object.clone(false);clone.visible=true;clone.frustumCulled=false;clone.matrixAutoUpdate=false;clone.matrix.copy(object.matrixWorld);drawables.push(clone);
    });
    const canvas=this.renderer.domElement,previousVisibility=canvas.style.visibility;
    canvas.style.visibility='hidden';let maximum=0,batches=0;
    try{
      // Use the canvas at eight pixels to retain the exact output-colour shader
      // variant. A render target would select a different linear-output program.
      this.renderer.setSize(8,8,false);warm.add(...drawables);
      await this.renderer.compileAsync(warm,this.camera);warm.remove(...drawables);
      for(let start=0;start<drawables.length;start+=8){
        if(this.disposed)return;
        const batch=drawables.slice(start,start+8);warm.add(...batch);
        this.renderer.setSize(8,8,false);
        const before=performance.now();this.renderer.render(warm,this.camera);
        maximum=Math.max(maximum,performance.now()-before);batches++;warm.remove(...batch);
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
    }finally{
      warm.clear();this.renderer.setSize(this.width,this.height,false);canvas.style.visibility=previousVisibility;
      // Resizing clears the drawing buffer. A late cam refresh also uses this
      // path while the studio is idle, so its next frame must be rendered again.
      this.studioDirty=true;
      this.host.dataset.warmupBatches=String(batches);this.host.dataset.warmupMaxBatchMs=maximum.toFixed(1);
    }
  }
  private async buildAssembly(curves?:ValveCurves|null){
    this.buildMechanism();await new Promise<void>(resolve=>setTimeout(resolve,0));if(this.disposed)return;
    this.buildExternal();
    let batch=0;
    for(const spec of engineRoutes(this.headOffset)){
      if(this.disposed)return;
      this.route(spec);
      if(++batch%4===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    this.batchFlowGeometry();this.buildPlumes();this.mergeStaticExtras();this.updateCamProfiles(curves);this.applyComponentVisibility();this.cacheCameraEnvelope();
  }
  private mat(color:number,metalness=.5,roughness=.4){const m=createEngineMaterial(color,metalness,roughness);this.materials.push(m);return m;}
  private mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
  private cylinder(parent:T.Object3D,r:number,h:number,m:T.Material,x=0,y=0,z=0,axis:'x'|'y'|'z'='y',segments=24){const o=this.mesh(new T.CylinderGeometry(r,r,h,segments),m,parent,x,y,z);if(axis==='x')o.rotation.z=Math.PI/2;if(axis==='z')o.rotation.x=Math.PI/2;return o;}
  private torus(parent:T.Object3D,r:number,tube:number,m:T.Material,x=0,y=0,z=0,axis:'x'|'y'|'z'='y'){
    const o=this.mesh(new T.TorusGeometry(r,tube,6,32),m,parent,x,y,z);if(axis==='y')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.y=Math.PI/2;return o;
  }
  private box(parent:T.Object3D,w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0){return this.mesh(new T.BoxGeometry(w,h,d),m,parent,x,y,z);}
  private mergeStaticExtras(){
    // Merge only stationary, direct mesh children. Valve/cam groups and chambers stay dynamic.
    const chambers=new Set<T.Object3D>([...this.parts.flatMap(p=>[p.gas,p.spark,p.throw.children[0]]),...this.parts.flatMap(p=>p.springs.flat())]);
    for(const parent of [this.extras,this.head,...this.parts.flatMap(part=>[...part.valves,...part.cams,part.throw])]){
    const batches=new Map<T.Material,T.Mesh[]>();
    for(const child of parent.children){if(!(child instanceof T.Mesh)||child instanceof T.InstancedMesh||chambers.has(child)||Array.isArray(child.material))continue;const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);}
    for(const [material,meshes] of batches){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();return g.applyMatrix4(m.matrix);});
      const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)continue;
      for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}this.mesh(merged,material,parent);
    }
    }
  }
  private glowMap(){
    if(this.glowTexture)return this.glowTexture;
    const size=32,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2)),alpha=Math.pow(Math.max(0,1-r),2.2),i=(y*size+x)*4;
      data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(alpha*255);
    }
    this.glowTexture=new T.DataTexture(data,size,size);this.glowTexture.needsUpdate=true;return this.glowTexture;
  }
  private buildMechanism(){
    const ringMat=this.mat(0x3b4b54,.9,.3);
    for(const x of CYLINDER_X){
      const instance=createPistonInstance(this.pistonLibrary!.engine),piston=new T.Group();piston.add(instance.root);piston.position.x=x;this.mechanical.add(piston);
      const rod=this.mesh(new T.BoxGeometry(1,1,1),this.rodMetal,this.mechanical);rod.scale.set(13,135,8);
      const smallEnd=this.cylinder(this.mechanical,10,17,this.metal,0,0,0,'x');
      const bigEnd=this.cylinder(this.mechanical,17,24,this.metal,0,0,0,'x');this.cylinder(bigEnd,8,27,ringMat);
      const crank=new T.Group();crank.position.x=x;this.mechanical.add(crank);
      this.cylinder(crank,14,43,this.metal,0,42,0,'x');
      for(const side of [-1,1]){
        this.box(crank,10,51,24,this.metal,side*24,19,0);
        const weight=new T.Mesh(new T.CylinderGeometry(47,47,11,28,1,false,Math.PI*.65,Math.PI*1.25),this.rodMetal);weight.rotation.z=Math.PI/2;weight.position.set(side*24,-7,0);crank.add(weight);
        this.cylinder(crank,20,10,this.metal,side*24,42,0,'x');
      }
      const gas=this.cylinder(this.combustion,37.5*this.boreScale,1,new T.MeshBasicMaterial({color:0x559eff,transparent:true,opacity:.08,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}),x,180,0);
      const flameCount=512,flameBuffer=new T.BufferAttribute(new Float32Array(flameCount*3),3);flameBuffer.setUsage(T.DynamicDrawUsage);
      const flameGeometry=new T.BufferGeometry();flameGeometry.setAttribute('position',flameBuffer);
      flameGeometry.boundingSphere=new T.Sphere(new T.Vector3(x,160,0),160);
      flameGeometry.setAttribute('seed',new T.BufferAttribute(Float32Array.from({length:flameCount},(_,j)=>(j+.5)/flameCount),1));
      const flame=new T.Points(flameGeometry,createFlameMaterial());
      flame.visible=false;this.combustion.add(flame);
      const spark=this.mesh(new T.SphereGeometry(2,10,6),new T.MeshBasicMaterial({color:0xffedc2,transparent:true,opacity:.95,depthWrite:false,blending:T.AdditiveBlending}),this.combustion,x,this.deck-1,0);spark.visible=false;
      const valves:T.Group[]=[],cams:T.Group[]=[],springs:T.Mesh[][]=[];
      for(const z of [-23,23]){
        const pair=new T.Group();pair.position.set(x,0,z);this.head.add(pair);valves.push(pair);
        const springPair:T.Mesh[]=[];
        for(const dx of [-17,17]){
          this.cylinder(pair,2.5,61,this.metal,dx,234,0);this.cylinder(pair,12,3,this.metal,dx,205,0);
          this.cylinder(pair,8,6,ringMat,dx,252,0);this.cylinder(pair,7,6,this.metal,dx,264,0);
          const springPoints=Array.from({length:65},(_,i)=>new T.Vector3(Math.sin(i/64*TAU*5)*6,(i/64-.5)*34,Math.cos(i/64*TAU*5)*6));
          // The lower seat stays on the head; only the upper retainer follows the valve.
          const spring=this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints),64,.65,4,false),this.rodMetal,this.head,x+dx,232,z);
          springPair.push(spring);
          this.cylinder(this.head,8,2,ringMat,x+dx,214,z);
        }
        springs.push(springPair);
        const cam=new T.Group();cam.position.set(x,279,z);this.head.add(cam);cams.push(cam);
        for(const dx of [-17,17])this.cylinder(cam,10,14,this.metal,dx,0,0,'x');
      }
      this.parts.push({piston,wristPin:instance.wristPin,crown:instance.crown,rod,smallEnd,bigEnd,throw:crank,valves,springs,cams,gas,flame,flameBuffer,spark});
    }
    for(let i=0;i<7;i++){
      const x=-300+i*100;this.cylinder(this.mechanical,14,45,this.metal,x,0,0,'x');
      // Split bearing saddles attach to the crankcase rails; the front cutaway
      // leaves a shaft-centred semicircle instead of the old floating lock shape.
      const saddle=this.mesh(new T.CylinderGeometry(23,23,12,20,1,true,Math.PI*.5,Math.PI),this.staticMaterial,this.extras,x,0,0);saddle.rotation.z=Math.PI/2;
      for(const z of [-24,24]){this.box(this.extras,14,9,10,this.dark,x,-20,z);this.cylinder(this.extras,2.5,12,this.metal,x,-22,z,'y',6);}
    }
    // The flywheel is an external attachment, visible on the closed bare engine.
    this.flywheel=createWorkshopFlywheel(this.mat.bind(this));this.flywheel.position.x=325;this.extras.add(this.flywheel);
  }
  private buildExternal(){
    this.head.position.y=this.headOffset;
    this.workshop=buildWorkshopAssembly({extras:this.extras,housing:this.housing,head:this.head,deck:this.deck,headOffset:this.headOffset,boreScale:this.boreScale,mat:this.mat.bind(this),confirmedSelection:this.intakeSelection});
    animateWorkshopAssembly(this.workshop,0,0,0);
    for(const medium of MEDIA){const group=new T.Group();group.name=medium.id;this.flowGroups.set(medium.id,group);this.scene.add(group);}
    this.host.dataset.assembly='m54-workshop-cutaway';this.host.dataset.assemblyParts=String(this.workshop.partNames.length);this.host.dataset.timingDrive='linked-primary-and-secondary';this.host.dataset.accessoryDrive='m54-dual-belt-r4';
  }
  private async rebuildAssembly(cfg:Config,curves?:ValveCurves|null){
    this.ready=false;
    this.disposeFlowView();
    const phases=new Map(this.routes.map((route,index)=>[`${index}:${route.medium}:${route.cylinder??0}:${route.branch}`,route.phase]));
    // Asset resources are shared by the six instances and the source library.
    // Detach the instances while disposing generated engine geometry.
    for(const part of this.parts)part.piston.removeFromParent();
    const keep=new Set<T.Material>([this.metal,this.rodMetal,this.dark,this.staticMaterial]);
    // Reflection targets belong to the lighting environment and are shared by
    // the retained base materials and newly generated assembly materials.
    const borrowedTextures=new Set<T.Texture>();
    for(const material of keep)for(const value of Object.values(material))if(value instanceof T.Texture)borrowedTextures.add(value);
    if(this.environment)borrowedTextures.add(this.environment);
    for(const group of [this.extras,this.housing,this.mechanical,this.combustion,...this.flowGroups.values()]){
      disposeSceneResources(group,keep,borrowedTextures);group.clear();
    }
    for(const group of this.flowGroups.values())group.removeFromParent();
    this.materials=[...keep];this.routes=[];this.parts=[];this.flowGroups.clear();this.flowBatches.clear();this.routeMaterials.clear();this.workshop=null;this.exhaustPlumes=null;this.glowTexture=null;
    const dimensions=assemblyDimensions(cfg);this.deck=dimensions.deck;this.headOffset=dimensions.headOffset;this.boreScale=dimensions.boreScale;
    this.intakeSelection={...cfg.tuning};
    this.head.clear();this.extras.add(this.head);this.camCurves=null;
    await this.buildAssembly(curves);this.buildFlowView(cfg);this.applyComponentVisibility();
    for(const [index,route] of this.routes.entries())route.phase=phases.get(`${index}:${route.medium}:${route.cylinder??0}:${route.branch}`)??route.phase;
    await this.renderer.compileAsync(this.scene,this.camera);
    if(this.softwareGraphics)await this.primeEngineBuffers();
    this.ready=!this.disposed;
    if(this.ready){this.nativeGeometry=[cfg.engine.boreMm,cfg.engine.strokeMm,cfg.engine.rodMm].join(':');this.intakeGeometry=m54IntakeVariant(this.intakeSelection).intake;this.host.dataset.assemblyRevision=String(++this.assemblyRevision);}
  }
  private updateCamProfiles(curves:ValveCurves|null|undefined){
    if(this.camCurves===curves)return;this.camCurves=curves;
    for(let i=0;i<this.parts.length;i++)for(let v=0;v<2;v++){
      const cam=this.parts[i].cams[v];
      const old=cam.children.filter(child=>child.name==='lift-profile') as T.Mesh[];
      new Set(old.map(mesh=>mesh.geometry)).forEach(geometry=>geometry.dispose());old.forEach(mesh=>mesh.removeFromParent());
      const shape=new T.Shape();
      for(let k=0;k<=144;k++){
        const phi=k/144*TAU,r=camProfileRadius(curves,i+1,v as 0|1,phi),y=r*Math.cos(phi),z=r*Math.sin(phi);
        if(k===0)shape.moveTo(y,z);else shape.lineTo(y,z);
      }
      const geometry=new T.ExtrudeGeometry(shape,{depth:12,bevelEnabled:false,steps:1});
      geometry.applyMatrix4(new T.Matrix4().set(0,0,1,-6,1,0,0,0,0,1,0,0,0,0,0,1));
      const halves=[-17,17].map(dx=>geometry.clone().translate(dx,0,0)),pair=mergeGeometries(halves)!;
      halves.forEach(g=>g.dispose());geometry.dispose();const mesh=this.mesh(pair,this.rodMetal,cam);mesh.name='lift-profile';
    }
  }
  private buildFlowView(cfg:Config){
    this.flowView=createEngineFlowView(cfg);this.scene.add(this.flowView.root);
    // One borrowed spray draw also replaces the old fuel dots in the cutaway.
    // The flow layer owns its geometry/material; detach this mesh before disposal.
    this.portSpray=new T.Mesh(this.flowView.spray.geometry,this.flowView.spray.material);
    this.portSpray.name='Saugrohreinspritzung im Motorschnitt';this.portSpray.renderOrder=4;
    this.scene.add(this.portSpray);
  }
  private disposeFlowView(){
    this.portSpray?.removeFromParent();this.portSpray=null;
    this.flowView?.dispose();this.flowView=null;
  }
  private async refreshCamProfiles(curves:ValveCurves){
    this.ready=false;
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    if(this.disposed)return;
    this.updateCamProfiles(curves);
    // The replacement cams use the already compiled material and vertex layout.
    // Recompiling/drawing the complete scene here used to stall the native
    // heartbeat just when the user started the engine after fitting a camshaft.
    this.studioDirty=true;
    this.ready=!this.disposed;
  }
  private route(spec:RouteSpec){
    const {medium,coords,radius,cylinder,branch='main',internal=false}=spec;
    const flowIndex=this.routes.length,flowFactor=spec.flowFactor??1;
    const color=MEDIA.find(m=>m.id===medium)!.color,group=this.flowGroups.get(medium)!;
    const curve=new T.CatmullRomCurve3(coords.map(p=>new T.Vector3(...p)),false,'centripetal');
    let mat=this.routeMaterials.get(`${medium}-pipe`) as T.MeshStandardMaterial|undefined;
    if(!mat){
      const physical:Record<Medium,number>={air:0x415860,fuel:0xaa9467,exhaust:0xa6afb1,water:0x263d45,oil:0xa38e54};
      mat=new T.MeshStandardMaterial({color:physical[medium],metalness:medium==='exhaust'?.42:.18,roughness:medium==='air'||medium==='water'?.65:.4,transparent:true,opacity:medium==='air'?.64:medium==='exhaust'?.52:.78,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
      this.routeMaterials.set(`${medium}-pipe`,mat);this.materials.push(mat);
    }
    const tube=new T.TubeGeometry(curve,64,radius,12,false),pipe=this.mesh(tube,mat,group);pipe.visible=!internal;
    let volumeMat=this.routeMaterials.get(`${medium}-volume`) as T.ShaderMaterial|undefined;
    if(!volumeMat){volumeMat=createFlowMaterial(medium,color);this.routeMaterials.set(`${medium}-volume`,volumeMat);this.materials.push(volumeMat);}
    const length=curve.getLength();
    const volume=this.mesh(attachFlowAttributes(new T.TubeGeometry(curve,64,Math.max(1,radius*.82),10,false),flowIndex,length),volumeMat,group);
    const count=Math.max(6,Math.min(35,Math.round(curve.getLength()/24))),buffer=new T.BufferAttribute(new Float32Array(count*3),3);buffer.setUsage(T.DynamicDrawUsage);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',buffer);geometry.boundingSphere=new T.Sphere(new T.Vector3(),1500);
    let pointMat=this.routeMaterials.get(`${medium}-points`) as T.PointsMaterial|undefined;
    if(!pointMat){pointMat=new T.PointsMaterial({color,map:this.glowMap(),size:medium==='air'?12:medium==='exhaust'?11:medium==='fuel'?6:8,transparent:true,opacity:.8,depthWrite:false,sizeAttenuation:true,blending:T.AdditiveBlending});this.routeMaterials.set(`${medium}-points`,pointMat);this.materials.push(pointMat);}
    const points=new T.Points(geometry,pointMat);group.add(points);this.routes.push({medium,cylinder,branch,internal,flowFactor,flowIndex,length,pipe,volume,points,buffer,table:curve.getSpacedPoints(200),phase:0,rate:0});
  }
  private batchFlowGeometry(){
    // Three draws per medium: physical shells, dense animated stream bands and
    // one light particle buffer. Per-connector signed native rates stay separate.
    for(const [medium,group] of this.flowGroups){
      const routes=this.routes.filter(route=>route.medium===medium),pipes=routes.filter(r=>!r.internal).map(r=>r.pipe.geometry),volumes=routes.map(r=>r.volume.geometry);
      const pipeGeometry=pipes.length?mergeGeometries(pipes):null;
      const pipe=pipeGeometry?this.mesh(pipeGeometry,routes.find(r=>!r.internal)!.pipe.material as T.Material,group):null;
      const volume=this.mesh(mergeGeometries(volumes)!,routes[0].volume.material as T.Material,group);
      const count=routes.reduce((sum,r)=>sum+r.buffer.count,0),array=new Float32Array(count*3);array.fill(1e6);
      const buffer=new T.BufferAttribute(array,3);buffer.setUsage(T.DynamicDrawUsage);
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',buffer);geometry.boundingSphere=new T.Sphere(new T.Vector3(120,100,0),1600);
      const points=new T.Points(geometry,routes[0].points.material);group.add(points);let offset=0;
      for(const r of routes){
        const size=r.buffer.count*3;r.buffer=new T.BufferAttribute(array.subarray(offset,offset+size),3);offset+=size;
        r.pipe.removeFromParent();r.volume.removeFromParent();r.points.removeFromParent();r.pipe.geometry.dispose();r.volume.geometry.dispose();r.points.geometry.dispose();
      }
      this.flowBatches.set(medium,{pipe,volume,points,buffer});
    }
  }
  private buildPlumes(){
    const tails=this.routes.filter(route=>route.medium==='exhaust'&&route.branch.startsWith('tail-'));
    if(tails.length!==2)return;
    const outlets=tails.map(route=>route.table[200].clone()),directions=tails.map(route=>route.table[200].clone().sub(route.table[198]).normalize());
    this.exhaustPlumes=createExhaustPlumes(outlets,directions);this.flowGroups.get('exhaust')!.add(this.exhaustPlumes.points);
  }
  setPresentation(presentation:EnginePresentation){
    if(!['closed','cutaway','flow'].includes(presentation))throw new Error('Unbekannte Motoransicht.');
    this.presentation=presentation;this.applyComponentVisibility();
    this.renderer.domElement.setAttribute('aria-label',presentation==='closed'?'Drehbare geschlossene 3D-Motorbaugruppe':presentation==='flow'?'Freigestellter Gaswechsel mit Ansaugluft, schematischer Benzineinspritzung, Verbrennung und Abgas':'Drehbarer 3D-Motorschnitt mit Mechanik und nativen Strömungen');
    this.host.dataset.presentation=presentation;
  }
  setMode(medium:Medium,mode:PipeMode){this.mode[medium]=mode;this.updateVisibility();}
  setExtras(visible:boolean){this.extrasEnabled=visible;this.applyComponentVisibility();}
  setHousing(visible:boolean){this.housingEnabled=visible;this.applyComponentVisibility();}
  private applyComponentVisibility(){
    const engine=this.component==='engine',view=presentationVisibility(this.presentation);
    if(this.softwareGraphics){const ratio=Math.min(devicePixelRatio||1,engine?.4:.55);if(ratio!==this.pixelRatio){this.pixelRatio=ratio;this.renderer.setPixelRatio(ratio);this.renderer.setSize(this.width,this.height,false);}}
    this.mechanical.visible=engine&&view.mechanical;this.extras.visible=engine&&this.extrasEnabled&&view.extras;this.housing.visible=engine&&this.housingEnabled&&view.housing;this.engineFloor.visible=engine&&view.floor;
    this.combustion.visible=engine&&view.combustion;this.head.visible=view.mechanical;
    const closedHousing=this.workshop?.closedHousing;
    for(const child of this.housing.children)child.visible=child===closedHousing?view.closedHousing:view.cutHousing;
    this.workshop?.timingDrive.root.traverse(part=>{if(part.userData.cutawayOnly)part.visible=engine&&view.cutHousing;});
    this.updateDriveInspection();
    for(const group of this.flowGroups.values())group.visible=engine;
    const dedicatedFlow=engine&&this.presentation==='flow';
    this.flowView?.setVisible(dedicatedFlow);
    const workshopRoom=this.scene.getObjectByName('workshop-test-cell');
    if(workshopRoom)workshopRoom.visible=!dedicatedFlow;
    if(this.portSpray)this.portSpray.visible=engine&&this.presentation==='cutaway'&&this.mode.fuel!=='off';
    if(dedicatedFlow){
      this.mechanical.visible=false;this.extras.visible=false;this.housing.visible=false;
      this.combustion.visible=false;this.engineFloor.visible=false;
      for(const group of this.flowGroups.values())group.visible=false;
    }
    this.renderer.setClearColor(dedicatedFlow?FLOW_VIEW_BACKGROUND:0x17252f);
    this.studio.visible=!engine;this.keyLight.castShadow=!engine;
    this.scene.environment=engine?null:this.environment;
    this.studioDirty=true;
    if(!engine)this.renderer.shadowMap.needsUpdate=true;
    this.controls.minDistance=engine?400:70;this.camera.near=engine?2:.5;this.camera.updateProjectionMatrix();
    this.host.dataset.component=this.component;
    this.host.dataset.presentation=this.presentation;
    this.updateVisibility();
  }
  setComponent(component:'engine'|'piston'){
    if(this.component===component){this.applyComponentVisibility();return;}
    this.component=component;this.applyComponentVisibility();this.view('overview');
    this.renderer.domElement.setAttribute('aria-label',component==='piston'?'Drehbare Kolbenbaugruppe mit Ringpaket und Bolzen':'Drehbarer 3D-Reihensechser mit Kolben, Pleueln und Kurbelwelle');
  }
  setExploded(amount:number){
    this.exploded=Number.isFinite(amount)?T.MathUtils.clamp(amount,0,1):0;
    this.studioDirty=true;
    if(this.studioPiston)explodePiston(this.studioPiston,this.exploded);
    if(this.component==='piston')this.renderer.shadowMap.needsUpdate=true;
    this.host.dataset.exploded=String(this.exploded);
    if(this.component==='piston')this.view(this.cameraPreset);
  }
  private updateVisibility(){
    const view=presentationVisibility(this.presentation);
    if(this.workshop)setCoolingPlumbingPresentation(this.workshop.coolingPlumbing,this.presentation,this.mode.water);
    if(this.portSpray)this.portSpray.visible=this.component==='engine'&&this.presentation==='cutaway'&&this.mode.fuel!=='off';
    for(const r of this.routes){const v=pipeVisibility(this.mode[r.medium]);r.pipe.visible=v.pipe&&!r.internal&&view.pipes;r.volume.visible=v.flow&&view.media&&Math.abs(r.rate)>1e-6;r.points.visible=r.volume.visible;}
    for(const [medium,batch] of this.flowBatches){
      const v=pipeVisibility(this.mode[medium]);if(batch.pipe)batch.pipe.visible=v.pipe&&view.pipes;batch.volume.visible=v.flow&&view.media&&medium!=='fuel'&&this.routes.some(r=>r.medium===medium&&Math.abs(r.rate)>1e-6);batch.points.visible=batch.volume.visible;
      if(batch.pipe){const material=batch.pipe.material as T.MeshStandardMaterial,closed=this.presentation==='closed';material.transparent=!closed;material.opacity=closed?1:medium==='air'?.44:medium==='exhaust'?.4:.5;material.depthWrite=closed;material.needsUpdate=true;}
    }
    this.host.dataset.pipeModes=JSON.stringify(this.mode);
  }
  private cacheCameraEnvelope(){
    this.scene.updateMatrixWorld(true);this.cameraPoints=[];
    // Fitting the corners of one giant box wastes most of a portrait canvas:
    // the long exhaust and the tall head do not occupy those imaginary corners.
    // Sample the actual assembled surfaces once, then fit their projections.
    for(const group of [this.extras,this.housing,this.mechanical,...this.flowGroups.values()])group.traverse(object=>{
      if(!(object instanceof T.Mesh)||object instanceof T.InstancedMesh||!object.visible)return;
      const vertices=object.geometry.getAttribute('position'),stride=Math.max(1,Math.floor(vertices.count/300));
      for(let i=0;i<vertices.count;i+=stride)this.cameraPoints.push(new T.Vector3(vertices.getX(i),vertices.getY(i),vertices.getZ(i)).applyMatrix4(object.matrixWorld));
    });
    if(this.exhaustPlumes)for(let i=0;i<this.exhaustPlumes.outlets.length;i++)this.cameraPoints.push(this.exhaustPlumes.outlets[i].clone().addScaledVector(this.exhaustPlumes.directions[i],210).add(new T.Vector3(0,35,0)));
  }
  private updateDriveInspection(){
    const inspection=this.component==='engine'&&this.cameraPreset==='front';
    this.workshop?.radiator.traverse(part=>{if(part instanceof T.Mesh){
      for(const material of Array.isArray(part.material)?part.material:[part.material]){
        if(material.transparent!==inspection){material.transparent=inspection;material.needsUpdate=true;}
        material.opacity=inspection?.1:1;material.depthWrite=!inspection;
      }
    }});
    this.host.dataset.radiatorInspection=inspection?'transparent':'solid';
    const caption=this.host.parentElement?.querySelector<HTMLElement>('.three-stage-caption');
    if(caption)caption.textContent=(inspection?'Kühler zur Einsicht transparent · ':'')+(this.presentation!=='closed'?'Sprühbild schematisch; Einspritzzeitpunkte angenähert · ':'')+'Ziehen: drehen · Rad / Pinch: zoomen';
    this.renderer.shadowMap.needsUpdate=true;
  }
  resetCamera(){this.view(this.presentation==='cutaway'?'section':'overview');}
  view(name:string){
    if(this.component==='piston'&&this.studioPiston){
      const presets:Record<string,number[]>={overview:[1,.65,1.15],crown:[.001,1,.001],underside:[.5,-1,.65],pin:[1,.05,.001],side:[.001,.08,1]};
      this.cameraPreset=presets[name]?name:'overview';
      this.studioPiston.root.updateWorldMatrix(true,true);
      const box=new T.Box3().setFromObject(this.studioPiston.root);box.getCenter(this.controls.target);
      const direction=new T.Vector3(...presets[this.cameraPreset]).normalize();
      const right=new T.Vector3().crossVectors(Y,direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
      const tan=Math.tan(T.MathUtils.degToRad(this.camera.fov/2));let distance=0;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const corner=new T.Vector3(x,y,z).sub(this.controls.target),depth=corner.dot(direction);
        distance=Math.max(distance,depth+Math.abs(corner.dot(right))/(tan*this.camera.aspect),depth+Math.abs(corner.dot(up))/tan);
      }
      this.camera.position.copy(this.controls.target).addScaledVector(direction,distance*1.18);this.controls.maxDistance=1000;this.camera.far=2500;this.camera.updateProjectionMatrix();this.controls.update();this.host.dataset.cameraPreset=this.cameraPreset;return;
    }
    const narrow=this.width<600;
    const presets:Record<string,number[]>={overview:narrow?[-1,.58,.27]:[.72,.48,1],section:narrow?[-.6,.3,1]:[.16,.25,1],intake:[.28,.37,-1],exhaust:narrow?[-.75,.7,1]:[.18,.48,1],front:[-1,.3,.68],top:[.001,1,.001]};
    this.cameraPreset=presets[name]?name:'overview';
    this.updateDriveInspection();
    const detailed=this.cameraPreset==='intake'||this.cameraPreset==='front';
    this.controls.target.set(this.cameraPreset==='front'?-355:detailed?-65:90,this.cameraPreset==='front'?115:105+this.headOffset/2,this.cameraPreset==='front'?-15:22);
    if(this.cameraPreset==='section')this.controls.target.set(-8,111+this.headOffset/2,8);
    // Project the full assembly bounds onto this preset's horizontal/vertical axes.
    const direction=new T.Vector3(...presets[this.cameraPreset]).normalize();
    const right=new T.Vector3().crossVectors(Y,direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
    const tan=Math.tan(T.MathUtils.degToRad(this.camera.fov/2));let distance=0;
    const bounds=this.cameraPreset==='section'?{min:[-350,-146,-80],max:[350,342+this.headOffset,85]}:assemblyConnectors(this.headOffset).bounds,fallback:T.Vector3[]=[];
    if(!this.cameraPoints.length)for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])fallback.push(new T.Vector3(x,y,z));
    for(const point of this.cameraPoints.length?this.cameraPoints:fallback){
      if(this.cameraPreset==='section'&&(point.x< -355||point.x>350||Math.abs(point.z)>90))continue;
      if(this.cameraPreset==='front'&&(point.x< -445||point.x> -275))continue;
      if(detailed&&point.x>365)continue;
      const corner=point.clone().sub(this.controls.target),depth=corner.dot(direction);
      distance=Math.max(distance,depth+Math.abs(corner.dot(right))/(tan*this.camera.aspect),depth+Math.abs(corner.dot(up))/tan);
    }
    distance*=1.075;this.controls.maxDistance=Math.max(2600,distance*1.6);
    this.camera.far=Math.max(4000,distance*3);this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.controls.target).addScaledVector(direction,distance);this.controls.update();this.host.dataset.cameraPreset=this.cameraPreset;
  }
  private keydown=(event:KeyboardEvent)=>{
    if(!['ArrowLeft','ArrowRight','+','-','=','Home'].includes(event.key))return;
    this.host.dataset.cameraKey=event.key;this.host.dataset.cameraKeyCount=String(Number(this.host.dataset.cameraKeyCount||0)+1);
    event.preventDefault();event.stopPropagation();if(event.key==='Home'){this.resetCamera();return;}
    V.copy(this.camera.position).sub(this.controls.target);
    if(event.key==='+'||event.key==='=')V.multiplyScalar(.9);else if(event.key==='-')V.multiplyScalar(1.1);
    else V.applyAxisAngle(Y,(event.key==='ArrowLeft'?1:-1)*.1);
    V.setLength(Math.max(this.controls.minDistance,Math.min(this.controls.maxDistance,V.length())));this.camera.position.copy(this.controls.target).add(V);this.controls.update();
  };
  render(state:ViewState|null,cfg:Config,angle:number,clock:number,driveAngle=angle){
    if(this.disposed||this.contextLost||!this.ready)return;
    const started=performance.now(),frameInterval=this.softwareGraphics&&this.component==='engine'?66:32;if(started-this.lastRender<frameInterval)return;this.lastRender=started;
    const dt=Math.max(0,Math.min(this.softwareGraphics?.1:.05,clock-this.clock));this.clock=clock;this.lastAngle=angle;this.lastDriveAngle=driveAngle;
    // Keep the displayed assembly synchronized when a native preset changes dimensions.
    const geometry=[cfg.engine.boreMm,cfg.engine.strokeMm,cfg.engine.rodMm].join(':');
    const intakeGeometry=m54IntakeVariant(cfg.tuning).intake;
    if(this.nativeGeometry!==geometry||this.intakeGeometry!==intakeGeometry){void this.rebuildAssembly(cfg,state?.valveCurves).catch(()=>{this.contextLost=true;this.host.dataset.webgl='lost';});return;}
    this.intakeSelection={...cfg.tuning};
    if(this.workshop)this.workshop.intakeVariant=m54IntakeVariant(this.intakeSelection);
    this.host.dataset.geometry=geometry;
    if(this.softwareGraphics&&this.component==='engine'){
      // A stationary inspection can afford a sharper frame. Drop the moving
      // software-rendered engine back to its smaller real-time drawing buffer.
      const ratio=(state?.rpm??0)>5?.4:.85;
      if(this.pixelRatio!==ratio){this.pixelRatio=ratio;this.renderer.setPixelRatio(ratio);this.renderer.setSize(this.width,this.height,false);this.studioDirty=true;}
    }
    if(state?.valveCurves&&this.camCurves!==state.valveCurves){void this.refreshCamProfiles(state.valveCurves).catch(()=>{this.contextLost=true;this.host.dataset.webgl='lost';});return;}
    const pointScale=this.height*this.pixelRatio/(2*Math.tan(T.MathUtils.degToRad(this.camera.fov/2)));
    for(let i=0;i<6;i++){
      const p=this.parts[i],pose=mechanismPose(angle,i+1,cfg,state);P.fromArray(pose.piston);Q.fromArray(pose.pin);
      p.piston.position.copy(P);p.piston.scale.x=p.piston.scale.z=cfg.engine.boreMm/84;
      p.rod.position.copy(P).add(Q).multiplyScalar(.5);V.copy(P).sub(Q);p.rod.scale.y=V.length();p.rod.quaternion.setFromUnitVectors(Y,V.normalize());p.smallEnd.position.copy(P);p.bigEnd.position.copy(Q);
      p.throw.rotation.x=pose.rotation;p.throw.scale.y=p.throw.scale.z=cfg.engine.strokeMm/84;
      const lifts=valveSample(state,angle,i+1),fire=combustionAppearance(state,angle,i+1);
      p.flame.userData.nativeCombustion=fire;
      for(let v=0;v<2;v++){
        const lift=v===0?lifts?.intakeLiftMm??0:lifts?.exhaustLiftMm??0;p.valves[v].position.y=-lift;
        const spring=valveSpringPose(lift);
        for(const mesh of p.springs[v]){mesh.position.y=spring.center;mesh.scale.y=spring.length/34;}
        p.cams[v].rotation.x=angle/2;
      }
      const top=P.y+PISTON_SPEC.compressionHeightMm,h=Math.max(1,this.deck-top);p.gas.position.set(CYLINDER_X[i],top+h/2,0);p.gas.scale.y=h;
      const gasMat=p.gas.material as T.MeshBasicMaterial;
      gasMat.color.setHex(fire.burning?0xffa131:fire.exhaust>0?0xd17f54:fire.heat>.15?0xf08b38:fire.intake>0?0x247bff:0xa1c9ed);
      p.gas.visible=this.combustion.visible&&this.extrasEnabled&&(this.mode.air!=='off'||this.mode.exhaust!=='off')&&fire.available;
      gasMat.opacity=fire.burning?.17+fire.pressure*.24:fire.exhaust>0?.12+fire.heat*.12:fire.heat>.15?.10+fire.heat*.13:fire.intake>0?.12:.035;
      p.flame.visible=this.combustion.visible&&this.extrasEnabled&&fire.burning;p.spark.visible=p.flame.visible&&fire.progress<.16;
      p.spark.scale.setScalar(1+Math.max(0,.16-fire.progress)*12);p.spark.position.y=this.deck-1;
      if(p.flame.visible){
        for(let j=0;j<p.flameBuffer.count;j++){
          const front=flameFrontPoint(j,p.flameBuffer.count,fire.progress,37.5*this.boreScale,h);
          p.flameBuffer.setXYZ(j,CYLINDER_X[i]+front.x,Math.max(top+1,this.deck+front.y),front.z);
        }
        p.flameBuffer.needsUpdate=true;
        const uniforms=(p.flame.material as T.ShaderMaterial).uniforms;
        uniforms.uProgress.value=fire.progress;uniforms.uHeat.value=fire.heat;uniforms.uPressure.value=fire.pressure;uniforms.uPointScale.value=pointScale;
      }
    }
    this.flywheel.rotation.x=angle;
    const lightFlywheel=cfg.tuning?.flywheel==='light';
    for(const part of this.flywheel.children)if(part.name==='Schwungmasse')part.scale.x=lightFlywheel?.66:1;
    this.host.dataset.flywheel=lightFlywheel?'light':'standard';
    if(this.workshop)animateWorkshopAssembly(this.workshop,driveAngle,state?.actualThrottle??state?.pedal??0,state?.rpm??0);
    const view=presentationVisibility(this.presentation);
    for(const r of this.routes){
      r.rate=(r.medium==='air'?intakeRouteRate(r,state,cfg,angle,flowActivity):flowActivity(r.medium,r.cylinder,r.branch,state,cfg,angle))*r.flowFactor;const active=Math.abs(r.rate)>1e-6,v=pipeVisibility(this.mode[r.medium]);r.points.visible=v.flow&&active&&view.media;
      r.volume.visible=v.flow&&active&&view.media;
      const uniforms=(this.flowBatches.get(r.medium)!.volume.material as T.ShaderMaterial).uniforms;
      const live=v.flow&&active&&view.media;
      uniforms.uFlow.value[r.flowIndex].set(live?r.rate:0,r.phase);
      if(!live){for(let j=0;j<r.buffer.count;j++)r.buffer.setXYZ(j,1e6,1e6,1e6);continue;}
      const speed=(r.medium==='water'?Math.min(150,Math.abs(r.rate)*3):r.medium==='oil'?45:150)/Math.max(20,r.length);
      r.phase=mod(r.phase+dt*speed*Math.sign(r.rate),1);
      uniforms.uFlow.value[r.flowIndex].y=r.phase;
      for(let j=0;j<r.buffer.count;j++){const pos=mod(j/r.buffer.count+r.phase,1)*200,k=Math.floor(pos),f=pos-k,a=r.table[k],b=r.table[Math.min(200,k+1)];r.buffer.setXYZ(j,a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,a.z+(b.z-a.z)*f);}
      r.buffer.needsUpdate=true;
    }
    for(const [medium,batch] of this.flowBatches){
      const flowing=view.media&&pipeVisibility(this.mode[medium]).flow&&this.routes.some(r=>r.medium===medium&&Math.abs(r.rate)>1e-6);
      batch.points.visible=flowing&&medium!=='fuel';batch.volume.visible=flowing&&medium!=='fuel';batch.buffer.needsUpdate=true;
    }
    if(this.exhaustPlumes){
      const tails=this.routes.filter(route=>route.medium==='exhaust'&&route.branch.startsWith('tail-'));
      const running=this.component==='engine'&&(state?.rpm??0)>5&&this.mode.exhaust!=='off';
      for(let i=0;i<2;i++){
        const target=running?Math.max(0,tails[i]?.rate??0):0,old=this.exhaustPlumes.flow.getComponent(i);
        this.exhaustPlumes.flow.setComponent(i,running?target+(old-target)*Math.exp(-dt/.16):0);
      }
      this.exhaustPlumes.material.uniforms.uTime.value+=dt;
      this.exhaustPlumes.material.uniforms.uPointScale.value=pointScale;
      this.exhaustPlumes.points.visible=running&&(this.exhaustPlumes.flow.x>1e-5||this.exhaustPlumes.flow.y>1e-5);
    }
    if(this.component==='engine'&&this.presentation!=='closed')this.flowView?.update(state,cfg,angle,clock,driveAngle,this.mode);
    // Every opaque component shares depth. Transparent shells retain normal occlusion.
    this.controls.update();
    const signature=`${angle}|${state?.ignition}|${state?.actualThrottle}|${lightFlywheel}`;
    const draw=this.studioDirty||(this.component==='engine'&&signature!==this.lastDrawSignature);
    if(draw){this.studioDirty=false;this.lastDrawSignature=signature;this.renderer.render(this.scene,this.camera);}
    this.frameSerial++;
    if(draw){this.renderCost+=performance.now()-started;this.renderSamples++;}
    if(this.renderSamples>=8){
      const mean=this.renderCost/this.renderSamples;this.host.dataset.renderMeanMs=mean.toFixed(2);this.host.dataset.pixelRatio=String(this.pixelRatio);this.host.dataset.frameLimit=String(Math.round(1000/frameInterval));
      const minimum=this.softwareGraphics?.4:.7;
      const next=this.softwareGraphics?this.pixelRatio:mean>45?Math.max(minimum,this.pixelRatio*.8):mean<15?Math.min(devicePixelRatio||1,1.25,this.pixelRatio*1.1):this.pixelRatio;
      if(next!==this.pixelRatio){this.pixelRatio=next;this.renderer.setPixelRatio(next);this.renderer.setSize(this.width,this.height,false);this.studioDirty=true;}
      this.renderSamples=0;this.renderCost=0;
    }
    if(++this.frameCount%15===0){
      this.host.dataset.crankAngle=String(mod(angle,TAU*2));this.host.dataset.camAngle=String(mod(angle/2,TAU));this.host.dataset.drawCalls=String(this.renderer.info.render.calls);this.host.dataset.flowingRoutes=String(this.routes.filter(r=>r.points.visible).length);
      this.host.dataset.frameSerial=String(this.frameSerial);
      this.host.dataset.visiblePipes=String(this.routes.filter(r=>r.pipe.visible).length);this.host.dataset.visibleStreams=String(this.routes.filter(r=>r.volume.visible).length);
      this.host.dataset.visiblePistons=String(this.mechanical.visible?this.parts.filter(p=>p.piston.visible).length:0);this.host.dataset.visibleRods=String(this.mechanical.visible?this.parts.filter(p=>p.rod.visible).length:0);this.host.dataset.visibleCrankThrows=String(this.mechanical.visible?this.parts.filter(p=>p.throw.visible).length:0);this.host.dataset.valveCount='24';
    }
  }
  diagnostics(){
    this.scene.updateMatrixWorld(true);
    const world=(object:T.Object3D,point=new T.Vector3())=>object.localToWorld(point).toArray();
    return {
      frame:this.frameSerial,angle:this.lastAngle,occlusion:this.host.dataset.occlusion,component:this.component,presentation:this.presentation,
      asset:{id:this.pistonLibrary?.assetId,heroTriangles:this.pistonLibrary?.triangles,engineTriangles:this.pistonLibrary?.engineTriangles},
      inspection:this.studioPiston?{exploded:this.exploded,pieces:this.studioPiston.pieces.map(piece=>({name:piece.name,position:world(piece.object)}))}:null,
      visibility:{mechanical:this.mechanical.visible,extras:this.extras.visible,housing:this.housing.visible,combustion:this.combustion.visible,closedHousing:this.workshop?.closedHousing.visible??false,engineFloor:this.engineFloor.visible,studio:this.studio.visible,flowGroups:[...this.flowGroups.values()].map(group=>group.visible),dedicatedFlow:this.flowView?.root.visible??false,portSpray:this.portSpray?.visible??false},
      gasFlow:this.flowView?.diagnostics()??null,
      camera:{position:this.camera.position.toArray(),target:this.controls.target.toArray(),preset:this.cameraPreset},
      resources:{...this.renderer.info.memory},drawCalls:this.renderer.info.render.calls,
      assembly:{id:this.host.dataset.assembly,revision:this.assemblyRevision,intakeVariant:this.workshop?.intakeVariant??null,parts:this.workshop?.partNames??[],connectors:assemblyConnectors(this.headOffset),
        timing:this.workshop?{angle:this.lastDriveAngle,chains:this.workshop.chain.map(c=>{const matrix=new T.Matrix4();c.links.getMatrixAt(0,matrix);return {links:c.links.count,length:c.length,phase:mod(this.lastDriveAngle*c.pitchRadius/c.length,1),firstMatrix:matrix.toArray()};}),sprockets:this.workshop.sprockets.map(s=>({name:s.part.name,position:world(s.part),rotation:s.part.rotation.x,ratio:s.ratio}))}:null,
        accessoryDrive:this.workshop?{planes:this.workshop.accessoryDrive.planes,wheels:this.workshop.accessoryDrive.wheels.map(w=>({id:w.id,position:world(w.part),radius:w.radius,ratio:w.ratio,rotation:w.part.rotation.x})),belts:this.workshop.accessoryDrive.belts.map(b=>({id:b.id,ribs:b.ribs,length:b.path.length,phase:mod(this.lastDriveAngle*b.driverRadius/b.path.length,1)}))}:null,
        throttle:this.workshop?.throttle.rotation.y,fan:this.workshop?.fan.rotation.x,pump:this.workshop?.pulley.rotation.x,flywheel:this.host.dataset.flywheel,
        flywheelGeometry:this.flywheel.children.filter(p=>p.name==='Schwungmasse').map(p=>({scale:p.scale.x,axialMm:((p as T.Mesh).geometry.boundingBox??((p as T.Mesh).geometry.computeBoundingBox(),(p as T.Mesh).geometry.boundingBox!)).getSize(new T.Vector3()).x*p.scale.x})),
        flowDraws:this.flowView?.root.visible?this.flowView.root.children.filter(part=>part.visible).length:[...this.flowBatches.values()].reduce((sum,b)=>sum+Number(!!b.pipe&&b.pipe.visible)+Number(b.volume.visible)+Number(b.points.visible),0),flowRepresentation:this.presentation==='flow'?'continuous-native-gas-volumes':'dense-native-stream-bands',
        exhaustPlumes:this.exhaustPlumes?{visible:this.exhaustPlumes.points.visible,outlets:this.exhaustPlumes.outlets.map(point=>point.toArray()),directions:this.exhaustPlumes.directions.map(point=>point.toArray()),rates:this.exhaustPlumes.flow.toArray(),draws:1}:null},
      parts:this.parts.map(part=>({
        piston:world(part.piston),wristPin:world(part.wristPin),crown:world(part.crown),
        rodEnds:[world(part.rod,new T.Vector3(0,.5,0)),world(part.rod,new T.Vector3(0,-.5,0))],
        crankPin:world(part.throw.children[0]),
        combustion:{flame:part.flame.visible,spark:part.spark.visible,gas:part.gas.visible,opacity:(part.gas.material as T.MeshBasicMaterial).opacity,top:part.gas.position.y+part.gas.scale.y/2,native:part.flame.userData.nativeCombustion??null,firstFlamePoint:[part.flameBuffer.getX(0),part.flameBuffer.getY(0),part.flameBuffer.getZ(0)]},
        opaque:(()=>{let opaque=true;part.piston.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.transparent)opaque=false;});return opaque;})(),
        valves:part.valves.map(valve=>({position:world(valve),follower:world(valve,new T.Vector3(0,267,0))})),
        springs:part.springs.map(pair=>pair.map(mesh=>({bottom:world(mesh,new T.Vector3(0,-17,0)),top:world(mesh,new T.Vector3(0,17,0))}))),
      })),
      routes:this.routes.map(route=>({medium:route.medium,branch:route.branch,flowFactor:route.flowFactor,phase:route.phase,rate:route.rate,pipe:route.pipe.visible,stream:route.volume.visible,particles:route.points.visible})),
    };
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.observer.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('keydown',this.keydown);
    this.disposeFlowView();
    // The separate environment is shared by scene lighting and LOD materials.
    // Remove material references before the common disposer so it is freed once.
    this.scene.traverse(object=>{if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof T.MeshStandardMaterial&&material.envMap===this.environment)material.envMap=null;});
    const counts=disposeSceneResources(this.scene);this.environment?.dispose();this.keyLight.shadow.map?.dispose();this.renderer.dispose();this.renderer.domElement.remove();this.pistonLibrary=null;this.studioPiston=null;
    this.host.dataset.disposed=JSON.stringify(counts);this.parts=[];this.routes=[];this.materials=[];this.flowGroups.clear();this.flowBatches.clear();this.routeMaterials.clear();this.workshop=null;this.exhaustPlumes=null;this.glowTexture=null;this.cameraPoints=[];this.scene.clear();
  }
}
