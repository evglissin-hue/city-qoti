import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { palette } from './palette';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Hooks on the shared kit material. Season tint, snow and wind sway are stubbed to Spring in I0:
 * the values are stored on `material.userData` for a later shader pass (I3) and change nothing yet.
 */
export interface KitMaterialHooks {
  season: Season;
  /** 0 to 1; snow cover on upward faces (I3). */
  snow: number;
  /** Wind sway strength for foliage (I3). */
  sway: number;
}

/** The shared kit material: vertex colors, matte, with season, snow and sway hooks. */
export function createKitMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const hooks: KitMaterialHooks = { season: 'spring', snow: 0, sway: 0 };
  m.userData.kitHooks = hooks;
  return m;
}

/** Updates the hooks; a no-op on the look until the I3 seasons pass. */
export function setKitMaterialHooks(m: MeshStandardMaterial, hooks: Partial<KitMaterialHooks>): void {
  const cur = (m.userData.kitHooks as KitMaterialHooks | undefined) ?? {
    season: 'spring',
    snow: 0,
    sway: 0,
  };
  m.userData.kitHooks = { ...cur, ...hooks, season: 'spring' };
}

/**
 * The emissive variant for glowing pieces (window panes, lantern flames). `night` 0 to 1 sets the
 * strength; at 0 it looks like the plain kit material.
 */
export function createEmissiveKitMaterial(night = 1): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0,
    emissive: new Color(palette.window),
    emissiveIntensity: 1.6 * night,
  });
  m.userData.kitHooks = { season: 'spring', snow: 0, sway: 0 } satisfies KitMaterialHooks;
  return m;
}

/**
 * C3D: the resident material. Vertex colors plus two per-vertex channels from rig.ts: `paint`
 * picks a tint (instance color for clothes, `iFur` and `iFur2` for fur), and `rig` swings arms,
 * feet, ears and tails about fixed pivots from the per-instance `iMotion` (anim, walk phase, seed,
 * and C4E the arm held out to a partner's hand, 0 for none) and the shared `uTime` uniform (seconds, in `material.userData.time`). Anim numbers follow
 * AgentAnim: 0 idle, 1 walk, 2 carry, 3 hop, 4 work. Body bob and squash live in the instance
 * matrix, so carried bundles can share them.
 */
/**
 * C4P: motions the client derives for residents on top of the sim's AgentAnim (0 to 5), written to
 * the same iMotion.x: chatting, waving while walking, waving while standing, sitting on a bench.
 */
export const MOTION = { talk: 6, wave: 7, waveStill: 8, sit: 9 } as const;

