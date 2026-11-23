import { readFileSync } from 'node:fs';
import { MAP_SIZE } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { FOV } from '../../input/camera';
import { lightingAt } from '../../render/lighting';
import {
  AIM,
  aimAt,
  chooseValley,
  DRIFT,
  driftView,
  footprintMargin,
  framedTarget,
  GROWN_BUILDINGS,
  HOURS,
  townCenter,
  VIEW_FOV,
} from './backdropMath';

describe('the backdrop numbers', () => {
  it('keeps the field of view the renderer uses', () => {
    expect(VIEW_FOV).toBe(FOV);
  });

  it('pins a daylit hour and a dusk with lit windows, both away from night', () => {
    expect(lightingAt(HOURS.day).night).toBe(0);
    expect(lightingAt(HOURS.dusk).windowShare).toBeGreaterThan(0.6);
    expect(lightingAt(HOURS.dusk).night).toBeLessThan(0.95);
    expect(HOURS.dusk).toBeGreaterThan(HOURS.day);
  });

  it('takes only a village for the title, never a hamlet', () => {
    expect(chooseValley(GROWN_BUILDINGS - 1)).toBe(false);
    expect(chooseValley(GROWN_BUILDINGS)).toBe(true);
  });
});

describe('townCenter', () => {
  it('is the middle of an empty map when nothing is built', () => {
    const c = townCenter([]);
    expect([c.x, c.z]).toEqual([MAP_SIZE / 2, MAP_SIZE / 2]);
  });

  it('finds the dense heart and lets stray farms fall away', () => {
    const town = [];
    for (let i = 0; i < 40; i++) town.push({ x: 90 + (i % 8) * 2, z: 90 + Math.floor(i / 8) * 2 });
    const c = townCenter([...town, { x: 10, z: 10 }, { x: 180, z: 20 }]);
    expect(Math.abs(c.x - 97)).toBeLessThan(8);
    expect(Math.abs(c.z - 94)).toBeLessThan(8);
    expect(c.radius).toBeLessThan(12);
  });

  it('never shows the map edge at any drift point, aspect or framing, wherever the town stands', () => {
    for (const [x, z] of [
      [96, 96],
      [89, 96],
      [30, 40],
      [160, 150],
      [20, 170],
    ] as const) {
      const a = aimAt({ x, z, radius: 10 });
      for (const aspect of AIM.aspects) {
        for (let s = 0; s <= 3000; s += 25) {
          for (const f of [
            { x: 0, y: 0 },
            { x: 0.17, y: 0 },
            { x: 0, y: 0.06 },
          ]) {
            const v = framedTarget(driftView(a, s), a, f, aspect);
            expect(footprintMargin(v, v.yaw, v.pitch, v.distance, aspect)).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('the camera', () => {
  const aim = aimAt({ x: 96, z: 96, radius: 20 });

  it('starts low and scenic, inside the play camera pitch range and far enough to frame the town', () => {
    expect(aim.pitch).toBeGreaterThanOrEqual((30 * Math.PI) / 180);
    expect(aim.pitch).toBeLessThanOrEqual((34 * Math.PI) / 180);
    expect(aim.distance).toBeGreaterThanOrEqual(AIM.minDistance);
    expect(aim.distance).toBeLessThanOrEqual(55);
  });

  it('holds still at second zero and never drifts far', () => {
    const v0 = driftView(aim, 0);
    expect(v0.yaw).toBeCloseTo(aim.yaw, 9);
    expect(v0.distance).toBeCloseTo(aim.distance, 9);
    let maxRate = 0;
    let last = v0.yaw;
    for (let s = 0.5; s <= 3000; s += 0.5) {
      const v = driftView(aim, s);
      maxRate = Math.max(maxRate, Math.abs(v.yaw - last) / 0.5);
      last = v.yaw;
      expect(Math.abs(v.yaw - aim.yaw)).toBeLessThanOrEqual(DRIFT.yawSwing + 1e-9);
      expect(Math.abs(v.distance / aim.distance - 1)).toBeLessThanOrEqual(DRIFT.breath + 1e-9);
    }
    expect(maxRate).toBeLessThanOrEqual(DRIFT.yawRate * 1.01);
  });

  it('leaves the target on the town with no framing, and shifts it with one', () => {
    const v = driftView(aim, 0);
    expect(framedTarget(v, aim, { x: 0, y: 0 }, 16 / 9)).toEqual(v);
    // A town a fifth of the width right of center: the target sits left of it, along the camera's left.
    const f = framedTarget(v, aim, { x: 0.2, y: 0 }, 16 / 9);
    const width = 2 * v.distance * Math.tan((VIEW_FOV * Math.PI) / 360) * (16 / 9);
    const dx = aim.x - f.x;
    const dz = aim.z - f.z;
    // Along the camera's right (cos yaw, -sin yaw) by 0.2 of the width, and none along forward.
    expect(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw)).toBeCloseTo(0.2 * width, 6);
    expect(-dx * Math.sin(v.yaw) - dz * Math.cos(v.yaw)).toBeCloseTo(0, 6);
  });

  it('a town framed lower in the view moves the target ahead of it', () => {
    const v = driftView(aim, 0);
    const f = framedTarget(v, aim, { x: 0, y: 0.1 }, 16 / 9);
    const ahead = -(f.x - aim.x) * Math.sin(v.yaw) - (f.z - aim.z) * Math.cos(v.yaw);
    expect(ahead).toBeGreaterThan(0);
  });
});

describe('the backdrop keeps its promises in source', () => {
  const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

  it('Backdrop.tsx never imports the renderer, the worker host or Three.js', () => {
    const src = read('./Backdrop.tsx');
    for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1]!;
      if (spec === './backdrop') continue; // the dynamic import that is the whole point
      expect(spec).not.toMatch(/render\/|worker\/|three|backdrop\b(?!\.css)/);
    }
    expect(src).toMatch(/import\('\.\/backdrop'\)/);
    expect(src).not.toMatch(/^import .* from '\.\/backdrop';/m);
  });

  it('only paints inline: the painted valley has no external image', () => {
    expect(read('./Painted.tsx')).not.toMatch(/<image|href=|url\(['"]?http/);
  });
});
