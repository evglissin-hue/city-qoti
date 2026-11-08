// Window boxes, as the player sees them. A home whose kit draws boxes on its own (a hand-placed
// cottage: `boxesByDefault` in content) has them until the player turns them off, so an unset
// `custom.windowBoxes` means on there and the charm and habitat points follow what is drawn.
// Grown homes take their district's look instead and only count the boxes the player chose.
import type { BuildingDef } from '@qoti/content';
import type { Building } from '../contracts';

export function windowBoxesOn(b: Building, def: BuildingDef | undefined): boolean {
  const v = b.custom?.windowBoxes;
  if (typeof v === 'boolean') return v;
  return def?.boxesByDefault === true && b.lot === undefined;
}
