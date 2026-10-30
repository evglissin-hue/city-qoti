// Playtest round five: "what is this building for?" in one line, for the Build picker's cards and
// the hover label. Built from the building's own data, so it never drifts from what it does.
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import { goodName } from './format';

function list(goods: readonly [string, number][]): string {
  const names = goods.map(([g]) => goodName(g).toLowerCase());
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function methodLine(m: ProductionMethod): string | null {
  if (m.kind === 'plant') return 'Plants saplings beside the groves, so the woodcutters never run out';
  if (m.outputs.length === 0) return null;
  const out = list(m.outputs);
  switch (m.kind) {
    case 'fell':
      return `Cuts ${out} from grown trees within ${m.range ?? 8} tiles`;
    case 'farm':
      return `Grows ${out} in the fields painted around it`;
    case 'gather':
      return `Gathers ${out}`;
    default:
      return m.inputs.length ? `Makes ${out} from ${list(m.inputs)}` : `Makes ${out}`;
  }
}

function placementLine(def: BuildingDef): string | null {
  for (const r of def.placement ?? []) {
    if (r.kind === 'deposit') return `Must sit on ${r.deposit}`;
    if (r.kind === 'waterEdge') return 'Must touch the water';
    if (r.kind === 'fertility') return `Wants soil of ${r.min} or better`;
  }
  return null;
}

/** Buildings whose data does not say what they do (yet). */
const WRITTEN: Record<string, string> = {
  'cart-shed': 'Keeps a cart and its pony for the long hauls across town',
  'river-dock': 'Boats come and go with goods from down the river',
  'bath-house': 'Hot water and gossip, in that order',
  'bell-tower': 'Rings everyone home when trouble comes',
  shed: 'Keeps a few odds and ends out of the rain',
};

/** One or two short sentences on what a building is for. */
export function buildingPurpose(def: BuildingDef): string {
  const parts: string[] = [];
  const written = WRITTEN[def.id];
  if (written) parts.push(written);
  if (def.housing) {
    const { households, residents } = def.housing;
    parts.push(
      households > 1
        ? `A home for ${households} households, ${residents} folk in all`
        : `A home for a household of up to ${residents}`,
    );
  }
  const methods = (def.methods ?? []).map(methodLine).filter((l): l is string => !!l);
  if (methods.length > 0)
    parts.push(
      methods
        .slice(0, 2)
        .map((l, i) => (i ? l[0]!.toLowerCase() + l.slice(1) : l))
        .join('; or '),
    );
  for (const c of def.coverage ?? []) {
    if (c.kind === 'water') parts.push(`Water for homes within ${c.radius} tiles`);
    else if (c.kind === 'food') parts.push(`Sells food to homes within ${c.radius} tiles`);
    else if (c.kind === 'logistics')
      parts.push(`Keeps the town's goods; its porters carry them about, quickest within ${c.radius} tiles`);
    else if (c.kind === 'social') parts.push(`Somewhere to unwind for folk within ${c.radius} tiles`);
    else if (c.kind === 'health') parts.push(`Looks after the health of folk within ${c.radius} tiles`);
    else if (c.kind === 'education') parts.push(`Lessons for children within ${c.radius} tiles`);
  }
  if (def.jobs?.role === 'builder') parts.push('Builders work from here: more hands, quicker sites');
  if (def.jobs?.role === 'porter' && !def.coverage?.some((c) => c.kind === 'logistics'))
    parts.push('Its hands carry goods around town');
  if (parts.length === 0 && def.storage) parts.push(`Keeps up to ${def.storage} goods`);
  if (parts.length === 0 && def.category === 'production') parts.push('A workshop still finding its trade');
  if (parts.length === 0 && def.defense) parts.push('Helps keep the valley safe');
  if (parts.length === 0) parts.push('Makes the place look lived in');
  const where = placementLine(def);
  if (where) parts.push(where);
  return `${parts.join('. ')}.`;
}

/** The purpose line by building id, or null for an unknown id. */
export function purposeOf(id: string): string | null {
  const def = content.buildingById.get(id);
  return def ? buildingPurpose(def) : null;
}

/** Playtest round five ("firewood: it's not clear"): where a good comes from and where it goes. */
export function goodPurpose(id: string): string {
  const name = goodName(id);
  const made: string[] = [];
  const used: string[] = [];
  for (const b of content.buildings) {
    if (b.grows && !b.grows.handPlaced) continue;
    for (const m of b.methods ?? []) {
      if (m.outputs.some(([g]) => g === id) && !made.includes(b.name)) made.push(b.name);
      if (m.inputs.some(([g]) => g === id) && !used.includes(b.name)) used.push(b.name);
    }
    if (b.cost?.goods?.some(([g]) => g === id) && !used.includes('building')) used.push('building');
  }
  const parts: string[] = [];
  if (made.length)
    parts.push(
      `made at ${made
        .slice(0, 3)
        .map((m) => `the ${m.toLowerCase()}`)
        .join(', ')}`,
    );
  if (content.goodById.get(id)?.food) parts.push('folk eat it');
  if (used.length) {
    const named = used.filter((u) => u !== 'building').map((u) => `the ${u.toLowerCase()}`);
    const goes = [...(used.includes('building') ? ['building'] : []), ...named.slice(0, 3)];
    parts.push(`goes into ${goes.join(', ')}`);
  }
  return parts.length ? `${name}: ${parts.join('; ')}.` : name;
}
