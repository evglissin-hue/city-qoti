// P3D: the backdrop's numbers, apart from the renderer so they can be tested: which hours the two
// lights pin, where the camera aims at a town, how it drifts and how a framing shifts its target.
import { MAP_SIZE } from '@qoti/sim';
import type { CameraView } from '../../input/camera';
import type { Framing, TitleLight } from './shared';

/** The hour pinned for each light (`renderer.photo.setTimeOfDay`), chosen by looking at shots. */
export const HOURS: Record<TitleLight, number> = { day: 16, dusk: 19.2 };

/** A valley with fewer buildings than this is still a hamlet: the title shows the grown village. */
export const GROWN_BUILDINGS = 25;

export function chooseValley(buildings: number): boolean {
  return buildings >= GROWN_BUILDINGS;
}

export const DRIFT = {
  /** Fastest sway of the yaw, radians a second. */
  yawRate: 0.01,
  /** How far the yaw sways either side of its start, radians (so it never circles away). */
  yawSwing: 0.32,
  /** The breathing of the distance: a fraction of it, over this many seconds. */
  breath: 0.025,
  breathSeconds: 52,
};

/** The vertical field of view in degrees (`FOV` in input/camera.ts; a test keeps them equal). */
export const VIEW_FOV = 30;

export interface TownAim {
  x: number;
  z: number;
  /** About how far the town reaches from its center, in tiles. */
  radius: number;
  yaw: number;
  pitch: number;
  distance: number;
}

/** The camera's starting pose: close and a little low, so cottages read as cottages. */
export const AIM = {
  pitch: 0.55,
  /** Tiles from the heart of the town. */
  distance: 46,
  minDistance: 30,
  /** Aspect ratios the view must stay on terrain at (a narrow window to an ultrawide). */
  aspects: [1.3, 1.78, 2.3],
  /** Tiles of terrain to keep between the view's edge and the map's. */
  margin: 4,
};

/**
 * The heart of the town: the mean of the densest third of the buildings (most neighbors within a
 * few tiles), so stray farms and a long street's tail fall away. `radius` is how far that heart reaches.
 */
export function townCenter(buildings: readonly { x: number; z: number }[]): {
  x: number;
  z: number;
  radius: number;
} {
  if (buildings.length === 0) return { x: MAP_SIZE / 2, z: MAP_SIZE / 2, radius: 14 };
  const near = buildings.map((b, i) => ({
    i,
    n: buildings.reduce((c, o) => c + (Math.hypot(b.x - o.x, b.z - o.z) <= 9 ? 1 : 0), 0),
  }));
  near.sort((a, b) => b.n - a.n || a.i - b.i);
  const heart = near.slice(0, Math.max(1, Math.ceil(buildings.length / 3))).map((e) => buildings[e.i]!);
  const x = heart.reduce((s, b) => s + b.x, 0) / heart.length;
  const z = heart.reduce((s, b) => s + b.z, 0) / heart.length;
  const spread = heart.map((b) => Math.hypot(b.x - x, b.z - z)).sort((a, b) => a - b);
  return {
    x,
    z,
    radius: Math.max(8, spread[Math.min(spread.length - 1, Math.floor(spread.length * 0.85))]!),
  };
}

/**
 * How many tiles of terrain lie between the view's footprint on the ground and the map's edge
 * (negative when the view would show the void). The footprint is the four corners of the view's
 * ground trapezoid; a ray at or above the horizon counts as far beyond the map.
 */
export function footprintMargin(
  target: { x: number; z: number },
  yaw: number,
  pitch: number,
  distance: number,
  aspect: number,
): number {
  const half = (VIEW_FOV * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(half) * aspect);
  const height = distance * Math.sin(pitch);
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const cam = {
    x: target.x + sin * distance * Math.cos(pitch),
    z: target.z + cos * distance * Math.cos(pitch),
  };
  let worst = Infinity;
  for (const dip of [pitch + half, pitch - half]) {
    // Ground distance along the camera's heading to a ray `dip` below the horizon, and the width it spans.
    const ground = dip > 0.02 ? height / Math.tan(dip) : 1e4;
    const slant = dip > 0.02 ? height / Math.sin(dip) : 1e4;
    const w = slant * Math.tan(hHalf);
    for (const side of [-1, 1]) {
      const x = cam.x - sin * ground + side * cos * w;
      const z = cam.z - cos * ground - side * sin * w;
      worst = Math.min(worst, x, z, MAP_SIZE - x, MAP_SIZE - z);
    }
  }
  return worst;
}

