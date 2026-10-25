import * as T from 'three';

type SurfaceKind = 'cast-aluminium' | 'machined-metal' | 'black-plastic';
const REVISION = 'surface-r5-1';
// Coordinates are authored millimetres. Height is a shading relief, not geometry.
export const ENGINE_SURFACE_DETAILS = {
  'cast-aluminium': { frequency: 1.15, relief: .022, roughness: .035, machining: 0 },
  'machined-metal': { frequency: 1.8, relief: .007, roughness: .018, machining: 1 },
  'black-plastic': { frequency: 2.1, relief: .008, roughness: .020, machining: 0 },
} as const;
const installed = new WeakMap<T.Material, { compile: T.Material['onBeforeCompile']; key: T.Material['customProgramCacheKey'] }>();

/** Continuous object-space value noise, with no maps, UVs, time or camera input.
 * fwidth removes unresolved detail before it becomes a subpixel pattern. */
const fragmentFunctions = /* glsl */`
varying vec3 vEngineSurfacePosition;
float engineSurfaceHash(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float engineSurfaceNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(engineSurfaceHash(i), engineSurfaceHash(i + vec3(1,0,0)), f.x),
                 mix(engineSurfaceHash(i + vec3(0,1,0)), engineSurfaceHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(engineSurfaceHash(i + vec3(0,0,1)), engineSurfaceHash(i + vec3(1,0,1)), f.x),
                 mix(engineSurfaceHash(i + vec3(0,1,1)), engineSurfaceHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 engineSurfaceNormal(vec3 viewPosition, vec3 baseNormal, float height, float faceDirection) {
  vec3 dx = dFdx(viewPosition), dy = dFdy(viewPosition);
  vec3 r1 = cross(dy, baseNormal), r2 = cross(baseNormal, dx);
  float determinant = dot(dx, r1) * faceDirection;
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 1e-12) * baseNormal - gradient);
}
`;

function detailKind(material: T.MeshStandardMaterial): SurfaceKind | null {
  const profile = material.userData.engineSurface?.profile;
  return profile === 'cast-aluminium' || profile === 'machined-metal' || profile === 'black-plastic' ? profile : null;
}

/** Install on a factory material, or reinstall after standard Material.clone().
 * External normal/bump maps always win. No texture/uniform ownership is added. */
export function installEngineSurfaceDetail<M extends T.Material>(material: M): M {
  if (!(material instanceof T.MeshStandardMaterial)) return material;
  const kind = detailKind(material);
  if (!kind || installed.has(material)) return material;
  const previous = { compile: material.onBeforeCompile, key: material.customProgramCacheKey };
  installed.set(material, previous);
  material.userData.engineSurfaceDetail = { revision: REVISION, kind, coordinates: 'object-mm', textures: 0 };
  material.onBeforeCompile = function (shader, renderer) {
    previous.compile.call(this, shader, renderer);
    if (this.normalMap || this.bumpMap) return;
    const settings = ENGINE_SURFACE_DETAILS[kind];
    const slots: [string, string][] = [
      ['vertexShader', '#include <common>'], ['vertexShader', '#include <begin_vertex>'],
      ['fragmentShader', '#include <common>'], ['fragmentShader', '#include <roughnessmap_fragment>'],
      ['fragmentShader', '#include <normal_fragment_maps>'],
    ];
    for (const [stage, marker] of slots) {
      if (!shader[stage as 'vertexShader' | 'fragmentShader'].includes(marker)) throw new Error(`${REVISION}: missing Three shader marker ${marker}`);
    }
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEngineSurfacePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEngineSurfacePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragmentFunctions)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        vec3 engineSurfaceP = vEngineSurfacePosition * ${settings.frequency.toFixed(4)};
        float engineSurfaceFootprint = max(length(dFdx(engineSurfaceP)), length(dFdy(engineSurfaceP)));
        float engineSurfaceFilter = 1.0 - smoothstep(.28, .95, engineSurfaceFootprint);
        float engineSurfaceGrain = (engineSurfaceNoise(engineSurfaceP) - .5) * 2.0;
        float engineSurfaceLines = sin(6.2831853 * (engineSurfaceP.x + .07 * engineSurfaceP.y));
        float engineSurfaceLineFilter = 1.0 - smoothstep(.15, .48, engineSurfaceFootprint);
        float engineSurfaceDetail = mix(engineSurfaceGrain * engineSurfaceFilter,
          engineSurfaceLines * engineSurfaceLineFilter, ${settings.machining.toFixed(1)});
        roughnessFactor = clamp(roughnessFactor + engineSurfaceDetail * ${settings.roughness.toFixed(4)}, .08, 1.0);
        float engineSurfaceHeight = engineSurfaceDetail * ${settings.relief.toFixed(4)};
      `)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = engineSurfaceNormal(-vViewPosition, normal, engineSurfaceHeight, faceDirection);');
  };
  material.customProgramCacheKey = function () {
    return `${previous.key.call(this)}|${REVISION}:${kind}:maps=${!!this.normalMap || !!this.bumpMap}`;
  };
  material.needsUpdate = true;
  return material;
}

/** R4 radiator/inspection clones need this in place of plain material.clone().
 * Rebuild our hook from serializable profile metadata; preserve existing maps.
 * The hook closure adds no textures and creates no per-frame objects/maps. */
export function cloneEngineMaterialWithSurface<M extends T.Material>(material: M): M {
  const clone = material.clone();
  const previous = installed.get(material);
  if (previous) { clone.onBeforeCompile = previous.compile; clone.customProgramCacheKey = previous.key; }
  return installEngineSurfaceDetail(clone);
}
