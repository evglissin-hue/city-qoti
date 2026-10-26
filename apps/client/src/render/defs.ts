// C4E: building defs as the renderer draws them. Content's def when there is one; otherwise, for a
// def content does not know yet (village buildings whose content lands with another track, or the
// debug village showcase), a stand-in from the art kit of the same id and the footprint it is drawn
// for. The sim never sees stand-ins: they only let the art be drawn and reviewed.
import { kitById } from '@qoti/art';
import { content, type BuildingDef } from '@qoti/content';

const standIns = new Map<string, BuildingDef | null>();

/** Tags a stand-in carries so overlays treat it sensibly (homes, outlets, storage). */
const STAND_IN_TAGS: Record<string, string[]> = {
  cottage: ['home'],
  shop: ['home', 'outlet'],
  townhouse: ['home'],
  'trading-post': ['trading-post'],
};

export function drawDef(defId: string): BuildingDef | undefined {
  const def = content.buildingById.get(defId);
  if (def) return def;
  let s = standIns.get(defId);
  if (s === undefined) {
    const kit = kitById.get(defId);
    s =
      kit?.kind === 'building' && kit.footprint
        ? {
            id: defId,
            name: defId.replace(/-/g, ' '),
            lane: 'shared',
            category: 'production',
            size: kit.footprint.size,
            entrance: kit.footprint.entrance,
            art: { kit: defId },
            tags: STAND_IN_TAGS[defId] ?? [],
          }
        : null;
    standIns.set(defId, s);
  }
  return s ?? undefined;
}
