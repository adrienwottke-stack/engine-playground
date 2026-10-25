import * as T from 'three';

interface StudioEnvironmentMetadata {
  format:string;
  width:number;
  height:number;
  channels:number;
  byteOrder:string;
  byteLength:number;
  threeRevision:string;
}

/** Load the offline GGX-filtered CubeUV atlas; no runtime PMREM or scene capture. */
export async function loadStudioEnvironment():Promise<T.DataTexture>{
  const base=import.meta.env.BASE_URL+'models/studio-env';
  const [metadataResponse,binaryResponse]=await Promise.all([fetch(base+'.json'),fetch(base+'.bin')]);
  if(!metadataResponse.ok||!binaryResponse.ok)throw new Error('Die vorberechnete Studioumgebung konnte nicht geladen werden.');
  const [metadata,buffer]=await Promise.all([metadataResponse.json() as Promise<StudioEnvironmentMetadata>,binaryResponse.arrayBuffer()]);
  const {width,height}=metadata;
  if(metadata.format!=='RGBA16F-CubeUV'||metadata.channels!==4||metadata.byteOrder!=='little-endian'||
    !Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>2048||height>2048||
    metadata.byteLength!==width*height*8||buffer.byteLength!==metadata.byteLength){
    throw new Error('Die vorberechnete Studioumgebung hat ein ungueltiges Datenformat.');
  }
  if(metadata.threeRevision!==T.REVISION)throw new Error('Die Studioumgebung muss fuer diese Three.js-Version neu vorbereitet werden.');
  const view=new DataView(buffer),data=new Uint16Array(buffer.byteLength/2);
  let positive=0;
  for(let i=0;i<data.length;i++){
    const half=view.getUint16(i*2,true);
    if((half&0x7c00)===0x7c00||(half&0x8000)!==0)throw new Error('Die Studioumgebung enthaelt ungueltige Strahlungswerte.');
    if(half>0&&i%4!==3)positive++;
    data[i]=half;
  }
  if(positive===0)throw new Error('Die vorberechnete Studioumgebung ist leer.');
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat,T.HalfFloatType);
  texture.name='studio-env-offline-cubeuv';
  texture.mapping=T.CubeUVReflectionMapping;
  texture.colorSpace=T.LinearSRGBColorSpace;
  texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
  texture.generateMipmaps=false;texture.flipY=false;texture.unpackAlignment=1;texture.needsUpdate=true;
  return texture;
}
