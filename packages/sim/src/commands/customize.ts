// build.customize (C3B): paint and details, docs/spec/10-world-and-building.md, Customization
// phase 1. Swatch ids come from content (packages/content/src/swatches.ts), never from art. Each
// field is optional; null clears it back to the kit default (false turns a detail off). Any change marks the building
// handmade. Window boxes count as a small flower piece for charm, so the charm chunk is marked.
import { content, type SwatchGroup } from '@qoti/content';
import { MAX_SIGN_CHARS } from '../constants';
import type { BuildingCustom, RejectReason } from '../contracts';
import { buildingRect } from '../conditions/geo';
import { findById } from '../state/entities';
import { markCharmDirty, markCharmSoon } from '../systems/hearth/charm/dirty';
import { buildingView } from '../view';
import type { HandlerFor } from './util';

const SWATCH_FIELDS: readonly [field: 'wall' | 'roof' | 'roofMaterial' | 'accent', group: SwatchGroup][] = [
  ['wall', 'wall'],
  ['roof', 'roof'],
  ['roofMaterial', 'roofMaterial'],
  ['accent', 'accent'],
];
const FLAG_FIELDS = ['windowBoxes', 'shutters', 'chimney'] as const;
const KNOWN = new Set<string>([
  'wall',
  'roof',
  'roofMaterial',
  'accent',
  'windowBoxes',
  'shutters',
  'chimney',
  'sign',
]);

const SWATCHES = new Map<SwatchGroup, Set<string>>();
for (const s of content.swatches) {
  let set = SWATCHES.get(s.group);
  if (!set) SWATCHES.set(s.group, (set = new Set()));
  set.add(s.id);
}

/** Printable sign text: no control characters, trimmed, 1 to MAX_SIGN_CHARS long. */
function signText(v: string): string | null {
  const s = v.trim();
  if (s.length === 0 || s.length > MAX_SIGN_CHARS) return null;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return null;
  }
  return s;
}

function validateCustom(custom: BuildingCustom): RejectReason | null {
  // Unknown fields are ignored (never stored); at least one known field must be present.
  let present = 0;
  for (const k of KNOWN) if ((custom as Record<string, unknown>)[k] !== undefined) present++;
  if (present === 0) return 'INVALID';
  for (const [field, group] of SWATCH_FIELDS) {
    const v = custom[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || !SWATCHES.get(group)?.has(v)) return 'INVALID';
  }
  for (const field of FLAG_FIELDS) {
    const v = custom[field];
    if (v !== undefined && v !== null && typeof v !== 'boolean') return 'INVALID';
  }
  const sign = custom.sign;
  if (sign !== undefined && sign !== null && (typeof sign !== 'string' || signText(sign) === null))
    return 'INVALID';
  return null;
}

export const customize: HandlerFor<'build.customize'> = {
  type: 'build.customize',
  validate(state, _seat, cmd) {
    if (typeof cmd.custom !== 'object' || cmd.custom === null || Array.isArray(cmd.custom)) return 'INVALID';
    const bad = validateCustom(cmd.custom);
    if (bad) return bad;
    return findById(state.buildings, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    const custom: Record<string, string | boolean> = { ...(b.custom ?? {}) };
    const before = custom.windowBoxes === true;
    // Fixed field order, so the stored object has the same key order on every machine.
    for (const [field] of SWATCH_FIELDS) apply1(custom, field, cmd.custom[field]);
    for (const field of FLAG_FIELDS) apply1(custom, field, cmd.custom[field]);
    const sign = cmd.custom.sign;
    apply1(custom, 'sign', typeof sign === 'string' ? signText(sign) : sign);
    const ordered: Record<string, string | boolean> = {};
    let fields = 0;
    for (const k of KNOWN) {
      if (custom[k] === undefined) continue;
      ordered[k] = custom[k]!;
      fields++;
    }
    if (fields > 0) b.custom = ordered;
    else delete b.custom;
    b.handmade = true;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
    if ((ordered.windowBoxes === true) !== before) {
      markCharmDirty(state, buildingRect(b));
      markCharmSoon(state);
    }
  },
};

function apply1(
  custom: Record<string, string | boolean>,
  field: string,
  v: string | boolean | null | undefined,
): void {
  if (v === undefined) return;
  if (v === null) delete custom[field];
  else custom[field] = v;
}
