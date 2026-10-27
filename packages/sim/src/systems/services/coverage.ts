// Service coverage (docs/spec/13-ledger.md, Services): the school (education, children), the tavern
// (social) and the herbalist (health). A service building covers homes whose door lies within its
// radius of its own door (straight line) while it is built, open and staffed. Each covers up to its
// capacity in residents who use it (grown-ups for the tavern, children for the school, everyone for
// the herbalist); every household goes to the nearest one with room, households in id order, like
// the wells. Supplies matter too: a tavern out of cider or a herbalist out of herbs still covers,
// at SHORT_QUALITY. Pure: reads state, never writes.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { BuildingStatus, MAP_SIZE } from '../../constants';
import type { Building, EntityId, Household, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import type { ServiceKind } from './weights';

/** Need level a covered household reaches when its service is out of supplies. */
export const SHORT_QUALITY = 60;
export const FULL_QUALITY = 100;

export interface ServiceSite {
  b: Building;
  def: BuildingDef;
  x: number;
  z: number;
  radius: number;
  capacity: number;
  /** Residents it still has room for. */
  left: number;
  quality: number;
}

/** Residents of a household who use a service. */
export function serviceUsers(state: WorldState, h: Household, kind: ServiceKind): number {
  let n = 0;
  for (const id of h.members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    if (kind === 'education' ? r.stage === 'child' : kind === 'social' ? r.stage !== 'child' : true) n++;
  }
  return n;
}

/** Open, staffed service buildings of a kind, in id order. */
export function serviceSites(state: WorldState, kind: ServiceKind): ServiceSite[] {
  const out: ServiceSite[] = [];
  for (const b of state.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || rt.paused || rt.workers.length === 0) continue;
    const def = content.buildingById.get(b.def);
    const cov = def?.coverage?.find((c) => c.kind === kind);
    if (!def || !cov) continue;
    const door = doorTile(b, def);
    const short = (rt.status & BuildingStatus.missingInput) !== 0;
    const capacity = cov.capacity ?? 60;
    out.push({
      b,
      def,
      x: door % MAP_SIZE,
      z: (door - (door % MAP_SIZE)) / MAP_SIZE,
      radius: cov.radius,
      capacity,
      left: capacity,
      quality: short ? SHORT_QUALITY : FULL_QUALITY,
    });
  }
  return out;
}

export interface Coverage {
  /** Need level per covered household id (absent: not covered). */
  quality: Map<EntityId, number>;
  /** The service building per covered household. */
  by: Map<EntityId, EntityId>;
  sites: ServiceSite[];
}

/** Which households a service reaches, and how well. */
export function serviceCoverage(state: WorldState, kind: ServiceKind): Coverage {
  const sites = serviceSites(state, kind);
  const quality = new Map<EntityId, number>();
  const by = new Map<EntityId, EntityId>();
  if (sites.length === 0) return { quality, by, sites };
  for (const h of state.households) {
    if (!h.homeId) continue;
    const home = findById(state.buildings, h.homeId);
    if (!home || home.stage !== 'built') continue;
    const users = serviceUsers(state, h, kind);
    if (users === 0) continue;
    const door = doorTile(home);
    const x = door % MAP_SIZE;
    const z = (door - x) / MAP_SIZE;
    let best: ServiceSite | null = null;
    let bestD = Infinity;
    for (const s of sites) {
      if (s.left < users) continue;
      const dx = s.x - x;
      const dz = s.z - z;
      const d = dx * dx + dz * dz;
      if (d <= s.radius * s.radius && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) continue;
    best.left -= users;
    quality.set(h.id, best.quality);
    by.set(h.id, best.b.id);
  }
  return { quality, by, sites };
}

/** Residents a service building covers now (the inspector's "serves 34 of 60"). */
export function servedBy(state: WorldState, b: Building, kind: ServiceKind): number {
  const cov = serviceCoverage(state, kind);
  const site = cov.sites.find((s) => s.b.id === b.id);
  return site ? site.capacity - site.left : 0;
}
