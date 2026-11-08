// Window boxes, as the player sees them: what is drawn is what counts. P1: hand-placed kits draw no
// boxes until someone adds them, so an unset `custom.windowBoxes` is off; a def may still opt in with
// `boxesByDefault`. Grown homes take their district's look and only count the boxes chosen for them.
import type { BuildingDef } from '@qoti/content';
import type { Building } from '../contracts';

export function windowBoxesOn(b: Building, def: BuildingDef | undefined): boolean {
  const v = b.custom?.windowBoxes;
  if (typeof v === 'boolean') return v;
  return def?.boxesByDefault === true && b.lot === undefined;
}
