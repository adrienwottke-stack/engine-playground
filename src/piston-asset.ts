import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PISTON_SPEC} from './piston-spec';
import {disposeSceneResources} from './engine-three-resources';

export interface PistonInstance {
  root:T.Group;
  wristPin:T.Object3D;
  crown:T.Object3D;
  pieces:{name:string;object:T.Object3D;base:T.Vector3}[];
}
export interface PistonLibrary {hero:T.Group;engine:T.Group;assetId:string;triangles:number;engineTriangles:number;}

/** A source metre is converted to the engine's illustrative millimetres once. */
export function createPistonInstance(template:T.Group):PistonInstance{
  const root=new T.Group();root.name='piston-instance';root.scale.setScalar(1000);
  const content=template.clone(true);root.add(content);
  const pieces:PistonInstance['pieces']=[];let wristPin:T.Object3D|undefined,crown:T.Object3D|undefined;
  content.traverse(object=>{
    const name=object.userData.part_name as string|undefined;
    if(name)pieces.push({name,object,base:object.position.clone()});
    if(name==='wrist_pin')wristPin=object;
    if(object.userData.datum_name==='anchor_crown')crown=object;
    if(object instanceof T.Mesh){object.castShadow=true;object.receiveShadow=true;}
  });
  if(!wristPin||!crown||pieces.length!==9)throw new Error('Die Kolbenbaugruppe hat unvollstaendige Bauteile oder Anschlusspunkte.');
  root.userData.assetId=PISTON_SPEC.assetId;
  return {root,wristPin,crown,pieces};
}

/** Inspection only. The six native engine instances always remain assembled. */
export function explodePiston(instance:PistonInstance,amount:number){
  const value=Number.isFinite(amount)?T.MathUtils.clamp(amount,0,1):0;
  const offsets:Record<string,number[]>={
    compression_ring_top:[0,.065,0],compression_ring_second:[0,.048,0],
    oil_rail_upper:[0,.033,0],oil_expander:[0,.025,0],oil_rail_lower:[0,.017,0],
    wrist_pin:[.075,0,0],retaining_clip_left:[-.065,0,0],retaining_clip_right:[.095,0,0],
  };
  for(const piece of instance.pieces){piece.object.position.copy(piece.base);const d=offsets[piece.name];if(d)piece.object.position.addScaledVector(new T.Vector3(...d),value);}
  instance.root.updateMatrixWorld(true);
}

export async function loadPistonLibrary():Promise<PistonLibrary>{
  const loader=new GLTFLoader(),base=import.meta.env.BASE_URL+'models/';
  const results=await Promise.allSettled([
    loader.loadAsync(base+'m52-piston-reference.glb'),loader.loadAsync(base+'m52-piston-engine.glb'),
    fetch(base+'m52-piston-reference.json').then(async response=>{if(!response.ok)throw new Error('Kolben-Metadaten fehlen.');return response.json();}),
  ]);
  if(results.some(result=>result.status==='rejected')){
    for(const result of results.slice(0,2))if(result.status==='fulfilled'&&result.value?.scene)disposeSceneResources(result.value.scene);
    throw new Error('Die lokalen Kolbenmodelle konnten nicht geladen werden. Der 2D-Schnitt bleibt verfuegbar.');
  }
  const hero=(results[0] as PromiseFulfilledResult<{scene:T.Group}>).value.scene;
  const engine=(results[1] as PromiseFulfilledResult<{scene:T.Group}>).value.scene;
  const metadata=(results[2] as PromiseFulfilledResult<any>).value;
  if(metadata.assetId!==PISTON_SPEC.assetId||metadata.units!=='metres'||metadata.dimensions.compressionHeightMm!==PISTON_SPEC.compressionHeightMm){
    disposeSceneResources(hero);disposeSceneResources(engine);throw new Error('Das Kolbenmodell passt nicht zum Montagebezug.');
  }
  return {hero,engine,assetId:metadata.assetId,triangles:metadata.triangles,engineTriangles:metadata.engineLod.triangles};
}
