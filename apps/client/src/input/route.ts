import { MAX_ROAD_TILES } from '@qoti/sim';

/**
 * Proposes a road route from a to b: straight when they share a row or column, otherwise an
 * L that runs along the longer leg first. Capped at the sim's 256-tile limit.
 */
export function proposeRoute(a: [number, number], b: [number, number]): [number, number][] {
  const tiles: [number, number][] = [];
  const [ax, az] = a;
  const [bx, bz] = b;
  const sx = Math.sign(bx - ax);
  const sz = Math.sign(bz - az);
  const xFirst = Math.abs(bx - ax) >= Math.abs(bz - az);
  let x = ax;
  let z = az;
  tiles.push([x, z]);
  const walk = (alongX: boolean) => {
    if (alongX) {
      while (x !== bx && tiles.length < MAX_ROAD_TILES) {
        x += sx;
        tiles.push([x, z]);
      }
    } else {
      while (z !== bz && tiles.length < MAX_ROAD_TILES) {
        z += sz;
        tiles.push([x, z]);
      }
    }
  };
  walk(xFirst);
  walk(!xFirst);
  return tiles;
}
