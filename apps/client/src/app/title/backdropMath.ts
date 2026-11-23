// P3D: the backdrop's numbers, apart from the renderer so they can be tested: which hours the two
// lights pin, where the camera aims at a town, how it drifts and how a framing shifts its target.
import { MAP_SIZE } from '@qoti/sim';
import type { CameraView } from '../../input/camera';
import type { Framing, TitleLight } from './shared';

/** The hour pinned for each light (`renderer.photo.setTimeOfDay`), chosen by looking at shots. */
export const HOURS: Record<TitleLight, number> = { day: 16, dusk: 19.5 };

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

/** The camera's starting pose: low and scenic, a little off the street grid's axis. */
export const AIM = {
  yaw: 0.62,
  pitch: 0.64,
  /** Distance as a multiple of the town's radius, and its limits in tiles. */
  radii: 4.6,
  minDistance: 46,
  maxDistance: 150,
};

/** The dense heart of the buildings: their mean, then the mean of those near it (stray farms drop out). */
export function townCenter(buildings: readonly { x: number; z: number }[]): {
  x: number;
  z: number;
  radius: number;
} {
  if (buildings.length === 0) return { x: MAP_SIZE / 2, z: MAP_SIZE / 2, radius: 14 };
  const mean = (list: readonly { x: number; z: number }[]) => ({
    x: list.reduce((s, b) => s + b.x, 0) / list.length,
    z: list.reduce((s, b) => s + b.z, 0) / list.length,
  });
  const dist = (b: { x: number; z: number }, c: { x: number; z: number }) => Math.hypot(b.x - c.x, b.z - c.z);
  let c = mean(buildings);
  const sorted = buildings.map((b) => dist(b, c)).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const near = buildings.filter((b) => dist(b, c) <= Math.max(10, median * 1.5));
  c = mean(near);
  const spread = near.map((b) => dist(b, c)).sort((a, b) => a - b);
  const radius = spread[Math.min(spread.length - 1, Math.floor(spread.length * 0.85))]!;
  return { x: c.x, z: c.z, radius: Math.max(10, radius) };
}

export function aimAt(c: { x: number; z: number; radius: number }): TownAim {
  const distance = Math.min(AIM.maxDistance, Math.max(AIM.minDistance, c.radius * AIM.radii));
  return { x: c.x, z: c.z, radius: c.radius, yaw: AIM.yaw, pitch: AIM.pitch, distance };
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
export function framedTarget(view: CameraView, aim: TownAim, f: Framing, aspect: number): CameraView {
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
