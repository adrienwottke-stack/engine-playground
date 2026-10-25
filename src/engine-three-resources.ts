import {InstancedMesh,Texture,type BufferGeometry,type Material,type Object3D} from 'three';

/** Include line helpers and shared/cloned meshes; release each GPU resource once. */
export function disposeSceneResources(root:Object3D,preserve:ReadonlySet<Material>=new Set(),borrowedTextures:ReadonlySet<Texture>=new Set()){
  const geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),instances=new Set<InstancedMesh>();
  root.traverse(object=>{
    if(object instanceof InstancedMesh)instances.add(object);
    const drawable=object as Object3D&{geometry?:BufferGeometry;material?:Material|Material[]};
    if(drawable.geometry)geometries.add(drawable.geometry);
    for(const material of Array.isArray(drawable.material)?drawable.material:drawable.material?[drawable.material]:[]){
      if(!preserve.has(material))materials.add(material);
    }
  });
  const textures=new Set<Texture>();
  for(const material of materials)for(const value of Object.values(material))if(value instanceof Texture&&!borrowedTextures.has(value))textures.add(value);
  const bitmaps=new Set<ImageBitmap>();
  for(const texture of textures){
    if(typeof ImageBitmap!=='undefined'&&texture.source.data instanceof ImageBitmap)bitmaps.add(texture.source.data);
    texture.dispose();
  }
  bitmaps.forEach(bitmap=>bitmap.close());
  instances.forEach(object=>object.dispose());
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  return {geometries:geometries.size,materials:materials.size,textures:textures.size,instances:instances.size};
}