export function createResidentMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const time = { value: 0 };
  m.userData.time = time;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RESIDENT_VERTEX_HEAD}`)
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nqRigSetup();\nobjectNormal = qRot(objectNormal);',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = qRigPoint(transformed);')
      .replace('#include <color_vertex>', RESIDENT_COLOR_VERTEX);
  };
  m.customProgramCacheKey = () => 'qoti-resident';
  return m;
}

const RESIDENT_VERTEX_HEAD = /* glsl */ `
attribute float paint;
attribute float rig;
attribute vec3 iFur;
attribute vec3 iFur2;
attribute vec4 iMotion;
uniform float uTime;
vec3 qPivot;
vec3 qShift;
float qAx;
float qAy;
float qAz;
vec3 qRot(vec3 p) {
  float c = cos(qAx), s = sin(qAx);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  c = cos(qAz); s = sin(qAz);
  p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
  c = cos(qAy); s = sin(qAy);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
void qRigSetup() {
  qPivot = vec3(0.0); qShift = vec3(0.0); qAx = 0.0; qAy = 0.0; qAz = 0.0;
  float anim = iMotion.x;
  float ph = iMotion.y;
  float seed = iMotion.z;
  // AgentAnim 0 to 4 from the sim; C4P adds the client's own motions 6 to 9 (MOTION).
  bool wave = anim > 6.5 && anim < 8.5;
  bool walk = (anim > 0.5 && anim < 2.5) || (anim > 6.5 && anim < 7.5);
  bool carry = anim > 1.5 && anim < 2.5;
  bool hop = anim > 2.5 && anim < 3.5;
  bool work = anim > 3.5 && anim < 4.5;
  bool talk = anim > 5.5 && anim < 6.5;
  bool sit = anim > 8.5;
  if (rig > 0.5 && rig < 2.5) {
    float side = rig < 1.5 ? 1.0 : -1.0;
    qPivot = vec3(0.066 * side, 0.15, 0.0);
    // C4E: iMotion.w names an arm (1 or 2) held out to a partner's hand, swinging a little.
    if (iMotion.w > 0.5 && abs(iMotion.w - rig) < 0.5) {
      qAz = side * 0.42;
      qAx = -0.22 + (walk ? sin(ph) * 0.12 : 0.0);
    } else if (wave && side < 0.0) {
      // C4P: a hand up and waving to a friend.
      qAz = side * (2.45 + sin(uTime * 11.0 + seed) * 0.32);
      qAx = -0.25;
    } else if (carry) qAx = -1.3;
    else if (walk) qAx = sin(ph) * 0.75 * side;
    else if (hop) qAz = side * (2.2 + sin(uTime * 9.0 + seed) * 0.25);
    else if (work) qAx = -1.05 + sin(uTime * 9.0 + seed) * 0.6;
    else if (talk && side * (fract(seed * 0.37) - 0.5) > 0.0) {
      // C4P: talking with one hand, the way folk do over a fence.
      qAx = -0.7 + sin(uTime * 3.1 + seed) * 0.35;
      qAz = side * (0.22 + sin(uTime * 2.3 + seed * 2.0) * 0.14);
    } else if (sit) {
      qAx = -0.55;
      qAz = side * 0.1;
    } else qAx = sin(uTime * 1.7 + seed) * 0.07;
  } else if (rig > 2.5 && rig < 4.5) {
    float side = rig < 3.5 ? 1.0 : -1.0;
    if (walk) qShift = vec3(0.0, max(0.0, -cos(ph) * side) * 0.03, -sin(ph) * side * 0.045);
    else if (hop) qShift = vec3(0.0, 0.012, -0.01);
    // C4P: seated, the feet come forward off the edge of the bench and swing a little.
    else if (sit) qShift = vec3(0.0, -0.006, 0.05 + sin(uTime * 2.1 + seed + side) * 0.008);
  } else if (rig > 4.5 && rig < 5.5) {
    qPivot = vec3(0.0, 0.255, 0.01);
    if (walk) qAx = -0.08 + sin(ph * 2.0) * 0.1;
    else if (hop) qAx = -0.35;
    else if (talk) qAx = -0.1 + sin(uTime * 3.0 + seed) * 0.08;
    else qAx = sin(uTime * 2.3 + seed) * 0.05 + max(0.0, sin(uTime * 0.7 + seed * 3.0) - 0.96) * 4.0;
  } else if (rig > 5.5) {
    qPivot = vec3(0.0, 0.07, -0.06);
    qAy = walk ? sin(ph) * 0.3 : sit ? sin(uTime * 1.3 + seed) * 0.1 : sin(uTime * (hop ? 12.0 : talk ? 4.0 : 2.6) + seed) * 0.22;
  }
}
vec3 qRigPoint(vec3 p) { return qRot(p - qPivot) + qPivot + qShift; }
`;

const RESIDENT_COLOR_VERTEX = /* glsl */ `
  vColor = vec4( 1.0 );
#ifdef USE_COLOR
  vColor.rgb *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  if (paint > 0.5 && paint < 1.5) vColor.rgb *= instanceColor.rgb;
#endif
  if (paint > 1.5 && paint < 2.5) vColor.rgb *= iFur;
  else if (paint > 2.5) vColor.rgb *= iFur2;
`;

/** Translucent material for placement ghosts, tinted valid or invalid. */
export function createGhostMaterial(valid: boolean): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: valid ? palette.ghostValid : palette.ghostInvalid,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
}