/** The smallest margin over the drift's reach (yaw sway, breathing) and the framings a layout may ask for. */
function reachMargin(c: { x: number; z: number }, yaw: number, distance: number): number {
  let worst = Infinity;
  for (const aspect of AIM.aspects) {
    for (const sway of [-DRIFT.yawSwing, 0, DRIFT.yawSwing]) {
      for (const breath of [1 - DRIFT.breath, 1 + DRIFT.breath]) {
        const d = distance * breath;
        const y = yaw + sway;
        // Framings shift the target by up to a fifth of the width sideways or a tenth of the height ahead.
        for (const [fx, fy] of [
          [0, 0],
          [0.2, 0],
          [-0.2, 0],
          [0, 0.1],
        ] as const) {
          const t = framedTarget(
            { x: c.x, z: c.z, yaw: y, pitch: AIM.pitch, distance: d },
            { x: c.x, z: c.z },
            { x: fx, y: fy },
            aspect,
          );
          worst = Math.min(worst, footprintMargin(t, y, AIM.pitch, d, aspect));
        }
      }
    }
  }
  return worst;
}

/**
 * Aims at the heart from the side with the most land behind it: of sixteen yaws the one whose drift
 * keeps the view furthest from the map's edge, closing in, then sliding inward, if no yaw keeps `margin` tiles.
 */
export function aimAt(town: { x: number; z: number; radius: number }): TownAim {
  let distance = AIM.distance;
  let c = { x: town.x, z: town.z };
  for (let guard = 0; guard < 60; guard++) {
    let best = { yaw: 0.62, margin: -Infinity };
    for (let k = 0; k < 16; k++) {
      const yaw = 0.62 + (k * Math.PI) / 8;
      const margin = reachMargin(c, yaw, distance);
      if (margin > best.margin) best = { yaw, margin };
    }
    const done = best.margin >= AIM.margin;
    if (done || guard === 59) {
      return { x: c.x, z: c.z, radius: town.radius, yaw: best.yaw, pitch: AIM.pitch, distance };
    }
    if (distance > AIM.minDistance) distance = Math.max(AIM.minDistance, distance * 0.92);
    else {
      // A town near the map's edge: slide the aim toward the middle until the view fits.
      c = { x: c.x + (MAP_SIZE / 2 - c.x) * 0.1, z: c.z + (MAP_SIZE / 2 - c.z) * 0.1 };
    }
  }
  throw new Error('unreachable');
}

/** The drifting pose after `seconds` (0 holds still: Calm motion). The target is the town itself. */
export function driftView(aim: TownAim, seconds: number): CameraView {
  const sway = DRIFT.yawSwing * Math.sin((seconds * DRIFT.yawRate) / DRIFT.yawSwing);
  const breath = 1 + DRIFT.breath * Math.sin((seconds * 2 * Math.PI) / DRIFT.breathSeconds);
  return { x: aim.x, z: aim.z, yaw: aim.yaw + sway, pitch: aim.pitch, distance: aim.distance * breath };
}

/**
 * Shifts the target so the town sits `framing.x` of the view's width right of center and `framing.y`
 * of its height below it: the camera's right is (cos yaw, -sin yaw) on the ground, forward is
 * (-sin yaw, -cos yaw), and a step forward on the ground shows as sin(pitch) of that in the view.
 */
export function framedTarget(
  view: CameraView,
  aim: { x: number; z: number },
  f: Framing,
  aspect: number,
): CameraView {
  if (!f.x && !f.y) return view;
  const height = 2 * view.distance * Math.tan((VIEW_FOV * Math.PI) / 360);
  const width = height * aspect;
  const right = f.x * width;
  const ahead = (f.y * height) / Math.sin(view.pitch);
  const sin = Math.sin(view.yaw);
  const cos = Math.cos(view.yaw);
  return {
    ...view,
    x: aim.x - cos * right - sin * ahead,
    z: aim.z + sin * right - cos * ahead,
  };
}
