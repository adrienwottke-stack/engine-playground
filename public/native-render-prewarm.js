// Finish first-use graphics work before enabling interactive engine audio.
// Geometry/materials remain shared; only temporary draw objects are owned here.
export async function prepare(engine){
 const {renderer,scene,camera}=engine,canvas=renderer.domElement,host=canvas.closest('.engine-three-host');
 if(host)host.dataset.audioWarm='warming';
 const loading=host?.parentElement?.querySelector('.three-loading');
 if(loading)loading.textContent='Motor wird für flüssige Wiedergabe vorbereitet …';
 const warm=scene.clone(false),drawables=[],lights=[];
 scene.updateMatrixWorld(true);
 scene.traverse(object=>{
  if(object.isLight){const light=object.clone(false);light.matrixAutoUpdate=false;light.matrix.copy(object.matrixWorld);warm.add(light);lights.push(light);}
  if(object.isMesh||object.isLine||object.isPoints){const clone=object.clone(false);clone.visible=true;clone.frustumCulled=false;clone.matrixAutoUpdate=false;clone.matrix.copy(object.matrixWorld);drawables.push(clone);}
 });
 const size=renderer.getSize({set(x,y){this.x=x;this.y=y;return this;}}),ratio=renderer.getPixelRatio(),visibility=canvas.style.visibility;
 let batches=0,maximum=0;
 try{
  canvas.style.visibility='hidden';renderer.setPixelRatio(1);renderer.setSize(8,8,false);
  warm.add(...drawables);await renderer.compileAsync(warm,camera);warm.remove(...drawables);
  for(let start=0;start<drawables.length;start+=8){
   const batch=drawables.slice(start,start+8);warm.add(...batch);
   const at=performance.now();renderer.render(warm,camera);maximum=Math.max(maximum,performance.now()-at);batches++;
   warm.remove(...batch);await new Promise(done=>setTimeout(done,0));
  }
  if(host){host.dataset.audioWarm='ready';host.dataset.audioWarmBatches=String(batches);host.dataset.audioWarmMaxBatchMs=maximum.toFixed(1);}
 }finally{
  warm.clear();for(const object of drawables)if(object.isInstancedMesh)object.dispose();for(const light of lights)light.dispose?.();
  renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);canvas.style.visibility=visibility;
 }
}
