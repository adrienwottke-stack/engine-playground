import * as T from 'three';
import {installEngineSurfaceDetail} from './engine-material-surfaces';

export type EngineSurface = 'cast-aluminium' | 'machined-metal' | 'exhaust-metal' | 'black-plastic' | 'rubber' | 'authored';
type Profile = { metalness: readonly [number, number]; roughness: readonly [number, number]; reflection: number };

/** Bounded display profiles, not measured OEM surface data. Keep authored colour
 * and roughness variation (including vertex-coloured exhaust oxidation). No maps,
 * extra draw calls, or software-specific changes to the physical material. */
export const ENGINE_MATERIAL_PROFILES: Record<Exclude<EngineSurface, 'authored'>, Profile> = {
  'cast-aluminium': { metalness: [.64, .72], roughness: [.60, .76], reflection: .88 },
  'machined-metal': { metalness: [.72, .9], roughness: [.28, .44], reflection: 1.0 },
  'exhaust-metal': { metalness: [.48, .7], roughness: [.56, .9], reflection: .82 },
  'black-plastic': { metalness: [0, 0], roughness: [.56, .9], reflection: .48 },
  'rubber': { metalness: [0, 0], roughness: [.9, .98], reflection: .30 },
};

/** Bridge existing three-number factory calls without altering their call sites.
 * Explicit existing palette entries disambiguate casting/rubber from exhaust or
 * plastic. Other coloured surfaces (brass, ceramic, section faces) stay authored.
 * Future component authors can supply an explicit profile as the fourth arg. */
export function engineSurfaceFor(color: number, metalness: number, roughness: number): EngineSurface {
  if (color === 0x74858c) return 'cast-aluminium';
  if (color === 0x121e23 || color === 0x181e21) return 'rubber';
  const brightest = Math.max(color >> 16 & 255, color >> 8 & 255, color & 255);
  if (brightest <= 64 && metalness <= .25) return roughness >= .92 ? 'rubber' : 'black-plastic';
  if (roughness >= .56 && (color === 0xffffff && metalness >= .3 || color === 0x635d55 || color === 0x5d5248)) return 'exhaust-metal';
  if (metalness >= .6) return 'machined-metal';
  return 'authored';
}

export function createEngineMaterial(color: number, metalness = .5, roughness = .4, surface = engineSurfaceFor(color, metalness, roughness)): T.MeshStandardMaterial {
  const profile = surface === 'authored' ? null : ENGINE_MATERIAL_PROFILES[surface];
  const m = T.MathUtils.clamp(metalness, 0, 1), r = T.MathUtils.clamp(roughness, 0, 1);
  const material = new T.MeshStandardMaterial({
    color,
    metalness: profile ? T.MathUtils.clamp(m, ...profile.metalness) : m,
    roughness: profile ? T.MathUtils.clamp(r, ...profile.roughness) : r,
  });
  const reflection = profile?.reflection ?? (.55 + .5 * m);
  material.envMapIntensity = reflection;
  material.userData.engineSurface = { profile: surface, reflection, revision: 'detail-light-r3' };
  return installEngineSurfaceDetail(material);
}

/** Use the material's profile rather than a discontinuity at metalness=.3.
 * Unprofiled room/flow materials retain a continuous, bounded response. */
export function workshopReflectionIntensity(material: T.MeshStandardMaterial): number {
  const surface = material.userData.engineSurface;
  return surface && typeof surface.reflection === 'number' ? surface.reflection : .55 + .5 * T.MathUtils.clamp(material.metalness, 0, 1);
}
