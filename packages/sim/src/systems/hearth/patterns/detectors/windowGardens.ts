// Window Gardens: `homes` (3) or more homes in a row, every one with window boxes (customized),
// side by side on one street: facing the same way, their doors on the same line, at most `gap`
// tiles between neighbors. Anchored on the first home's north-west tile.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { Building, Rect } from '../../../../contracts';
import { buildingRect, isHomeDef } from '../../../../conditions/geo';
import { doorTile } from '../../../movement/api';
import { type Detector, param, type SiteCandidate } from '../shared';

const S = MAP_SIZE;

interface Row {
  key: number;
  along: number;
  r: Rect;
  b: Building;
}

export const windowGardens: Detector = (state, def) => {
  const needHomes = param(def, 'homes', 3);
  const gap = param(def, 'gap', 1);
  const rows: Row[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || b.custom?.windowBoxes !== true) continue;
    if (!isHomeDef(content.buildingById.get(b.def))) continue;
    const door = doorTile(b);
    const dx = door % S;
    const dz = (door - dx) / S;
    const r = buildingRect(b);
    // Facing north or south: a row along x on the door's line; east or west: along z.
    const alongX = b.rot % 2 === 0;
    rows.push({ key: b.rot * S + (alongX ? dz : dx), along: alongX ? r[0] : r[1], r, b });
  }
  rows.sort((a, b) => a.key - b.key || a.along - b.along || a.b.id - b.b.id);
  const out: SiteCandidate[] = [];
  let run: Row[] = [];
  const flush = () => {
    if (run.length >= needHomes) {
      const first = run[0]!;
      out.push({ anchor: first.r[1] * S + first.r[0], members: run.map((x) => x.b.id), tiles: [] });
    }
    run = [];
  };
  for (const row of rows) {
    const prev = run[run.length - 1];
    if (prev) {
      const alongX = prev.b.rot % 2 === 0;
      const end = alongX ? prev.r[2] : prev.r[3];
      if (row.key !== prev.key || row.along - end - 1 > gap) flush();
    }
    run.push(row);
  }
  flush();
  return out;
};
