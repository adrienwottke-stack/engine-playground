import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// Standalone offline asset bake. Port 0 reserves its own free loopback port;
// this server never imports the native bridge or touches engine controls.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const threeRoot=resolve(root,'node_modules/three');
const output=resolve(root,'public/models');
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    if(pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Offline studio environment bake</title>');return;}
    if(!pathname.startsWith('/three/')){res.writeHead(404);res.end();return;}
    const file=resolve(threeRoot,decodeURIComponent(pathname.slice('/three/'.length)));
    if(!file.startsWith(threeRoot+sep)){res.writeHead(403);res.end();return;}
    const contents=await readFile(file);
    res.writeHead(200,{'content-type':extname(file)==='.js'?'text/javascript':'application/octet-stream'});res.end(contents);
  }catch{res.writeHead(404);res.end();}
});
let browser;
try{
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  const {port}=server.address();
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:128,height:128}});
  page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${port}/`);
  const baked=await page.evaluate(async()=>{
    const T=await import('/three/build/three.module.js');
    const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'low-power'});
    renderer.setSize(128,128);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
    const width=256,height=128,pixels=new Float32Array(width*height*4);
    const boxes=[
      {direction:[-.65,.8,.6],width:.55,height:.25,radiance:6,color:[1,.97,.93]},
      {direction:[.8,.35,.6],width:.4,height:.5,radiance:3,color:[.91,.96,1]},
      {direction:[.2,.7,-1],width:.55,height:.18,radiance:4.5,color:[.95,.98,1]}
    ].map(box=>{
      const direction=new T.Vector3(...box.direction).normalize(),right=new T.Vector3().crossVectors(direction,new T.Vector3(0,1,0)).normalize();
      const up=new T.Vector3().crossVectors(right,direction).normalize();
      return {...box,direction,right,up};
    });
    const smooth=(edge0,edge1,value)=>{const t=Math.max(0,Math.min(1,(value-edge0)/(edge1-edge0)));return t*t*(3-2*t);};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const phi=((x+.5)/width-.5)*Math.PI*2,latitude=((y+.5)/height-.5)*Math.PI;
      const direction=new T.Vector3(Math.cos(latitude)*Math.cos(phi),Math.sin(latitude),Math.cos(latitude)*Math.sin(phi));
      const base=.12+.2*smooth(-.3,.8,direction.y),rgb=[base*.98,base,base*1.02];
      for(const box of boxes){
        const forward=direction.dot(box.direction);if(forward<=0)continue;
        const u=Math.abs(Math.atan2(direction.dot(box.right),forward)),v=Math.abs(Math.atan2(direction.dot(box.up),forward));
        const light=(1-smooth(box.width*.8,box.width,u))*(1-smooth(box.height*.8,box.height,v))*box.radiance;
        for(let c=0;c<3;c++)rgb[c]+=light*box.color[c];
      }
      const index=(y*width+x)*4;pixels[index]=rgb[0];pixels[index+1]=rgb[1];pixels[index+2]=rgb[2];pixels[index+3]=1;
    }
    const source=new T.DataTexture(pixels,width,height,T.RGBAFormat,T.FloatType);
    source.mapping=T.EquirectangularReflectionMapping;source.colorSpace=T.LinearSRGBColorSpace;source.needsUpdate=true;
    const generator=new T.PMREMGenerator(renderer),target=generator.fromEquirectangular(source);
    if(target.texture.type!==T.HalfFloatType)throw new Error('PMREM target must be RGBA16F.');
    const half=new Uint16Array(target.width*target.height*4),gl=renderer.getContext();
    renderer.readRenderTargetPixels(target,0,0,target.width,target.height,half);
    const readError=gl.getError();if(readError!==gl.NO_ERROR)throw new Error(`Half-float readback failed: WebGL error ${readError}`);
    let min=Infinity,max=0,positive=0,total=0;
    for(let i=0;i<half.length;i++){
      const value=T.DataUtils.fromHalfFloat(half[i]);
      if(!Number.isFinite(value)||value<0)throw new Error('PMREM readback contains invalid radiance.');
      if(i%4===3)continue;min=Math.min(min,value);max=Math.max(max,value);total+=value;if(value>0)positive++;
    }
    if(positive===0||max<1)throw new Error('PMREM readback is empty or lost HDR range.');

    // Prove a rehydrated DataTexture works as an environment without triggering
    // another PMREM bake. Render a pure metal sphere using only this environment.
    const atlas=new T.DataTexture(half,target.width,target.height,T.RGBAFormat,T.HalfFloatType);
    atlas.mapping=T.CubeUVReflectionMapping;atlas.colorSpace=T.LinearSRGBColorSpace;atlas.minFilter=T.LinearFilter;atlas.magFilter=T.LinearFilter;atlas.flipY=false;atlas.generateMipmaps=false;atlas.needsUpdate=true;
    for(const method of ['fromScene','fromEquirectangular','fromCubemap'])T.PMREMGenerator.prototype[method]=()=>{throw new Error('Reloaded CubeUV atlas triggered a runtime PMREM bake.');};
    const scene=new T.Scene();scene.background=new T.Color(0);scene.environment=atlas;
    const geometry=new T.SphereGeometry(1,32,16),material=new T.MeshStandardMaterial({color:0xc5c9cd,metalness:1,roughness:.28});scene.add(new T.Mesh(geometry,material));
    const camera=new T.PerspectiveCamera(40,1,.1,20);camera.position.set(0,0,3.5);camera.lookAt(0,0,0);
    const previewTarget=new T.WebGLRenderTarget(64,64,{type:T.UnsignedByteType});renderer.setRenderTarget(previewTarget);renderer.render(scene,camera);
    const preview=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(previewTarget,0,0,64,64,preview);
    let litPixels=0,maxPreview=0;for(let i=0;i<preview.length;i+=4){const value=Math.max(preview[i],preview[i+1],preview[i+2]);if(value>8)litPixels++;maxPreview=Math.max(maxPreview,value);}
    if(litPixels<500||maxPreview<100)throw new Error('Reloaded environment did not illuminate the metal test sphere.');
    const metadata={format:'RGBA16F-CubeUV',width:target.width,height:target.height,channels:4,byteOrder:'little-endian',byteLength:half.byteLength,threeRevision:T.REVISION,
      mapping:'CubeUVReflectionMapping',colorSpace:'LinearSRGBColorSpace',minFilter:'LinearFilter',magFilter:'LinearFilter',flipY:false,generateMipmaps:false,
      generator:'scripts/bake-studio-environment.mjs',source:{width,height,projection:'equirectangular',signal:'Procedural neutral studio with three smooth rectangular softboxes; synthetic linear radiance, no measured HDRI.'},
      precision:'IEEE 754 binary16 RGBA. Linear HDR radiance; unused CubeUV atlas pixels are zero. GPU half-float arithmetic can vary slightly between browser/driver versions.',
      verification:{readback:'WebGL RGBA/HALF_FLOAT into Uint16Array',finiteNonnegative:true,positiveRgbComponents:positive,minRgb:min,maxRgb:max,meanRgb:total/(half.length/4*3),reloadWithoutPmrem:true,metalSphereLitPixels:litPixels,metalSpherePeakByte:maxPreview}};
    geometry.dispose();material.dispose();previewTarget.dispose();atlas.dispose();source.dispose();target.dispose();generator.dispose();renderer.dispose();
    return {metadata,data:Array.from(half)};
  });
  if(errors.length)throw new Error(errors.join('\n'));
  const binary=Buffer.alloc(baked.data.length*2);baked.data.forEach((value,index)=>binary.writeUInt16LE(value,index*2));
  baked.metadata.sha256=createHash('sha256').update(binary).digest('hex');
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'studio-env.bin'),binary);
  await writeFile(resolve(output,'studio-env.json'),JSON.stringify(baked.metadata,null,2)+'\n');
  console.log(JSON.stringify({output:'public/models/studio-env',...baked.metadata},null,2));
}finally{
  await browser?.close();
  await new Promise(resolveClose=>server.close(resolveClose));
}
