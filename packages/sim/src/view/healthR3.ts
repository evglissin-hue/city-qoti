// R3E: what the R3 health kinds (view/health.ts) know from content alone. A supplied piece's good
// needs a maker or a neighbor; an outlet piece needs an outlet that can sell Treats; a Town Book page
// needs a pattern, a Treat that can be made, a host that exists. Content never changes at runtime, so
// each answer is worked out once, on first use, and kept at module level. Pure reads of `content`:
// nothing here touches state, and nothing is cached against it.
import { content, type CustomDef, type DecorDef, type SpecialtyDef } from '@qoti/content';

/** Every good some building def, trade or master can make, by good id (found once). */
let made: ReadonlySet<string> | undefined;
/** Every good a neighbor sells, by good id (found once). */
let bought: ReadonlySet<string> | undefined;

function makeable(): ReadonlySet<string> {
  if (made) return made;
  const out = new Set<string>();
  for (const d of content.buildings) for (const m of d.methods ?? []) for (const [g] of m.outputs) out.add(g);
  for (const t of content.trades) {
    if (t.makes) out.add(t.makes);
    for (const [g] of t.method?.outputs ?? []) out.add(g);
  }
  // A master's good is made in the trade's own building while a master is on the crew; it counts only
  // when the master's trade or specialized building exists in content.
  for (const m of content.masters) {
    if (!content.tradeById.has(m.of) && !content.buildingById.has(m.of)) continue;
    for (const [g] of m.method?.outputs ?? []) out.add(g);
  }
  made = out;
  return out;
}

function neighborSold(): ReadonlySet<string> {
  if (bought) return bought;
  const out = new Set<string>();
  for (const n of content.neighbors) for (const [g] of n.sells) out.add(g);
  bought = out;
  return out;
}

/** True when the good can come to this town: some maker can be built, or a neighbor sells it. */
export function goodObtainable(good: string): boolean {
  return makeable().has(good) || neighborSold().has(good);
}

let outletTreats: boolean | undefined;

/** True when some outlet def can sell Treats to the round (the tavern; a market stall or shop whose shelf takes them). */
export function treatsOutletExists(): boolean {
  if (outletTreats !== undefined) return outletTreats;
  outletTreats = content.buildings.some((d) => {
    const tags = d.tags ?? [];
    if (tags.includes('tavern')) return true;
    if (!tags.includes('market')) return false;
    if (!tags.includes('shop')) return true;
    const trade = content.tradeById.get('shop');
    return !trade?.sells || trade.sells.some((level) => level.includes('treats'));
  });
  return outletTreats;
}

let wellExists: boolean | undefined;

/** True when some building def is a well (a well-kind piece draws on one within its radius). */
export function wellDefExists(): boolean {
  if (wellExists !== undefined) return wellExists;
  wellExists = content.buildings.some((d) => (d.tags ?? []).includes('well'));
  return wellExists;
}

/** Why a supplied decor def can never be supplied from content alone, or null when it can (or needs none). */
export function supplyUnsuppliable(def: DecorDef): string | null {
  const s = def.supply;
  if (!s) return null;
  switch (s.kind) {
    case 'nightly':
    case 'evening':
    case 'season':
      if (!s.good || !content.goodById.has(s.good))
        return `${def.id} wants ${s.good ?? 'a good'} that content does not have`;
      return goodObtainable(s.good)
        ? null
        : `${def.id} wants ${s.good}, which no maker can be built to make and no neighbor sells`;
    case 'outlet':
      return treatsOutletExists() ? null : `${def.id} wants an outlet and no outlet def can sell Treats`;
    case 'well':
      return wellDefExists() ? null : `${def.id} wants a well and no well def exists`;
    default:
      return `${def.id} has a supply kind the check does not know`;
  }
}

/** True when a good (by id) is in the Treats family. */
function isTreatId(good: string): boolean {
  return content.goodById.get(good)?.family === 'treats';
}

/** Why a specialty can never be found, or null when it can. */
export function specialtyUnproducible(s: SpecialtyDef): string | null {
  if (!content.patternById.has(s.pattern))
    return `${s.id} names the pattern ${s.pattern}, which content does not have`;
  if (!content.goodById.has(s.good)) return `${s.id} names the good ${s.good}, which content does not have`;
  if (!isTreatId(s.good)) return `${s.id} names ${s.good}, which is not a Treat`;
  if (!goodObtainable(s.good))
    return `${s.id} names ${s.good}, which no maker can make and no neighbor sells`;
  if (!treatsOutletExists()) return `${s.id} needs an outlet that sells Treats and none can be built`;
  return null;
}

/** Why a custom can never be found, or null when it can. */
export function customUnproducible(c: CustomDef): string | null {
  if (c.host !== undefined && !content.buildingById.has(c.host))
    return `${c.id} names the host ${c.host}, which content does not have`;
  if (c.pattern !== undefined && !content.patternById.has(c.pattern))
    return `${c.id} names the pattern ${c.pattern}, which content does not have`;
  if (c.kind === 'supply') {
    if (!c.supply) return `${c.id} is a supply custom with no supply kind`;
    if (!content.decor.some((d) => d.supply?.kind === c.supply))
      return `${c.id} names the supply ${c.supply}, which no piece has`;
  }
  return null;
}

/** Why a Town Book page def (a specialty or custom id) cannot be produced, or null; unknown ids are unproducible. */
export function pageUnproducible(id: string): string | null {
  const s = content.specialtyById.get(id);
  if (s) return specialtyUnproducible(s);
  const c = content.customById.get(id);
  if (c) return customUnproducible(c);
  return `${id} is neither a specialty nor a custom`;
}

/** Every content page that cannot be produced, in content order: [id, why]. */
export function unproducibleContentPages(): [string, string][] {
  const out: [string, string][] = [];
  for (const s of content.specialties) {
    const why = specialtyUnproducible(s);
    if (why) out.push([s.id, why]);
  }
  for (const c of content.customs) {
    const why = customUnproducible(c);
    if (why) out.push([c.id, why]);
  }
  return out;
}
